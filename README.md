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

## The one tool

| Tool | Parameters | Returns |
|---|---|---|
| `roblox_instruction` | `path` (string) | One file from `content/`, verbatim |

Read `index/roblox-index.md` first. It routes the ten files under `roblox/` by subject.

There is no write path. No tool accepts a verb, no tool takes a credential, and no tool
reaches a network. The code that would write is absent rather than disabled, so pointing a
repository at this server cannot mutate the set.

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

### One exception: `MCP_ALLOWED_HOSTS`

The HTTP transport reads one security variable, and it is worth stating plainly
because the default is the unsafe one.

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
