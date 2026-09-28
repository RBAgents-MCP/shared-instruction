---
name: roblox-toolchain-rojo-studio-mcp
description: Keep the instance tree stable under Rojo sync and addressable by the Roblox Studio MCP server — stable names, no Studio-side renames.
version: 1.0.0
author: RBZagan
---

# Rojo and Studio MCP Compatibility

Applies to every Roblox repository in this workspace that syncs with Rojo or is
driven through the Roblox Studio MCP server.

## The filesystem is the source of truth

A project managed by Rojo is mirrored into Studio. A change made only in Studio
is destroyed by the next sync.

* Make every change on the filesystem. Never hand-build an instance tree in
  Studio and leave it there.
* A folder on disk becomes a container in Studio, and a file becomes an
  instance. If that mapping is wrong, fix `default.project.json` — do not
  compensate by moving instances in Studio.
* Renaming a file renames the instance it produces. When a rename matters to
  another script, update that script in the same change.
* Do not edit the mappings in `default.project.json` to work around a Lua error.
  A mapping is a naming decision, not an error handler.

## Instance names are addresses

The Studio MCP server reaches instances by dot-separated path, and an agent
working through it will use those names as the only description of the tree.

* Choose instance names that describe the thing, so a path is readable without
  opening the instance.
* Never let Studio auto-number a name — `Part`, `Part1`, `Part2`. A
  duplicated name makes a path ambiguous and every script that references it
  fragile.
* A name that changes is an interface change. Update every reference, in the
  same change.

## Instances a script creates are also a contract

Code that builds instances at runtime names them too, and those names are
addressed the same way.

* Build a subtree in one function, parent it once, and return it. A hierarchy
  assembled by scattering `Parent` assignments across branches is a hierarchy
  nobody can read from a path.
* Set `Name` explicitly whenever the default would be a type name, for the same
  reason as above.

## Related

* [`rojo-guide.md`](rojo-guide.md) — the four directories this workspace maps,
  and what belongs in each.
* [`../language/luau-authoring.md`](../language/luau-authoring.md) — the language
  these scripts are written in.
* [`../architecture/asset-submodules.md`](../architecture/asset-submodules.md) —
  asset submodules, which are the reason several Rojo projects exist at once.
