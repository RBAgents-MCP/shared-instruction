---
name: roblox-toolchain-rojo-guide
description: The four top-level directories this workspace maps through Rojo, what belongs in each, and how files are named in them.
version: 1.0.0
author: RBZagan
---

# Rojo Structure & File Management Guide for Agents

This workspace uses Rojo to synchronize local files with Roblox Studio. As an
autonomous AI agent, you must strictly follow this directory structure to ensure
`.luau` files compile into the correct Roblox services based on the
`default.project.json` mapping.

## Directory Mapping & Responsibilities

### 1. `src/server/` (Maps to `ServerScriptService`)

- **Purpose:** Authoritative server-side logic, DataStore operations, security
  checks, and game state management.
- **File Naming:** Use `.server.luau` for executable scripts (e.g.,
  `gameManager.server.luau`). Use `.luau` for internal server modules.
- **Security Rule:** This is the execution point for the Zero-Trust networking
  model. Always validate incoming data, verify bounds, and enforce cooldowns for
  actions originating from the client before executing game logic. See
  [`../security/zero-trust-networking.md`](../security/zero-trust-networking.md)
  for the validation order and
  [`../security/trust-boundaries.md`](../security/trust-boundaries.md) for what
  the client is permitted to ask for at all.

### 2. `src/client/` (Maps to `StarterPlayerScripts`)

- **Purpose:** Local interactions, User Interface (UI) behavior, camera
  handling, client-side visual effects, and capturing player inputs.
- **File Naming:** Use `.client.luau` for executable scripts (e.g.,
  `inputHandler.client.luau`). Use `.luau` for internal client modules.
- **Security Rule:** Assume all data and scripts in this directory can be read,
  decompiled, or manipulated by exploiters. Never trust the client to manage
  critical logic such as currency, stats, or ownership.

### 3. `src/shared/` (Maps to `ReplicatedStorage.Shared`)

- **Purpose:** Core resources, network definitions, and utilities that must be
  accessible by BOTH the Server and the Client.
- **File Naming:** Strictly use `.luau` (ModuleScripts only). **DO NOT** place
  `.server.luau` or `.client.luau` files here.
- **Contents:** Put strict type definitions (`export type`), constants,
  `RemoteEvent`/`RemoteFunction` definitions, and shared configuration files in
  this directory.

Everything here replicates to the client, so shared is the worst possible home
for a secret. See
[`../security/trust-boundaries.md`](../security/trust-boundaries.md).

### 4. `RBAssets/` (Maps to `ReplicatedStorage.RBAssets`)

- **Purpose:** Git submodule directory for 3D asset packages and strictly
  automated modular systems (e.g., Character Auras).
- **Rule:** Scripts generated for this directory must adhere to the specific
  package architecture defined in the repository's `AGENTS.md`. Auras must
  automatically equip based on Character ID without any purchase or ownership
  validation checks.

See [`../architecture/asset-submodules.md`](../architecture/asset-submodules.md)
for how the submodule is pinned, and
[`../game-systems/character-auras.md`](../game-systems/character-auras.md) for
the aura rule in full.

## The Project File Is a Draft Until Reconciled

`default.project.json` is written by hand, against the four directories above.
`rojo init` is not the authority on layout — it is a starting point, and its
output disagrees with this guide on the first run in a repository that has none.

**Treat `rojo init` output as a draft.** It is non-interactive, and in a
repository that already has a git repository it needs `--skip-git` or it fails.
It leaves an existing `README.md` alone and creates no `.gitignore`. Its
generated tree does not match the layout above: it nests `src/server` under
`ServerScriptService.Server`, nests `src/client` under
`StarterPlayer.StarterPlayerScripts.Client`, and omits `RBAssets` entirely.
Reconcile it against the four directories in this file before committing it —
do not commit the generator's shape and fix it later.

**A `$path` that does not resolve is a build error, not a warning.** Rojo fails
the whole build on a `$path` it cannot find, so there is no partial state to
fall back on and no mapping can be added "in advance". Every directory named in
`default.project.json` exists on disk in the same commit that names it.

**`RBAssets` is the one directory that must not be mapped early.** It is the
fourth declared directory, and it waits for its submodule. Add its mapping in
the same commit that adds the submodule — never before, and never with a
placeholder directory standing in for the checkout.

## Agent Execution Rules

1. **Direct Action:** Automatically create, modify, or delete files in the exact
   directories above. Do not ask for permission to execute file system commands.
2. **Luau Compliance:** Write code strictly in Luau. All `ModuleScripts` must
   utilize static typing and export their primary types.
3. **Module Naming:** Use `PascalCase` for all ModuleScripts and Classes (e.g.,
   `AuraManager.luau`). Use `camelCase` for executable `.server.luau` or
   `.client.luau` scripts.

## Related

* [`rojo-studio-mcp.md`](rojo-studio-mcp.md) — keeping the tree stable under a
  sync, and why instance names are addresses.
* [`../conventions/naming-conventions.md`](../conventions/naming-conventions.md)
  — the naming rules behind rule 3, and the three places they do not apply.
* [`../language/luau-authoring.md`](../language/luau-authoring.md) — the typing
  rule 2 requires.
