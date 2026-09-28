---
name: roblox-language-luau-authoring
description: Luau only, never standard Lua — strict mode, export type, and typed signatures on every function this project writes.
version: 1.0.0
author: RBZagan
---

# Luau Authoring

Applies to every `.luau` and `.lua` file in every Roblox repository in this
workspace.

## Write Luau, not Lua

Target the Luau runtime that Roblox ships. Never write code that only runs
under standard Lua 5.1.

| Never | Write instead |
|---|---|
| `module()` string calls | `return {}` from a `ModuleScript` |
| `setfenv` / `getfenv` | nothing — use locals and `export type` |
| `loadstring` | `load` with a Luau chunk type |
| `unpack` | `table.unpack` |
| `string.gfind` | `string.gmatch` |
| `os.*`, `io.*` | nothing — unavailable in Roblox |
| `#` on a function | `continue` or restructure |

A construct is Luau-only if Studio's type checker accepts it and stock Lua 5.1
does not. Compound assignment, `+=`, `//=`, `export type`, string interpolation
with backticks, and `continue` are all correct here.

## Every file is strict

Start every file with `--!strict`. A file that cannot be strict carries a
`--!nonstrict` on its first line and a comment saying why — not silence.

## Type what crosses a boundary

Use the static typing features rather than leaving them to inference.

* Declare a type with `export type` when a module's consumers need to name it.
  A type used by exactly one file stays a local `type`.
* Annotate every function parameter and return.
* Annotate every module-level variable whose type is not obvious from its
  initializer.
* Use refinement (`if typeof(x) == "Instance" then`) instead of `any` to narrow a
  value.
* Reserve `any` for a value that genuinely has no better type, and say so in a
  comment on the same line.

```luau
--!strict
local ReplicatedStorage = game:GetService("ReplicatedStorage")

export type AuraDefinition = {
	Id: number,
	DisplayName: string,
	Attachment: Attachment,
}

local function resolveAura(id: number): AuraDefinition?
	local registry: { [number]: AuraDefinition } = {}
	return registry[id]
end

return { resolveAura = resolveAura }
```

## Structure survives the toolchain

Code written this way stays loadable by Rojo and addressable from the Roblox
Studio MCP server — see
[`../toolchain/rojo-studio-mcp.md`](../toolchain/rojo-studio-mcp.md). Do not
rely on a construct that only a Rojo plugin or a hand-edited Studio instance
provides.

## Related

* [`../conventions/naming-conventions.md`](../conventions/naming-conventions.md) —
  the names these typed declarations use.
* [`../architecture/package-architecture.md`](../architecture/package-architecture.md) —
  where a `ModuleScript` that exports a type is allowed to sit.
