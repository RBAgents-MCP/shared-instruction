# Environment Variables

Five variables, all optional. The server starts with none of them set and answers
every request.

| Variable | Default | Read by | Effect |
|---|---|---|---|
| `MCP_TRANSPORT` | `stdio` | `src/index.js` | `stdio` or `http` (`streamable-http` is accepted too). |
| `PORT` | `3000` | `src/index.js` | The port the HTTP transport listens on. Ignored on stdio. |
| `HOST` | `0.0.0.0` | `src/index.js` | The interface the HTTP transport binds. `127.0.0.1` binds loopback only. Ignored on stdio. |
| `MCP_ALLOWED_HOSTS` | unset | `src/app.js` | Comma-separated `Host` allow-list. **Unset or empty means the guard is off.** Ignored on stdio. |
| `MCP_CLUSTER_WORKERS` | one per available CPU | `src/index.js` | How many worker processes fork onto `PORT` on the HTTP transport. **`1` forks nothing at all.** Ignored on stdio. |

## There is no `API_KEY`

The template this repository was scaffolded from took one key for tools that reached an
external service. Nothing here reaches an external service, so there is no key, and no
tool reads a credential.

If a future tool needs one, the contract for that is
[`../../../.agents/rules/secrets.md`](../../../.agents/rules/secrets.md): check
`process.env` **inside the handler**, never at module scope, and never as a condition on
whether the tool is registered.

## `MCP_TRANSPORT` and `PORT`

```bash
# stdio (default)
npm start

# streamable HTTP on 3000
npm run start:http

# streamable HTTP on another port
MCP_TRANSPORT=http PORT=8080 node src/index.js

# the same, through the CLI
rbagents-shared-instruction serve --http --port 8080
```

The CLI's `serve` command sets both variables from its flags, so `--http`, `--stdio`,
and `--port` are equivalent to exporting them.

## `HOST`

```bash
# every interface (the default, and what a published container port needs)
MCP_TRANSPORT=http node src/index.js

# loopback only
MCP_TRANSPORT=http HOST=127.0.0.1 node src/index.js
```

`listen(port)` with no host already binds every interface on this platform, so the
default here changes no behaviour. Naming it makes the decision visible in one
place instead of leaving it inside a call site, and gives a deployment a way to
take it back.

## `MCP_ALLOWED_HOSTS`

```bash
# guard off - the default, and the one to think about
MCP_TRANSPORT=http node src/index.js

# guard on: only these hostnames are answered
MCP_TRANSPORT=http MCP_ALLOWED_HOSTS=example.test,localhost node src/index.js
```

A comma-separated list of hostnames, compared against the `Host` header of every
request before any route runs. A request that does not match is refused `403`.
Comparison is on the hostname, so `example.test` also covers `example.test:3000`;
there is no need to write the port. An IPv6 address is written bracketed, exactly as
the `Host` header carries it: `[::1]`.

**An empty value means the guard is off.** `MCP_ALLOWED_HOSTS=`, an empty string,
a value of nothing but commas and spaces, and an unset variable are the same thing.
When that is the case the allow-list middleware is **not mounted at all** — the check
is skipped rather than guessed at, because a list that silently refuses every request
is a worse failure than no list — and the server writes one line to stderr saying so.
The safe-looking default is the unsafe one, and that is the single fact most likely to
be misread about this variable.

That line is written **before** the port is bound, not after. An operator reading a
log with no startup line in it still learns that no allow-list is in force, and a
control that is off silently reads as present.

Why it is not on by default: the MCP SDK's own Express application applies Host
validation automatically, but **only when the server is on loopback**. This
repository binds all interfaces unless `HOST` says otherwise, and a container
publishes a port — exactly the deployment where the inherited default would have
switched itself off. So the check is applied here explicitly, and left to the
operator to enable.

This is not authentication. It narrows who may address the server; it does not
decide who may read the set, and no tool in this repository takes a credential.

## `MCP_CLUSTER_WORKERS`

```bash
# the default: one worker per CPU the process was given
MCP_TRANSPORT=http node src/index.js

# four workers on one port
MCP_TRANSPORT=http MCP_CLUSTER_WORKERS=4 node src/index.js

# no forking at all - one process, one listener
MCP_TRANSPORT=http MCP_CLUSTER_WORKERS=1 node src/index.js
```

On the HTTP transport the process that starts is a **primary**: it forks workers and
then does nothing else. Every worker binds the same `PORT`, and the kernel's shared
handle plus the round-robin scheduler decide which one gets a connection. There is no
session to keep in step, because the transport is stateless — so there is nothing to
route by, and nothing for a worker to share with another.

The default is `availableParallelism()`, not a constant: a container with two CPUs gets
two workers, and a laptop does not get sixteen. Anything that is not an integer of at
least `1` — unset, empty, `0`, a word — is ignored rather than honoured, because a
worker count of zero would mean a server that answers nothing.

`MCP_CLUSTER_WORKERS=1` forks **nothing**: one process serves, exactly as it did
before this existed. It is the setting that makes the difference between a forked and
an unforked run attributable to the fork rather than to the transport.

A worker that exits unexpectedly is replaced, but not forever — a server that cannot
start its workers says so and stops rather than respawning into a crash loop nobody is
watching.

Shutdown: `SIGINT` or `SIGTERM` reaches the primary, which **relays it to every worker
and waits for the last one to go** before exiting. The workers drain their own
in-flight requests first. A worker whose primary dies outright — `kill -9` — notices
the closed IPC channel and exits rather than holding the port for whoever starts next.

On **stdio** this variable is ignored entirely: a worker would inherit the process's
stdout, and stdout is the JSON-RPC channel there.

## Related pages

* [`setup.md`](setup.md) — installing and running both modes.
* [`docker.md`](docker.md) — the container image, where `MCP_ALLOWED_HOSTS` matters most.
* [`../information/overview.md`](../information/overview.md) — what the project is.
