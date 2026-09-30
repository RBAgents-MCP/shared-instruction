---
name: agent-wiki-context-repository-map
description: Orientation for rbagents-shared-instruction - what lives where, how to build and test it, the two surfaces, and the gotchas that bite first.
---

# Repository Map

Read this before touching anything in `rbagents-shared-instruction`.

## What this repository is

An MCP server and a CLI over one implementation, serving the Roblox development set read-only. Node.js 20+,
ESM (`"type": "module"`), **no build step** - the published package ships `src/` and Node
runs it directly.

* Remote: `RBAgents-MCP/shared-instruction`, default branch `master`.
* Bins: `rbagents-shared-instruction` (CLI) and `rbagents-shared-instruction-server` (MCP server).

## Layout

```
AGENTS.md                     entry point, connector bootstrap, trigger table
package.json                  both bins, no build step
Dockerfile                    the container image; MCP_TRANSPORT selects the transport
.dockerignore                 the build context - everything the image does not need
content/                      the published set - the product
  index/                      the routing index
src/
  index.js                    entry point; picks stdio or streamable HTTP, owns the port, the worker fork and the process
  app.js                      the express application: routes, Host guard, body limit; never listens, never forks
  server.js                   builds the McpServer and registers every tool; exports listTools()
  content.js                  the set root: CONTENT_DIR
  cli.js                      the CLI: help, version, tools, serve
  version.js                  reads version out of package.json at import
  tools/
    from-content.js           walks content/ and builds the whole tool surface at boot
test/
  server.test.js              files-to-tools bijection, derived names, no input schema, byte-for-byte serving, surface parity
  http.test.js                the HTTP transport over a real spawned process and socket
wiki/                         human documentation
.agents/                      this set - rules, agent wiki, memory, indexes
```

## Commands

| Command | What it does |
|---|---|
| `npm install` | Installs `@modelcontextprotocol/sdk`, `express` and `zod`. |
| `npm test` | `node --test`. The whole suite; there is no watch mode. `http.test.js` spawns real servers, so it takes seconds rather than milliseconds. |
| `npm run cli -- tools` | Lists registered tools through the CLI surface. |
| `npm start` | Serves over stdio. |
| `npm run start:http` | Serves over streamable HTTP on `PORT` (default 3000). |
| `npm run inspect` | MCP Inspector against the stdio server. |
| `docker build -t rbagents-shared-instruction .` | Builds the container image. Not run as part of any change that adds it — the image is written-and-untested. |

## Environment variables

| Variable | Read by | Effect |
|---|---|---|
| `MCP_TRANSPORT` | `src/index.js` | `stdio` (default) or `http`. |
| `PORT` | `src/index.js` | HTTP port, default `3000`. |
| `HOST` | `src/index.js` | HTTP bind address, default `0.0.0.0`. `127.0.0.1` binds loopback only. |
| `MCP_ALLOWED_HOSTS` | `src/app.js` | Comma-separated `Host` allow-list on the HTTP transport. Off when unset, and the server says so on stderr at startup. |
| `MCP_CLUSTER_WORKERS` | `src/index.js` | HTTP workers forked onto `PORT`. `1` forks nothing; unset means one per available CPU. Ignored on stdio. |

There is no `API_KEY`. Nothing here reaches an external service.

## The two surfaces

`src/server.js` holds the only tool list. `src/cli.js` imports `listTools()` from it
rather than keeping its own, and `test/server.test.js` asserts that what the CLI would
print matches what an MCP client receives from `tools/list`. Adding a tool in one place
therefore adds it in both, and there is no way to add it to only one without failing the
suite.

## Gotchas

* **stdout is the protocol.** On stdio, a `console.log` anywhere on the server path
  corrupts the JSON-RPC stream. Log to stderr. Only CLI commands print.
* **The set is the tool surface.** Adding a markdown file under `content/` adds a
  tool, named from its basename. There is no per-tool source file and nothing to
  register — `src/tools/from-content.js` builds the array and `src/server.js` freezes
  it. A file with no frontmatter `description:` fails the process at boot.
* **There is no path into `content/`, and no traversal check, on purpose.** No tool
  takes an argument, so there is nothing to traverse with. Do not reintroduce a
  `readSetFile` or a caller-supplied path as a convenience; that would undo the
  structural read-only property.
* **A fresh `McpServer` per HTTP request.** `src/app.js` builds and closes one per
  request because `McpServer` holds per-connection state. Do not hoist it to module
  scope.
* **`src/app.js` builds the app; `src/index.js` binds the port.** Do not merge them and
  do not call `listen()` from `src/app.js` - a factory that also opens a socket cannot
  be reasoned about, or tested, without opening one.
* **The HTTP process is a cluster primary that does not listen.** It forks workers and
  waits; every worker binds the one `PORT`. Do not give the primary a startup line of
  its own, and do not fork on stdio - a worker would inherit the JSON-RPC channel.
  A worker must keep `process.on("disconnect", ...)` or it outlives a `kill -9` of the
  primary, holding the port against the next run.
* **The Host allow-list is off when unset.** `MCP_ALLOWED_HOSTS` empty, or set to
  nothing but separators, means the SDK's `hostHeaderValidation` middleware is **not
  mounted at all** and every `Host` header is accepted - the safe-looking default and
  the unsafe one. The SDK only applies this automatically on loopback, and a container
  is the case that needs it. There is no shim: the middleware is mounted natively, so
  do not reintroduce a stand-in response object.
* **`content/` is the product, not a source folder.** Every file in it is served
  verbatim on the next boot, with its frontmatter intact. `src/` is local; a change to
  `content/` changes what every consuming repository reads.
* **Do not add a write path.** The argument-free read-only surface is the property a
  consuming repository depends on. See
  [`../../rules/tool-authoring.md`](../../rules/tool-authoring.md).
* **`version.js` reads `package.json` at import** via a path relative to `src/`. Moving
  it breaks the version without failing a test.

## Where the conventions come from

Branching, commits, pull requests, the task workflow and the creators are **not** in
this repository. They are served by the `lxagents-agents-base` connector and read as
`agents://` resources. This repository carries only what is its own.
