---
name: roblox-architecture-asset-submodules
description: 3D assets live in RBAssets repositories wired in as Git submodules, kept separate across the Base, Volume, and Place repositories.
version: 1.0.0
author: RBZagan
---

# Asset Submodules

Applies to every Roblox repository in this workspace that ships 3D content.

## Assets live in `RBAssets`, never in a code repository

3D assets — models, meshes, materials, sounds, animations — are versioned in the
`RBAssets` repositories and consumed by a code repository as a Git submodule.

* A code repository does not carry asset files. It carries the submodule pointer.
* Bump the pointer deliberately, in its own change. A pointer bump inside a
  gameplay change is unreviewable: the diff shows code and assets together and
  neither can be read.
* A submodule is never edited from inside the consuming repository. Commit to
  the `RBAssets` repository and bump the pointer.
* Record the asset name as well as the pointer in the commit, so a reader knows
  what moved.

## `Base`, `Volume`, and `Place` are separate concerns

| Repository | Holds | Changes when |
|---|---|---|
| `RBAssets/Base` | Assets shared by every place — common materials, UI, shared props | A shared asset changes |
| `RBAssets/Volume` | Assets for one volume of the game — a map, a lobby, an arena | That volume's content changes |
| `RBAssets/Place` | Assets bound to one place — that place's unique dressing | That place is dressed |

* Put an asset in exactly one of the three, by how widely it is reused. Base is
  for assets with no owner but the project; Volume for assets owned by one
  volume; Place for assets owned by one place.
* An asset that is about to be copied into two volumes is a Base candidate, not
  two Volume copies. Duplicated assets drift, and the drift is invisible until
  a bug report describes only one of them.
* Do not move an asset between the three as part of a change that needs it
  somewhere else. Move it in its own change, so the pointer bump shows it.

## Precision in referencing

* Reference an asset by its path inside the owning repository, and by the
  submodule and revision that supply it. "We use the new lobby" is not a
  reference; a path at a revision is.
* Keep the path a consumer uses and the path the asset actually has in step. A
  rename on the asset side without the consumer update is a broken build that
  passes review because nothing in the code repository changed meaning.

## Related

* [`package-architecture.md`](package-architecture.md) — the code-side rule for
  one owner per module.
* [`../toolchain/rojo-studio-mcp.md`](../toolchain/rojo-studio-mcp.md) — how
  submodules reach the Studio tree without a second hand-built copy.
