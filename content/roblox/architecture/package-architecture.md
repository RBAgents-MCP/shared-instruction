---
name: roblox-architecture-package-architecture
description: Strict package-based modularity — one concern per module, one public entry point per package, and no reaching past a package boundary.
version: 1.0.0
author: RBZagan
---

# Package Architecture

Applies to every Roblox repository in this workspace. A system is a package, not
a folder of scripts that happen to be near each other.

## One package per system

A package is a `Folder` in the tree — under `ReplicatedStorage`,
`ServerScriptService`, or `ServerStorage` — holding the modules of one system.

* One system, one package. A package whose name is a category rather than a
  system (`Common`, `Utils`, `Shared`) is not a package; it is a drawer.
* A module belongs to exactly one package. Sharing a module between packages
  means it was not in the right package.
* The package's name is what its consumers require. A rename is an interface
  change, not a local edit.

## One public entry point

Every package exposes exactly one module that consumers require.

* Internal modules are private to the package, addressed by relative path from
  the entry point. They carry no promise beyond that package.
* A consumer requires the entry point and uses what it returns. Reaching past
  it — `Packages.Payments.Internals.Sign` — breaks the moment the internals
  change, and no test catches it because nothing promised the path.
* If a second consumer needs a module that is not exported, either export it
  deliberately or move it to the package that owns it.

```luau
-- Consumers/Purchases/init.luau — the only entry point
--!strict
local Payments = {}

function Payments.grant(player: Player, itemId: string): boolean
	-- …
	return true
end

return Payments
```

## Separation of concerns inside a package

* A module holds one concern. A module named `Manager` that also renders, also
  validates, and also persists is three modules.
* Modules call each other downward. A cycle between two modules in a package is
  a missing third module — extract the shared state.
* A package never reaches into another package's internals, and never mutates
  another package's instances.
* Configuration constants live in one module per package, referenced by every
  other module in it. Two modules defining the same constant is a bug.

## A Package Syncs Against a DataModel, and Owns No Place Settings

`ServerScriptService`, `StarterPlayerScripts`, and `ReplicatedStorage` are only
reachable from a project whose root is a `DataModel`. A package in this
workspace therefore syncs against a `DataModel` root — **structurally it is a
place project**, and that is not a contradiction to be resolved.

What makes it a package is what the project file does *not* contain. A package
scaffolds no baseplate, authors no `Lighting` or `SoundService` override, and
dictates nothing about the place that requires it. The place keeps ownership of
its own settings; the package only maps its source directories onto the shared
services.

So the two claims are compatible, and each has an owner:

| Claim | Owner |
|---|---|
| The *shape* — a `DataModel` root, four mapped directories | The project file |
| The *settings* — everything else about the place | The place, which the package never writes |

When a package project is scaffolded, strip the generator's place-owned
settings before committing it. A package that dictates the place's lighting or
its baseplate has stopped being a package.

## Related

* [`asset-submodules.md`](asset-submodules.md) — 3D asset packages, which sit
  beside code packages and follow the same rule of one owner each.
* [`../language/luau-authoring.md`](../language/luau-authoring.md) — the typed
  signatures a package's public surface is declared with.
