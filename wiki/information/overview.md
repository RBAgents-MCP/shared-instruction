# Overview

`rbagents-shared-instruction` is a **dual-purpose** package: the same implementation is reachable as a
terminal command and as an MCP server. It serves one thing — the Roblox development set — and it serves
it read-only.

## The two surfaces

| Surface | Bin | Who uses it |
|---|---|---|
| CLI | `rbagents-shared-instruction` | A person running it by hand or from a script |
| MCP server | `rbagents-shared-instruction-server` | An MCP client, an editor, an agent, or a connector |

Both share one implementation and one tool list, so a result produced through one is
identical to the same result produced through the other. `npm test` pins that agreement.

## The tools

One tool per file in `content/`, named from the file's own basename. **No tool takes an
argument.**

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

Each returns one file verbatim, frontmatter included, and each description is that file's
own frontmatter `description` — so a caller routes from the tool list without reading
anything. Adding a markdown file to the set adds the tool that serves it; nothing is
registered by hand.

## Read-only, structurally

The server has no write path, and after this surface there is no path into it either. No
tool accepts an argument, so there is no verb to act on, no credential to present, and no
`path` to traverse with. The code that would write is absent rather than disabled, which is
what makes "pointing a repository at this server cannot mutate the set" a property of the
code rather than a configuration someone can change.

That is a stronger claim than the check this server used to make. The old
`roblox_instruction` took a `path` and refused a `..` segment before it called the
filesystem; the eleven tools take nothing at all, so there is nothing to refuse.

## What ships

* An MCP server over **stdio** and **streamable HTTP**, the second served by an express
  application with a `/healthz` endpoint and `POST /mcp`.
* A container image for the same server. The image runs the same entry point and
  selects the transport the same way, so there is no second way to serve this package.
* A CLI with `help`, `version`, `tools`, and `serve`.
* A tool layer generated from `content/` at boot, failing the process rather than serving a
  file with no description or a name two files both claim.
* A test suite pinning the bijection between files and tools in both directions, that no
  tool declares an input schema, that every tool serves its file byte for byte, and that
  the total served text equals the total markdown on disk.

## Requirements

Node.js 20 or newer. Three dependencies (`@modelcontextprotocol/sdk`, `express`,
`zod`), and **no build step** — the package ships source and Node runs it directly.

## Related pages

* [`architecture.md`](architecture.md) — how the pieces fit together.
* [`../environments/setup.md`](../environments/setup.md) — installing and running it.
* [`../environments/env.md`](../environments/env.md) — environment variables.
* [`../environments/docker.md`](../environments/docker.md) — the container image.
