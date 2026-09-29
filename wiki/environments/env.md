# Environment Variables

Four variables, all optional. The server starts with none of them set and answers
every request.

| Variable | Default | Read by | Effect |
|---|---|---|---|
| `MCP_TRANSPORT` | `stdio` | `src/index.js` | `stdio` or `http` (`streamable-http` is accepted too). |
| `PORT` | `3000` | `src/index.js` | The port the HTTP transport listens on. Ignored on stdio. |
| `HOST` | `0.0.0.0` | `src/index.js` | The interface the HTTP transport binds. `127.0.0.1` binds loopback only. Ignored on stdio. |
| `MCP_ALLOWED_HOSTS` | unset | `src/index.js` | Comma-separated `Host` allow-list. **Unset or empty means the guard is off.** Ignored on stdio. |

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
there is no need to write the port.

**An empty value means the guard is off.** `MCP_ALLOWED_HOSTS=`, an empty string,
and an unset variable are the same thing, and the server writes one line to stderr
at startup saying so. The safe-looking default is the unsafe one, and that is the
single fact most likely to be misread about this variable.

Why it is not on by default: the MCP SDK's own Express application applies Host
validation automatically, but **only when the server is on loopback**. This
repository binds all interfaces unless `HOST` says otherwise, and a container
publishes a port — exactly the deployment where the inherited default would have
switched itself off. So the check is applied here explicitly, and left to the
operator to enable.

This is not authentication. It narrows who may address the server; it does not
decide who may read the set, and no tool in this repository takes a credential.

## Related pages

* [`setup.md`](setup.md) — installing and running both modes.
* [`docker.md`](docker.md) — the container image, where `MCP_ALLOWED_HOSTS` matters most.
* [`../information/overview.md`](../information/overview.md) — what the project is.
