# Docker

> **This image has never been built.** Docker was not available in the environment
> these files were written in, so `Dockerfile` and `.dockerignore` are reviewed source
> and not a verified build. Every command below is a claim about what the image should
> do, not a record of it having done it. Treat them as **written-and-untested** until
> someone has run all four and recorded what happened.

## Build

```bash
docker build -t rbagents-shared-instruction:1.0.0 .
```

The tag carries the version from `package.json`, which the server also reads at
runtime to report itself on `/healthz`.

## Run

Two forms, one entry point. `src/index.js` serves **stdio** unless `MCP_TRANSPORT`
says otherwise, which is why the image does not serve HTTP by itself.

### stdio

```bash
docker run --rm -i rbagents-shared-instruction:1.0.0
```

`-i` keeps stdin open. An MCP client that spawns the container is talking to this
form, and it is the default, so nothing is passed on the command line.

### streamable HTTP

```bash
docker run --rm -p 3000:3000 \
  -e MCP_TRANSPORT=http rbagents-shared-instruction:1.0.0
```

Then:

```bash
curl -s http://localhost:3000/healthz
```

`{"status":"ok","server":"rbagents-shared-instruction","version":"1.0.0"}`

## Register it with an MCP client

```json
{
  "mcpServers": {
    "rbagents-shared-instruction": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "rbagents-shared-instruction:1.0.0"
      ]
    }
  }
}
```

Over HTTP the connector's URL is `http://localhost:3000/mcp`. The `/mcp` path is not
optional on either HTTP form.

## What is in the image

| Path | What |
|---|---|
| `package.json` | Both bins, and the version the server reports. |
| `node_modules/` | `@modelcontextprotocol/sdk`, `express` and `zod`, installed with `npm ci --omit=dev`. |
| `src/` | The server and the CLI. |
| `content/` | The ten Roblox conventions and their index, copied verbatim. |

`test/`, `wiki/`, `.agents/`, and the repository metadata are excluded by
`.dockerignore` — which is why the image cannot run its own suite. The base is
`node:22-alpine` and the server runs as `USER node`; nothing in the image needs
root after that.

## Host binding and the allow-list

The server binds `0.0.0.0` by default, which is what a published port needs.

* `HOST=127.0.0.1` binds loopback only. Inside a container that is usually not what
  you want, since nothing else in the container connects over the network.
* `MCP_ALLOWED_HOSTS` is a comma-separated allow-list of `Host` header values.
  **An empty or unset value means the guard is off** — the safe-looking default is
  the unsafe one. A deployment that publishes this port should set it.
* `MCP_CLUSTER_WORKERS` sets how many worker processes fork onto port 3000. **A
  container gets one worker per CPU it was given** by default, so a one-CPU
  container runs a single worker and a four-CPU container runs four. `1` forks
  nothing at all.

All three are documented in [`env.md`](env.md). None of them is authentication, and
this server has none: the allow-list narrows who may address it, and does not decide
who may read the set.

## Related pages

* [`env.md`](env.md) — every environment variable this project reads.
* [`setup.md`](setup.md) — running it without a container.
* [`../information/architecture.md`](../information/architecture.md) — how the pieces fit.
