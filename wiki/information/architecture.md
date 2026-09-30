# Architecture

Five source files and one tool generator. There is no build step: the tool surface is
generated at boot from the set, not compiled into source.

```
src/
  index.js     entry point: picks a transport, owns the port, the fork and the process
  app.js       the express application: the routes, the Host guard, the body limit
  server.js    builds the McpServer, registers every tool, exports listTools()
  content.js   the set root: CONTENT_DIR
  cli.js       the CLI: help, version, tools, serve
  version.js   reads the version out of package.json at import
  tools/
    from-content.js  walks content/ and builds the whole tool surface at boot
content/       the published set
Dockerfile     the container image: node src/index.js, MCP_TRANSPORT selects the transport
```

## Entry point and transports

`src/index.js` reads `MCP_TRANSPORT` and serves either way:

* **stdio** (default) — one `McpServer` connected to a `StdioServerTransport` for the
  life of the process.
* **streamable HTTP** — an [express](https://expressjs.com) application built by
  `src/app.js`, exposing `GET /healthz` and `POST /mcp`.

The split is deliberate. `src/app.js` builds the app and returns it; **it does not
listen**. `src/index.js` owns the port, the interface, the fork, the drain, and the
process lifetime. A file that both builds the app and binds a port cannot be reasoned
about, or tested, without opening one.

The HTTP transport is **stateless**: a fresh `McpServer` and transport are built for
each request and closed when the response closes. That is deliberate — `McpServer`
holds per-connection state, so hoisting one to module scope would leak state between
unrelated callers.

### The route table, and the Host guard

`src/app.js` maps exactly two routes, and refuses everything else in the JSON-RPC
envelope:

| Request | Answer |
|---|---|
| `GET /healthz` | `200` with `{ status, server, version }` — no session, no tool |
| `POST /mcp` | The MCP endpoint, a fresh server per request |
| any other method on `/mcp` | `405` / `-32000`, `… is not supported in stateless mode` |
| anything else | `404` / `-32601`, naming both routes this server serves |

`MCP_ALLOWED_HOSTS` is applied by the MCP SDK's own `hostHeaderValidation`, mounted as
ordinary express middleware **above the body parser and above every route**,
`/healthz` included. A request that fails the `Host` check must not be able to reach a
handler at all.

**Unset, empty, or separators-only, the middleware is not mounted at all** and every
`Host` header is served, with a line on stderr saying so. The check is skipped rather
than guessed at: a wrong allow-list silently refusing every request is a worse failure
than an absent one. Full reference in
[`../environments/env.md`](../environments/env.md).

### stdout belongs to the protocol

On stdio, stdout **is** the JSON-RPC channel. Server-side logging goes to stderr and
`serve` prints nothing of its own; only CLI commands write to stdout. A `console.log`
on the server path corrupts the stream, and the client reports a parse error that
points nowhere useful.

## One port, several processes

On the HTTP transport the process that starts is a **`node:cluster` primary**. It
binds nothing; it forks workers onto the one `PORT` and then waits. Every worker binds
that same port through the cluster's shared handle, and the round-robin scheduler
decides which one gets a connection. No `SO_REUSEPORT` is set by hand and no sticky
session logic is written, because the scheduler already knows which connection is next
and there is nothing to keep in step — the transport is stateless, so there are no
sessions to route by.

The count is `MCP_CLUSTER_WORKERS`, or `availableParallelism()` when it is unset: a
container with two CPUs gets two workers, and a laptop does not get sixteen. A count
of `1` forks nothing at all, which is what makes the difference between a forked and
an unforked run attributable to the fork rather than to the transport.

Because the primary does not listen, the startup lines in a log describe ports that
are genuinely open — one per worker, from the processes that opened them. A primary
that logged a listening line of its own would be claiming a port it does not hold.

Two shutdown paths, and the ordering in each is the point:

* **`SIGINT` / `SIGTERM`** reaches the primary, which **relays it to every worker and
  waits for the last one to go** before exiting. Each worker closes its listener,
  closes its own in-flight requests deliberately, and only then exits. A worker that
  relayed a signal without doing that would print a drain it never performed.
* **The primary dies outright** — `kill -9`, a crash — and a worker notices the closed
  IPC channel and exits. Without that, a worker would keep the port and keep answering
  requests nobody is supervising, and the next server to start would fail on
  `EADDRINUSE` against a process nobody remembers starting.

**stdio never forks.** A worker would inherit the process's stdout, and stdout is the
JSON-RPC channel there.

## The tool layer

There is no per-tool source file. `src/tools/from-content.js` walks `content/` once at
import and builds the entire surface from what it finds: one tool per markdown file, named
after the file's basename with `.md` dropped and kebab turned to snake, described by that
file's own frontmatter `description`.

```js
for (const path of markdownFiles()) {
  const name = toolNameFor(path);            // roblox/security/trust-boundaries.md -> trust_boundaries
  const text = readFileSync(join(CONTENT_DIR, path), "utf8");

  tools.push({
    config: { name, description: parseFrontmatter(text).description },
    handler: async () => ({ content: [{ type: "text", text }] }),
  });
}
```

The folder is dropped, which keeps the names a caller actually types short. The cost is
that two folders holding the same filename would collide — so the builder treats that as a
startup error rather than letting the second file silently shadow the first. It also fails
the process on a name that is not a usable MCP tool name, and on a file with no frontmatter
`description`, because such a file would publish as a tool a client cannot route on.

`src/server.js` collects the generated modules into one `TOOL_MODULES` array and registers
each with the three-argument form:

```js
const TOOL_MODULES = Object.freeze(CONTENT_TOOLS);

for (const { config, handler } of TOOL_MODULES) {
  server.tool(config.name, config.description, handler);
}
```

There is no schema argument and no branch on one, because no generated tool declares a
schema. The set is read into memory at boot, so a call is a map lookup: no filesystem I/O
happens on the read path.

`NAME_OVERRIDES` in that module is the escape hatch for a basename that cannot survive
derivation. This set needs no entry today; the mechanism stays so the next set that does
need one does not have to invent it.

## Reading from the set

`CONTENT_DIR` in `src/content.js` is the only place the set root is defined, and the
generator resolves every read from a path it walked itself — so containment is a property
of the constant rather than of anything a caller passed in.

There is no traversal defence, and the reason is worth being precise about: it is not
weaker than the check that used to be here. That check existed because a tool accepted a
`path` from a caller and had to refuse a `..` segment in it. No tool accepts an argument
now, so there is nothing for a caller to traverse with, and no second way to reach the
filesystem from a handler. The old `src/content.js` kept `readSetFile` and a
`..`-rejecting check with no caller left; it was deleted rather than left behind as a
defence that reads as load-bearing to the next person who finds it.

## Authentication

There is none. No tool in this repository reads a credential, and none opens a socket.

The template this repository was scaffolded from took one server-wide `API_KEY` and read
it inside the handler of each tool that needed it. That pattern is still recorded in
[`.agents/rules/secrets.md`](../../../.agents/rules/secrets.md) for a tool that does
need one — the requirement is to read it at call time rather than at import, and never to
make registration depend on it.

## The parity guarantee

`src/server.js` holds the only tool list. `listTools()` derives name/description pairs
from the same `TOOL_MODULES` array used for registration, and `src/cli.js` prints that
rather than keeping a list of its own.

`test/server.test.js` asserts that what the CLI would print matches what an MCP client
receives from `tools/list`, so the two surfaces cannot drift apart without failing the
suite.

## Related pages

* [`overview.md`](overview.md) — what this project is.
* [`../environments/setup.md`](../environments/setup.md) — running it.
* [`../environments/docker.md`](../environments/docker.md) — the container image.
