---
name: memory-tasks-express-cluster-migration
description: Task record for replacing the node:http transport with an express application mapped strictly to POST /mcp, deleting the shim that bridged the SDK Host middleware to a raw response, and for answering requests from cluster workers on one port.
---

# Task: express transport and cluster workers

Three branches, stacked. Local commits only; nothing is pushed from them. **No version
change** — the version needs the owner, and so does the release log.

## The plan

| # | Task | Branch | Scope |
|---|---|---|---|
| 1 | The record | `chore/express-cluster-plan` | This file. |
| 2 | express transport | `feat/express-transport` | `node:http` → express, strictly `POST /mcp`, the shim deleted. |
| 3 | cluster workers | `feat/cluster-workers` | A `cluster` primary forking workers onto the one `PORT`. |

The working plan is untracked, under `.agents/plans/`, and is deleted or abandoned when
the work merges. Where the two disagree, this record wins.

## What this is

The repository serves `StreamableHTTPServerTransport` on `POST /mcp` from a
`node:http` server. It already uses the SDK's `hostHeaderValidation`, so the security
logic is genuinely **preserved** — what changes is how the middleware is called.

The interesting part is what express makes deletable. The SDK middleware is
Express-shaped: it refuses with `res.status(code).json(body)` and hands on with
`next()`. This repository has neither, so it hands the middleware a **fake response
object** with a `status().json()` chain, and infers refusal from whether `json` was ever
called:

```js
const shim = { status: (code) => ({ json: (body) => { refused = true; … } }) };
middleware(req, shim, () => {});
refused === true  ⟺  the middleware called json
```

That is a hand-written imitation of the two methods the middleware reaches for, and it
is the only reason this repository carries one. Express removes the reason it exists:
the middleware gets a real `res` and express does the detection.
`LXAgents-MCP/security` does the same thing with a different shim — methods grafted
onto the real response. Both exist only because there was no `express`.

`express@5.2.1` is already resolved in `package-lock.json` transitively through
`@modelcontextprotocol/sdk`, so promoting it changes no installed version. The reason
is recorded in `../decisions/express-for-http-transport.md`.

## Baseline

`npm test` before any change: **22 tests, 22 pass, 0 fail** (Node 24.21.0, `node
--test`, no framework).

## What is preserved

| Property | What happens |
|---|---|
| `hostHeaderValidation`, off when unset/empty/separators-only | Preserved, mounted natively, **no shim** |
| `PORT` default 3000, `HOST` default 0.0.0.0 | Preserved |
| Startup line `serving over http on ${host}:${port}/mcp` | Preserved |
| The `MCP_ALLOWED_HOSTS is unset` warning **written before `listen()`** | Preserved, including its placement — the suite reads the captured streams after startup, so the ordering is deliberate |
| The 404 body naming both `/mcp` and `/healthz` | Preserved; the suite asserts it |
| The `inFlight` set and drain-before-close ordering | Preserved — behaviour, not scaffolding |
| Stateless `McpServer` per request, 4 MB limit, `-32700` collapse | Preserved |

The `Dockerfile` is not modified. It already runs `npm ci`, exposes 3000, and already
documents `GET /healthz` and `POST /mcp`.

## Out of scope

The `Dockerfile`, the tool surface and `content/**`, the stdio transport, the version,
and the release log.

## Test counts

| Point | Tests | Pass | Fail |
|---|---|---|---|
| Baseline, before any change | 22 | 22 | 0 |
| After task 2, `feat/express-transport` | 30 | 30 | 0 |
| After task 3, `feat/cluster-workers` | 38 | 38 | 0 |

---

### Task 1 — `chore/express-cluster-plan`

Created this record with the confirmed task list, before any of the work. Registered in
[`.agents/index/memory-index.md`](../../index/memory-index.md) in this commit.

Task 2 branches from this branch and adds its own entry here in its own commit.

---

### Task 2 — `feat/express-transport`

`node:http` → express, the shim deleted.

**What changed**

- `express@^5.2.1` promoted to a direct dependency. `npm ls express` before and
  after reports the same tree — `express@5.2.1` under `@modelcontextprotocol/sdk`
  and under `express-rate-limit`, plus the new top-level entry — so **no installed
  version moved**. The lockfile diff is the direct-dependency marking and nothing
  below the root `packages[""]` block.
- `src/app.js` (new) builds the express application and returns it. It does not
  listen, and it does not read `MCP_CLUSTER_WORKERS`.
- `src/index.js` keeps the port, the interface, the transport switch, the named
  bind, the startup line, the `MCP_ALLOWED_HOSTS is unset` warning **written
  before `listen()`**, the `inFlight` set, and the drain-before-close ordering.
- `readBody`, `rpcError` and `hostGuard` are deleted. `grep -n "shim\|hostGuard\|
  node:http" src/index.js` returns nothing.
- The guard is `hostHeaderValidation` mounted natively, above the body parser and
  above every route, `/healthz` included.

**The dependency-lock deviation, stated rather than buried.** The lockfile also
carried a stale root `"version": "0.1.0"` in two places — left behind when 1.0.0
was released — and `npm install --package-lock-only` corrected both to `1.0.0`.
That is the lockfile catching up with `package.json`, not a version change:
`package.json` is the version carrier and was not touched, and no dependency
version moved. Hand-reverting it would leave the lockfile asserting a version the
package does not have.

**Two things the plan predicted that turned out differently**

- *A request with no `Host` header at all cannot be made.* The plan asked for a
  test asserting `403`. Node's HTTP/1.1 parser rejects a `Host`-less request
  before the listener's callback runs, with a bare `400` and an empty body, so
  the SDK's `Missing Host header` branch is unreachable over a socket. The test
  was rewritten to assert what actually holds — a `Host`-less request is refused
  rather than served — and **not** to pin the code, which belongs to node's
  parser rather than to this repository. Measured, not assumed.
- *A test that occupies the port to force workers to fail* is not written at all.
  In this environment a child binds a port its parent already holds, successfully,
  while the parent keeps serving, so the case would not fail where it is meant to.
  The gap is recorded rather than papered over with a weaker assertion.

**Verification** — `npm ci` succeeds; the lockfile diff is the direct-dependency
marking only; `npm test` is 30/30 on this commit's tree, including the unchanged
`test/server.test.js`; `npm run cli -- tools` still agrees with the MCP surface;
`POST /mcp` serves the eleven tools over a real socket identically to the in-memory
transport; `GET /healthz` answers 200 with the server id and a semver version;
`GET /mcp` is 405 / `-32000` and an unknown path is 404 / `-32601` naming both
`/mcp` and `/healthz`; an oversized body and a malformed one are both 400 /
`-32700`; no response carries `X-Powered-By`; the guard is off for absent, empty
and separators-only values and says so; with the guard set, an outside `Host` is
403 in the SDK's JSON-RPC envelope, an inside one is 200, `example.test:port` is
200, `[::1]:3000` is 200 against a `[::1]` entry while bare `::1` is 403, and
`/healthz` is 403 as well; the SDK's own client is refused when its `Host` is not
on the list and the process keeps serving afterwards; every `Host` assertion uses
`node:http` rather than `fetch`; nothing is written to stdout on the HTTP path.

**Documentation corrected** — `README.md`, `wiki/information/architecture.md`,
`wiki/information/overview.md`, `wiki/environments/{setup,env,docker}.md`,
`.agents/wiki/context/repository-map.md`, `.agents/rules/repository.md`,
`.agents/memory/state/repository-state.md`, and the new decision record
`../decisions/express-for-http-transport.md` (registered in
[`.agents/index/memory-index.md`](../../index/memory-index.md) here).

`MCP_CLUSTER_WORKERS` is task 3, so `src/cli.js`, `wiki/environments/env.md`,
`wiki/environments/setup.md` and `wiki/environments/docker.md` gain it there. The
`Dockerfile` is not modified.

---

### Task 3 — `feat/cluster-workers`

A `node:cluster` primary forking workers onto the one `PORT`.

**What changed**

- `src/index.js` gained `workerCount()`, `startWorker()` and `startPrimary()`.
  `src/app.js` is untouched: it is still a pure factory, and the fork lives with the
  port because that is what the fork is for.
- The primary binds nothing and prints no startup line of its own. It logs
  `forking {n} HTTP workers on {host}:{port}/mcp`, so counting `serving over http` in
  the log counts the workers and only the workers.
- `MCP_CLUSTER_WORKERS` overrides the count when it parses to an integer of at least
  `1`; unset, empty, `0` or a word fall through to `Math.max(1, availableParallelism())`.
  **Anything that is not a positive integer is ignored rather than honoured**, because
  a count of zero would mean a server that answers nothing.
- `process.on("disconnect", () => process.exit(0))` in the worker, so a `kill -9` of
  the primary leaves nothing holding the port.
- The primary relays `SIGINT`/`SIGTERM` to every worker and exits once the last is
  gone, with an unref'd ten-second backstop. **The drain line is written by the
  worker** — this repository's `draining {n} in-flight request(s)`, in the process
  actually draining — and the primary writes its own, different line,
  `{signal}, draining {n} worker(s)`.
- Each worker writes the `MCP_ALLOWED_HOSTS is unset` warning for itself, still
  **before** `listen()`. A two-worker run says it twice, which is the honest shape:
  two processes, two listeners, two unguarded entry points.
- stdio never forks.

**Verification**

- `npm test` is 38/38 on this commit's tree with the **default** worker count, which
  on this machine is 2 — so every pre-existing case in the file also ran against a
  forked server.
- `MCP_CLUSTER_WORKERS=1` logs `so no worker is forked`, logs no `forking` line,
  prints exactly one `serving over http` line, and still serves the set.
- `MCP_CLUSTER_WORKERS=2` logs `forking 2 HTTP workers`, reaches two
  `serving over http` lines — two processes each bound the port, which is only
  possible through the shared handle — and answers eight concurrent requests.
- **No orphan survives a `SIGKILL` of the primary**, checked directly and not only
  through the suite: workers `[127037, 127038]` serving on port 127024's primary,
  primary `kill -9`ed, three seconds later `workers still alive: []`,
  `port still served: false`, `port rebound cleanly`.
- `SIGINT` logs `SIGINT, draining 2 worker(s)`, exits `0`, and the port is refused
  afterwards — the primary cannot exit while a worker still holds the listener.
- Concurrent tool calls stay isolated across the process boundary, each caller
  compared against the same tool served in process rather than merely against "some
  file". Tool names are read from `listTools()`, not written down.
- A worker that is `SIGKILL`ed is reported by the primary, replaced with a new pid,
  and the survivor is left alone; the server keeps answering on the pool it has now.
- `MCP_TRANSPORT=stdio` over a real pipe returns the full tool list and logs neither
  a fork line nor the no-fork line.
- `npm run cli -- tools` still agrees with the MCP surface, and `npm run cli -- --help`
  lists `MCP_CLUSTER_WORKERS`.

**Three things the plan or the reference implementation predicted that turned out
differently, each measured rather than assumed**

- ***The worker's `draining {n} in-flight request(s)` line has no test.*** A tool call
  completes in milliseconds and nothing in this server can be made slow — no tool
  takes an argument, so there is no way to hold a request open. Firing eight
  concurrent calls and signalling 5 ms later produced the drain line in **0 of 15
  attempts**. The line is preserved **byte-identical from task 2**, and the exit-0 half
  of the same `shutdown` is covered by `SIGTERM stops the server` and by the SIGINT
  case; what is untested is the timing, and a test that raced it would be flaky
  rather than strict.
- ***The reference's worker-pid test does not work here, but an equivalent one does.**
  `/proc/<pid>/task/<tid>/children` reads back **empty** on this kernel, so the
  reference's `childrenOf` finds nothing. The parent pid is instead read from field 4
  of `/proc/<pid>/stat` for every process, which does work — so the respawn case is
  covered, Linux-only with an explicit skip elsewhere, and not weakened.
- ***A worker does grow across many requests, and did before this migration too.** Over
  800 sequential tool calls, total resident memory of the primary and its workers:

  | Build | Start | After 800 calls | Growth |
  |---|---|---|---|
  | pre-migration `node:http`, one process | 98 MB | 181 MB | +85% |
  | express, one worker (no fork) | 108 MB | 196 MB | +81% |
  | express, two workers | 300 MB | 353 MB | +18% |

  The express and pre-express single-process shapes are the same, so neither express
  nor the cluster introduced it; it is the fresh-`McpServer`-per-request lifecycle
  this repository has always had, and it is not linear. The test that ships is
  therefore a **loose canary** — under 3x after 200 requests, which is what catches a
  per-request object that is never released, which shows up as multiples rather than
  tens of megabytes. The literal wording of the verification item, "a worker does not
  grow in memory across many requests", is **not met and is not claimed to be**.

**A test that was not written, on purpose.** Occupying the port in a parent to force a
worker's bind to fail does not work in this environment: a child process binds a port
its parent already holds, **successfully**, while the parent keeps serving. The case
would not fail where it is meant to, so there is no such test. The gap is recorded
rather than papered over with a weaker proxy. Nothing in the suite covers *worker bind
failure* as a result.

**Documentation corrected** — `README.md`, `wiki/information/architecture.md`,
`wiki/environments/{setup,env,docker}.md`,
`.agents/wiki/context/repository-map.md`, `src/cli.js` `--help`, and this record.
`MCP_CLUSTER_WORKERS` is in `wiki/environments/env.md`, `wiki/environments/setup.md`,
the CLI `--help` block and `wiki/environments/docker.md` (a container gets one worker
per available CPU). The `Dockerfile` is not modified.
