---
name: memory-tasks-http-transport-container
description: Task record for build/http-transport-container - harden the HTTP transport this repository already has and add a container image. Entries appended as the work lands.
---

# Task — HTTP transport and container

Branch: `build/http-transport-container`, off `master`.

The premise the request started from was wrong in a way that shaped the whole task:
this repository **already has** an HTTP transport. `src/index.js` reads
`MCP_TRANSPORT` and, on `http`, serves `GET /healthz` and `POST /mcp` over
`StreamableHTTPServerTransport` with `node:http`. So this task configures that
transport and adds a container; it does not add a second one.

**Decided by the owner before any code was written:** keep
`StreamableHTTPServerTransport`. No `express`, no `src/http.js`, no
`SSEServerTransport` — the SDK deprecates it in favour of what already runs here.
The Dockerfile entrypoint is `node src/index.js` with `MCP_TRANSPORT=http`.

**Not decided, and not assumed:** delivery (no pull request without asking), the
version bump (needs the owner; the branch collides with `feat/per-file-tools` on
`package.json`), and whether anyone builds the image.

## Baseline

`npm install` then `npm test` on `master`: **12 tests, 12 pass, 0 fail**, all in
memory in `test/server.test.js`. None starts a process or opens a socket, so a green
baseline said nothing about the HTTP path. (The plan predicted 10 tests; it is 12.)

## Entries

### S1, S2, S3 — the container files

`Dockerfile`, `.dockerignore`, and `wiki/environments/docker.md` are written, plus
the `project-wiki-index.md` row in the same commit.

`FROM node:22-alpine`, `WORKDIR /srv`, `npm ci --ignore-scripts --omit=dev`,
`COPY src ./src`, `COPY content ./content`, `EXPOSE 3000`, `USER node`,
`ENTRYPOINT ["node", "src/index.js"]`. Every path `COPY`ed exists in this
repository. The entrypoint serves **stdio** unless `MCP_TRANSPORT` says otherwise,
which is why the image does not serve HTTP by itself.

`.dockerignore` keeps patterns for `.github/` and `compose.yaml`, which this
repository does not have — a pattern for an absent path costs nothing.

**No Docker command was run.** Not `build`, not `run`, not `version`. `docker.md`
says the image has never been built, in those terms, and retiring that sentence is
the owner's call.

### S4 and the documentation sweep

Every pre-existing document that records what this repository contains was updated
to include the image: `README.md` (container row in the transport table),
`wiki/environments/setup.md` (both run forms), `wiki/information/architecture.md`
and `overview.md`, `.agents/wiki/context/repository-map.md`,
`.agents/rules/repository.md`, and
[`.agents/memory/state/repository-state.md`](state/repository-state.md).

`setup.md`'s "no environment variable to configure" was already false before this
branch — `MCP_TRANSPORT` and `PORT` existed — and this branch adds two more. It was
reworded rather than left to grow more wrong.

`AGENTS.md`'s "none opens a socket" needed no edit: no tool was added, none gained an
argument, and the only socket is the listener `src/index.js` already had.

### S5 — the Host allow-list

`MCP_ALLOWED_HOSTS` is parsed into a trimmed, non-empty list and, when it is
non-empty, checked before the body parser and before any route. When it is empty,
nothing is applied and the process writes exactly one line to **stderr** saying the
allow-list is off. It matches on hostname, so `example.test` also answers
`example.test:3000`.

**The middleware is Express-shaped and this server is not.** `hostHeaderValidation`
refuses with `res.status(code).json(body)` and hands on with `next()`, neither of
which `node:http` provides. It is wrapped in `hostGuard()`, which supplies the two
methods the middleware actually calls and a no-op next. The guard is the SDK's; only
the response writer is ours — which is what let the owner's decision to drop
`express` cost nothing here. The plan assumed the middleware would drop onto
`node:http` unchanged, and it does not.

`README.md` said "No key, no environment variable, no configuration." That sentence
is replaced, not deleted: the exception is stated, the **empty value means the guard
is off** is the load-bearing clause, and it points at `wiki/environments/env.md`.
`env.md` gained the row and a section; `repository-map.md` gained the variable and
a gotcha; `repository-state.md` was reworded from "unauthenticated and open" to
"narrowed by an allow-list that is off when unset".

Observed, in a spawned process: `Host: evil.test` → `403`; `Host: example.test` →
`200`; `Host: example.test:3987` → `200` (hostname, not `host:port`); the unset
warning absent when the variable is set; stdout empty.

### S6 — `HOST`

`const host = process.env.HOST ?? "0.0.0.0"` and `listen(port, host, …)`. This
changes no behaviour — `listen(port)` already bound every interface — it makes the
decision visible and gives a deployment a way to take it back.

The startup line moved from `on :${port}/mcp` to `on ${host}:${port}/mcp`, because
with `HOST` configurable the old form would report a port without saying where.
`serving over http` is still in it, which is the string the test waits for.

**`HOST` is a prerequisite for the test harness, not an extra.** `startServer()`
sets `HOST=127.0.0.1` so the suite does not bind every interface for its duration;
without this step there is no `HOST` for it to set.

### S8 — drain-before-close

The transport is stateless, so there is no session map to port: the in-flight
requests are the sessions. Each request's `finish` closure — the one already
registered on `res.on("close")` — goes into a `Set` on the way in and comes out on
the way out.

`shutdown` closes the listener first, then `Promise.allSettled`s the pending
`finish` calls, then exits `0`. The order is the improvement: closing the listener
and exiting in one step is what drops a socket under a peer that was still being
answered. A count goes to stderr when there is anything to drain.

Not verified by observation on this host — **Windows does not deliver `SIGTERM` to a
Node child**, so `shutdown` never runs here and a spawned server exits on the
signal rather than on the handler. The test asserts the weaker property where
signals are not observable, and the exit code where they are.

### S9 — the CLI help

`src/cli.js`'s `Environment` block now names all four. No new flag: `serve --http`,
`--stdio`, and `--port` already cover transport selection, and the help text is
where that answer belongs.
