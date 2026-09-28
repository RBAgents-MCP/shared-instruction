---
name: roblox-index
description: Index of the Roblox development set - Luau, Rojo, package architecture, assets, data stores, auras, and naming, for every Roblox repository.
version: 1.0.0
author: RBZagan
---

# Roblox Index

**Scope:** `content/roblox/`
**Parent:** [`content/index/root-index.md`](root-index.md)

Roblox development conventions, written once and served to every Roblox repository
through this server. They are **workspace-local content, not part of the cached
`lxagents-agents-base` set** — this server does not carry a set version stamp, and
nothing here is covered by one.

## How a Roblox repository resolves this

| Server | Holds |
|---|---|
| `lxagents-agents-base` | Branch strategy, commit conventions, task workflow, pull requests, the creators. **Every repository resolves this one.** |
| `rbagents-shared-instruction` (this one) | The Roblox platform conventions below. Roblox repositories only. |

Neither replaces the other. A Roblox repository resolves **both**: the org set governs
how the branch is named and how the commit is written, this one governs what goes in it.

For the Roblox threat model — client zero-trust, server trust boundaries — see the
sibling `RBAgents-MCP/security`, or the two `security/` files below, which are served
here as well so a repository can read them without a second connector.

## language

| File | Purpose |
|---|---|
| [`../roblox/language/luau-authoring.md`](../roblox/language/luau-authoring.md) | Luau only, never standard Lua; strict mode and typed signatures. |

## toolchain

| File | Purpose |
|---|---|
| [`../roblox/toolchain/rojo-studio-mcp.md`](../roblox/toolchain/rojo-studio-mcp.md) | Keeping the instance tree stable under Rojo and addressable by Studio MCP. |
| [`../roblox/toolchain/rojo-guide.md`](../roblox/toolchain/rojo-guide.md) | The four mapped directories, what belongs in each, why `rojo init` output is a draft, and the agent execution rules. |

## architecture

| File | Purpose |
|---|---|
| [`../roblox/architecture/package-architecture.md`](../roblox/architecture/package-architecture.md) | One system per package, one public entry point per package, and why a package owns no place settings. |
| [`../roblox/architecture/asset-submodules.md`](../roblox/architecture/asset-submodules.md) | 3D assets in `RBAssets` submodules, split across Base, Volume, and Place. |

## security

| File | Purpose |
|---|---|
| [`../roblox/security/zero-trust-networking.md`](../roblox/security/zero-trust-networking.md) | Validating every client payload on the server before any state changes. |
| [`../roblox/security/trust-boundaries.md`](../roblox/security/trust-boundaries.md) | Intents not results, client input and display only, where secrets may live, and the shape of an `OnServerEvent` handler. |

## game-systems

| File | Purpose |
|---|---|
| [`../roblox/game-systems/data-store-management.md`](../roblox/game-systems/data-store-management.md) | Retries, caching, and session locking behind one manager. |
| [`../roblox/game-systems/character-auras.md`](../roblox/game-systems/character-auras.md) | Auras are free, automatic, and resolved from the character ID. |

## conventions

| File | Purpose |
|---|---|
| [`../roblox/conventions/naming-conventions.md`](../roblox/conventions/naming-conventions.md) | The four naming rules, and the three places they do not apply. |

## Naming

Every file in this scope carries a `roblox-` prefix on its `name`, so it cannot collide
with a shared-set file of the same subject. This index follows the `{scope}-index` pattern
and is named `roblox-index`.

Any file added to, removed from, or renamed in `roblox/` updates this index in the same
change.

## Provenance

The ten files are copied verbatim from the workspace `roblox` set with their frontmatter
intact. A convention change belongs there first; this repository is a delivery surface for
it, not its editor.
