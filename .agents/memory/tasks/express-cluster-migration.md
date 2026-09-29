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

---

### Task 1 — `chore/express-cluster-plan`

Created this record with the confirmed task list, before any of the work. Registered in
[`.agents/index/memory-index.md`](../../index/memory-index.md) in this commit.

Task 2 branches from this branch and adds its own entry here in its own commit.
