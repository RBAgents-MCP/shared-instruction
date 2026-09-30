# 1.1.0

**Released:** 2026-09-30

The HTTP transport becomes an express application, a `node:cluster` primary forks
workers that share the one `PORT`, and the hand-written shim that bridged the SDK's
middleware to `node:http` is deleted.

**The published contract does not change.** `POST /mcp` and `GET /healthz` answer as
they did, and — unlike `RBAgents-MCP/security`, which had a hand-rolled guard — this
repository already used the SDK's `hostHeaderValidation`, so the security logic is
genuinely **preserved** rather than converged. The only thing that changes there is how
the middleware is called.

## Added

- **Cluster workers.** The HTTP transport forks `MCP_CLUSTER_WORKERS` processes —
  `os.availableParallelism()` by default — each binding the same `PORT` through the
  cluster's shared handle, so the kernel's round-robin scheduler does the
  distribution. `MCP_CLUSTER_WORKERS=1` means no fork at all, which is what makes it
  bisectable against the previous commit. The primary binds nothing, so the startup line
  prints once per worker; it relays the signal and waits for the last worker, and
  workers exit on `disconnect`.

  **stdio never forks.** stdout is the JSON-RPC channel there, and a worker's copy of
  it would corrupt the stream.

## Changed

- **The transport is an express application.** `src/index.js` no longer builds a
  `node:http` server and no longer hand-parses request bodies. The application is
  `src/app.js`, and the MCP endpoint is strictly `POST /mcp`, with `GET /healthz`
  preserved.
- `express` is a direct dependency, pinned to the version the lockfile already resolved.
- Docs: `wiki/information/architecture.md`, `wiki/information/overview.md`,
  `wiki/environments/env.md`, `wiki/environments/docker.md`,
  `wiki/environments/setup.md`, `README.md`, the repository rule, and the repository
  map.

## Removed

- **The middleware shim.** This repository bridged the SDK's Express-shaped middleware
  to `node:http` with a fake response object, hand-writing the two methods the
  middleware reaches for and inferring refusal from whether `json` was ever called:

  ```js
  const shim = { status: (code) => ({ json: (body) => { refused = true; rpcError(/* … */); } }) };
  middleware(req, shim, () => {});
  ```

  Express removes the reason it existed: the middleware gets a real `res`, calls
  `res.status(403).json(…)` itself, and the detection is express's rather than this
  repository's. `LXAgents-MCP/security` had the same idea with a different shim — methods
  grafted onto the real response rather than a stand-in object. Both existed only
  because there was no `express`.

## Security

- **Unchanged, and that is the point.** `MCP_ALLOWED_HOSTS` unset, empty, or
  separators-only → the middleware is **not mounted at all**, every request is served,
  and the startup line still announces it either way. Set → a host outside the list is
  refused with **403** and a JSON-RPC body, port-agnostic, bracketed IPv6 matched as
  `[::1]`. Mounted above the body parser and above every route, `/healthz` included.
  This repository is one of the four where the refusal bodies do **not** change.

## What did not change

- The 4 MB body limit and the existing JSON-RPC error shapes.
- The `Dockerfile`, which no commit in this migration modified. It already runs
  `npm ci`, exposes 3000, and already documents `GET /healthz` and `POST /mcp`, so
  nothing in it is made false by this change.
