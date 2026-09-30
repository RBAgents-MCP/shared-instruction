---
name: memory-decisions-express-for-http-transport
description: Why the HTTP transport moved from node:http to express, and why the SDK's hostHeaderValidation is mounted natively rather than through a hand-written response shim.
---

# Decision - express for the HTTP transport

## Context

The HTTP transport was a `node:http` server with three hand-written pieces around
it: a body reader that counted chunks and threw past a limit, a JSON-RPC error helper,
and a response shim for the SDK's `hostHeaderValidation`.

That last one was the expensive one. The SDK middleware is Express-shaped - it refuses
by calling `res.status(code).json(body)` and hands on with `next()` - and this
repository had neither, so it handed the middleware a **stand-in object** with those
two methods and inferred refusal from whether `json` had ever been called:

```js
const shim = { status: (code) => ({ json: (body) => { refused = true; ... } }) };
middleware(req, shim, () => {});
refused === true  <==>  the middleware called json
```

A hand-written imitation of two methods, kept honest only by the fact that the SDK's
shape does not change, with the correctness of a security control riding on the
absence of a call.

## Decision

**`src/app.js` builds the express application and returns it. It does not listen.**

`src/index.js` keeps the port, the interface, the transport switch, and the
`inFlight` set. The split is not tidiness: a file that both builds the app and binds a
port cannot be reasoned about, or tested, without opening one, and
`test/http.test.js` starts the server as a real child process precisely so that the
port and the process lifetime are real.

`express@^5.2.1` was **already resolved in `package-lock.json`**, transitively through
`@modelcontextprotocol/sdk`. `npm ls express` before and after the change reports the
same tree - `express@5.2.1` under the SDK and under `express-rate-limit`, plus the new
top-level `express@5.2.1` - so promoting it changed no installed version. The lockfile
diff is the direct-dependency marking and nothing else, which is the check that would
have caught a wrong claim here.

`hostHeaderValidation` is mounted natively:

```js
const hosts = allowedHosts();
if (hosts.length > 0) {
  app.use(hostHeaderValidation(hosts));
}
```

The shim is **deleted**, not deprecated. It existed only because there was no
`express`, and leaving it in place with no caller would make the next reader guess
whether it is load-bearing.

## The part that is a preservation, not a rewrite

**The guard is off when `MCP_ALLOWED_HOSTS` is unset, empty, or separators-only, and
the middleware is not mounted at all in that state.** This is not a detail of the SDK's
behaviour - it is a decision about what "unset" means, and it is the decision the
owner reaffirmed while reviewing this migration.

An allow-list that silently refuses every request is a worse failure than an absent
one. When the list is absent, this server says so on startup rather than papering over
it with a default - a control that is off silently reads as present. **That warning is
written before `listen()`**, not inside the listen callback: the guard state is
announced whether or not the bind succeeds, and `test/http.test.js` reads the captured
streams after startup, so the ordering is part of what is preserved.

An oversized body and a malformed one are both answered **400 / `-32700`**, because
the hand-rolled reader this replaced threw one failure for both. Splitting them would
be a behaviour change nobody asked for.

The `inFlight` set and the drain-before-close ordering are behaviour, not scaffolding,
and they are kept. `createApp({ inFlight })` is how the app hands a closer per
in-flight request to the entry point that drains them deliberately.

## Consequences

- `X-Powered-By` is disabled, and this is a security control rather than an omission:
  it hands an unauthenticated caller the framework and its version.
- A 404 that names both routes this server serves, and a 405 for any non-`POST` on
  `/mcp`, both in the JSON-RPC envelope, so a client never has to branch on content
  type to learn it was refused.
- The `Dockerfile` is untouched. `npm ci` installs the new dependency and the image
  already exposed the right port, so nothing there needed to change.
