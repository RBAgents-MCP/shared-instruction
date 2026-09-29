# Local Setup

`rbagents-shared-instruction` is **dual-purpose**. The same code is reachable two ways:

| Mode | What it is | Who uses it |
|---|---|---|
| **CLI mode** | A terminal command | A person running it by hand or from a script |
| **Server mode** | An MCP server over stdio or streamable HTTP | An MCP client, an editor, an agent, or a connector |

Both modes share one implementation, so a result produced in one is identical to the
same result produced in the other.

## Requirements

Node.js 20 or newer. There is no build step.

```bash
npm install
npm test
```

Three dependencies: `@modelcontextprotocol/sdk`, `express` and `zod`.

## No authentication

Nothing here reaches an external service, so there is no key to set. The server
starts, lists its tools, and answers every request with nothing configured. A few
optional variables select the transport and narrow who may address it; none of them
is a credential. Full list: [`env.md`](env.md).

## CLI mode

### Install

```bash
# From a checkout, for development
npm install
npm link

# Or globally, from the registry
npm install -g @rbagents-mcp/shared-instruction
```

Without installing anything:

```bash
node src/cli.js --help
npm run cli -- --help
```

### Use

```bash
rbagents-shared-instruction --help
rbagents-shared-instruction --version
rbagents-shared-instruction tools
```

`tools` prints every registered tool with its description:

```text
roblox_index           Index of the Roblox development set - Luau, Rojo, package architecture, assets, data stores, auras, and naming, for every Roblox repository.
luau_authoring         Luau only, never standard Lua — strict mode, export type, and typed signatures on every function this project writes.
naming_conventions     The four naming rules for Roblox code — PascalCase types, camelCase functions, …
…
```

One line per file in `content/`, named from the file's own basename and described by that
file's own frontmatter. The list comes from `listTools()` in `src/server.js` — the same
list the MCP server registers — so the two surfaces cannot disagree.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | The request was understood but could not be satisfied |
| `2` | The command line itself was wrong |

## Server mode

### Install

An MCP client spawns the server as a subprocess, so installing it means pointing the
client at it. Either bin works: `rbagents-shared-instruction-server` is the server directly, and
`rbagents-shared-instruction serve` reaches the same server through the CLI.

```json
{
  "mcpServers": {
    "rbagents-shared-instruction": {
      "command": "node",
      "args": ["src/index.js"],
      "cwd": "/path/to/shared-instruction"
    }
  }
}
```

Once the package is installed globally, the bin can be named directly instead:

```json
{
  "mcpServers": {
    "rbagents-shared-instruction": {
      "command": "rbagents-shared-instruction-server"
    }
  }
}
```

For a remote connector, point the client at `https://<host>/mcp`, including the
`/mcp` path.

### Run

```bash
# stdio
npm start
rbagents-shared-instruction serve --stdio

# streamable HTTP
npm run start:http
rbagents-shared-instruction serve --http --port 3000
```

The HTTP transport is an [express](https://expressjs.com) application with exactly two
routes. Check it is up:

```bash
curl -s http://localhost:3000/healthz   # 200, with the server id and its version
curl -s -X POST http://localhost:3000/mcp   # the MCP endpoint
```

Any other method on `/mcp` is refused `405`, and any other path is refused `404` with
a message naming both routes above.

### In a container

```bash
docker build -t rbagents-shared-instruction:1.0.0 .

# stdio
docker run --rm -i rbagents-shared-instruction:1.0.0

# streamable HTTP
docker run --rm -p 3000:3000 \
  -e MCP_TRANSPORT=http rbagents-shared-instruction:1.0.0
```

The image runs `src/index.js`, so it serves stdio unless `MCP_TRANSPORT` says
otherwise — same selection as above, not a second entry point. Full page, including
what is in the image and what has not been verified:
[`docker.md`](docker.md).

### Inspect it

```bash
npm run inspect
```

This runs the MCP Inspector against the stdio server, listing every tool and letting
you call them.

### stdout belongs to the protocol

On the stdio transport, stdout **is** the JSON-RPC channel. Logging goes to stderr,
and `serve` prints nothing of its own. Only CLI commands write to stdout.

A `console.log` on the server path is a bug that corrupts the protocol stream.

## Related pages

- [`env.md`](env.md) — every environment variable this project reads
- [`docker.md`](docker.md) — building and running the container image
- [`../information/overview.md`](../information/overview.md) — what this project is
- [`../information/architecture.md`](../information/architecture.md) — how the pieces fit
- [`README.md`](../../README.md)
