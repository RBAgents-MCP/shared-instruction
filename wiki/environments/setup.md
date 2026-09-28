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

Two dependencies: `@modelcontextprotocol/sdk` and `zod`.

## No authentication

Nothing here reaches an external service, so there is no key to set and no environment
variable to configure. The server starts, lists its tool, and answers every request with
nothing configured. Full list of variables: [`env.md`](env.md).

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
roblox_instruction  Read one convention from the set by path, e.g. 'roblox/toolchain/rojo-guide.md'. …
```

The list comes from `listTools()` in `src/server.js` — the same list the MCP server
registers — so the two surfaces cannot disagree.

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

Check it is up:

```bash
curl -s http://localhost:3000/healthz
```

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
- [`../information/overview.md`](../information/overview.md) — what this project is
- [`../information/architecture.md`](../information/architecture.md) — how the pieces fit
- [`README.md`](../../README.md)
