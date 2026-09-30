# rbagents-shared-instruction

The Roblox development instruction set, served read-only over MCP.

- **Organization:** `RBAgents-MCP`
- **Repository:** `shared-instruction`
- **Server ID:** `rbagents-shared-instruction`
- **Package:** `@rbagents-mcp/shared-instruction`
- **Dual-purpose:** a CLI (`rbagents-shared-instruction`) and an MCP server
  (`rbagents-shared-instruction-server`).

The set covers **Luau**, **Rojo**, package architecture, asset submodules, data stores,
character auras, and naming — written once and served to every Roblox repository. One
implementation behind two surfaces, so a result produced through the CLI is identical to
the same result produced through an MCP client. Node.js 20+, ESM, no build step.

## The tools

One tool per file, named from the file's own basename. No tool takes an argument.

| Tool | Returns |
|---|---|
| `roblox_index` | The router for the set |
| `luau_authoring` | Luau authoring conventions |
| `naming_conventions` | The four naming rules |
| `package_architecture` | Package-based modularity |
| `asset_submodules` | 3D assets as Git submodules |
| `data_store_management` | DataStore access and session locking |
| `character_auras` | Auras, and why they are free |
| `trust_boundaries` | Client versus server authority |
| `zero_trust_networking` | Validating every remote payload |
| `rojo_guide` | The four top-level directories |
| `rojo_studio_mcp` | A stable instance tree |

Each tool returns one file from `content/` verbatim, frontmatter included. Start at
`roblox_index`; it routes the ten files under `roblox/` by subject.

Adding a markdown file to `content/` adds the tool that serves it. Nothing is registered
by hand, and the file is read once at boot, so a call is a lookup rather than a filesystem
read.

There is no write path. No tool accepts an argument at all — so there is no verb, no
credential and no path to traverse with — and no tool reaches a network. The code that
would write is absent rather than disabled, so pointing a repository at this server cannot
mutate the set.

## This does not replace the org conventions

A Roblox repository resolves **both** servers:

| Server | Holds |
|---|---|
| `lxagents-agents-base` | Branch strategy, commit conventions, task workflow, pull requests, the creators. **Every repository resolves this one.** |
| `rbagents-shared-instruction` (this one) | The Roblox platform conventions below. Roblox repositories only. |

The org set governs how the branch is named and how the commit is written. This one
governs what goes in it. Neither replaces the other.

For the Roblox threat model — client zero-trust, server trust boundaries — see the sibling
`RBAgents-MCP/security`.

## Quick start

```bash
npm install
npm test
npm run cli -- tools
npm start
```

No key, no configuration, nothing required. The server starts and answers with nothing
set.

### Two exceptions on the HTTP transport: `HOST` and `MCP_ALLOWED_HOSTS`

`HOST` names the interface the HTTP transport binds. It defaults to `0.0.0.0`, which
is what a published container port needs; set `HOST=127.0.0.1` to bind loopback
only.

`MCP_ALLOWED_HOSTS` is a security variable, and it is worth stating plainly because
the default is the unsafe one.

**An empty or unset `MCP_ALLOWED_HOSTS` means the guard is off.** The server then
accepts every `Host` header, and says so once on stderr at startup. Set it to a
comma-separated allow-list of hostnames to turn it on:

```bash
MCP_TRANSPORT=http MCP_ALLOWED_HOSTS=example.test,localhost node src/index.js
```

A request whose `Host` is not on the list is refused `403` before it reaches a route.
The list matches the hostname, not `host:port`, so `example.test` also covers
`example.test:3000`.

Why it exists at all: the SDK applies Host validation automatically only when the
server is on loopback. A container binds every interface — which is the deployment
that needs the check — so this server applies it explicitly instead of inheriting a
default that would have switched itself off exactly where it mattered.

This is **not authentication**, and the server has none. It narrows who may address
it; it does not decide who may read the set. Full variable reference:
[`wiki/environments/env.md`](wiki/environments/env.md).

### The HTTP surface

`src/app.js` is an [express](https://expressjs.com) application with exactly two
routes, and refuses everything else in the JSON-RPC envelope.

| Request | Answer |
|---|---|
| `GET /healthz` | `200` with the server id and its version — no session, no tool |
| `POST /mcp` | The MCP endpoint |
| Any other method on `/mcp` | `405` / `-32000` — stateless mode takes `POST` only |
| Anything else | `404` / `-32601`, naming both routes this server serves |

Request bodies are capped at 4 MB; an oversized body and a malformed one are both
answered `400` / `-32700`. `X-Powered-By` is disabled, because handing an
unauthenticated caller the framework and its version is a free upgrade suggestion.

## The set

```
content/
  index/roblox-index.md        the router
  roblox/
    language/luau-authoring.md
    toolchain/rojo-guide.md
    toolchain/rojo-studio-mcp.md
    architecture/package-architecture.md
    architecture/asset-submodules.md
    security/zero-trust-networking.md
    security/trust-boundaries.md
    game-systems/data-store-management.md
    game-systems/character-auras.md
    conventions/naming-conventions.md
```

## Register it

| Transport | How |
|---|---|
| Local stdio | `command: node`, `args: ["src/index.js"]`, `cwd:` this checkout |
| Local HTTP | `npm run start:http`, then `http://localhost:3000/mcp` |
| Container | `docker run --rm -i <image>`, or `-p 3000:3000 -e MCP_TRANSPORT=http` for HTTP |
| Remote | Settings → Connectors → Add custom connector → `https://<host>/mcp` |

The `/mcp` path is not optional on either HTTP form.

## Documentation

- [`wiki/information/overview.md`](wiki/information/overview.md) — what this project is.
- [`wiki/information/architecture.md`](wiki/information/architecture.md) — how the pieces
  fit together.
- [`wiki/environments/setup.md`](wiki/environments/setup.md) — installing and running
  both modes.
- [`wiki/environments/env.md`](wiki/environments/env.md) — environment variables.
- [`wiki/environments/docker.md`](wiki/environments/docker.md) — building and running the
  container image.

Full map: [`.agents/index/project-wiki-index.md`](.agents/index/project-wiki-index.md).

## Working with agents

Start at [`AGENTS.md`](AGENTS.md). Shared conventions — branching, commits, pull
requests, the task workflow — are served by the `lxagents-agents-base` MCP connector and
are not stored in this repository.

## Provenance

The ten files under `content/roblox/` are copied verbatim from the workspace `roblox` set
with their frontmatter intact. A convention change belongs there first; this repository is
a delivery surface for it, not its editor.

## License

MIT — see [`LICENSE`](LICENSE).
