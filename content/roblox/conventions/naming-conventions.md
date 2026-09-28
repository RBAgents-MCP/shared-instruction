---
name: roblox-conventions-naming-conventions
description: The four naming rules for Roblox code — PascalCase types, camelCase functions, UPPER_SNAKE_CASE constants, underscore-private members.
version: 1.0.0
author: RBZagan
---

# Naming Conventions

Applies to every Roblox repository in this workspace.

## The four rules

| Kind | Case | Example |
|---|---|---|
| Services, modules, and object-oriented classes | `PascalCase` | `DataStoreManager`, `AuraPackage`, `RemoteRegistry` |
| Local variables, parameters, and function names | `camelCase` | `resolveAura`, `playerId`, `lastMove` |
| Configuration constants | `UPPER_SNAKE_CASE` | `MAX_SPEED`, `COOLDOWN`, `SESSION_LOCK_TIMEOUT` |
| Private properties and methods inside a module | Leading `_` | `_internalCache`, `_refresh()`, `_isLocked` |

## What counts as what

* **Module name = the PascalCase name.** `DataStoreManager.luau` declares
  `DataStoreManager` and returns it. A module's file name and the type it
  exports are the same word.
* **A class is PascalCase; a bare function is camelCase.** `AuraPackage.new()`
  constructs; `resolveAura()` resolves. A lowercase method on a class is a
  procedure, not a type.
* **A constant is configuration, not a local.** A value that never changes
  during a session is `UPPER_SNAKE_CASE`. A value computed from a player's
  state is camelCase — it is a local, and it changes.
* **Private means not part of the module's surface.** Everything a consumer can
  reach is a public member; `_` marks what it cannot. A `_` member is free to
  change shape in any release.
* **A table field is named by what it holds**, not by where it sits. `amount`,
  not `field3`. This applies inside an instance and inside a `type` alike.

## Where it is not negotiable

* **Roblox instance names** follow the Roblox project's own conventions, not
  these. Renaming a `RemoteEvent` to satisfy this rule breaks every reference to
  it — see
  [`../toolchain/rojo-studio-mcp.md`](../toolchain/rojo-studio-mcp.md).
* **DataStore keys** are a storage format, fixed by whatever wrote them first.
  Changing a key's casing orphans the data behind it. New keys follow these
  rules; existing ones do not move.
* **Remote names** on the wire are a protocol, and are covered by the same
  reasoning as instance names.

## Related

* [`../language/luau-authoring.md`](../language/luau-authoring.md) — the typed
  declarations these names belong to.
