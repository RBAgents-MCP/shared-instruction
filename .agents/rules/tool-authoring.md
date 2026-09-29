---
name: tool-authoring
description: The contract for the tool surface - one tool per markdown file under content/, generated at boot by src/tools/from-content.js. There is no per-tool source file to hand-write.
---

# Tool Authoring

**There is no per-tool source file.** One tool is one markdown file under `content/`, and
the tool that serves it is generated at boot by `src/tools/from-content.js`. Adding a
markdown file to the set *is* adding a tool.

## The surface is read-only, and argument-free

No tool takes an argument, so there is no verb to act on, no credential to present, and no
path to traverse with. None of them opens a socket either. Do not add a tool that takes a
verb, a credential, or a network call.

The property is **structural**: the code that would write is absent, not disabled behind
a check. That is stronger than a permission check on a general-purpose tool, and it is
what a consuming repository depends on when it points at this server — it cannot mutate
the set, because there is nothing here that mutates anything.

## How a name is derived

Basename, with the folder dropped; `.md` removed, lowercased, `-` turned to `_`.

| File | Tool |
|---|---|
| `index/roblox-index.md` | `roblox_index` |
| `roblox/security/trust-boundaries.md` | `trust_boundaries` |
| `roblox/toolchain/rojo-studio-mcp.md` | `rojo_studio_mcp` |

Dropping the folder is what keeps the names a caller types short. The cost is that two
folders holding the same filename collide — which is a **startup error**, not a silent
shadow, so the collision is caught by booting rather than by a caller noticing.

`NAME_OVERRIDES` in `from-content.js` is the escape hatch for a basename that cannot
survive derivation. This set needs no entry; adding one is a deliberate, explained
exception, not a convenience.

## What the generator requires of a file

`from-content.js` fails the process, rather than serving something wrong, on:

* a derived name that is not a valid MCP tool name — `/^[a-z][a-z0-9_]{0,63}$/`;
* a name two files both derive;
* a file with **no frontmatter `description:`** — the description is the tool
  description, and a file without one is a tool a client cannot route on;
* an empty set.

So a file that is going to be served needs, at minimum:

```markdown
---
name: some-name
description: One line an agent can route on without calling the tool.
---
```

`version:` and `author:` are not required by the generator, but the set carries them on
every file and `wiki/logs/` history is written from them. Add all four.

## Registration

There is nothing to register. `src/server.js` freezes the generated array:

```js
import { CONTENT_TOOLS } from "./tools/from-content.js";
const TOOL_MODULES = Object.freeze(CONTENT_TOOLS);
```

and registers each with the three-argument form, because no generated tool declares a
schema:

```js
server.tool(config.name, config.description, handler);
```

Do not add a tool outside `TOOL_MODULES` — `listTools()` and the CLI both read that array,
so anything registered elsewhere is invisible to both.

## Authentication

No tool in this repository needs a credential. If one ever did, it checks **inside the
handler** — see [`secrets.md`](secrets.md). Never at module scope, and never as a
condition on whether the tool is registered.

## Reading from the set

`CONTENT_DIR` in `src/content.js` is the only place the set root is defined, and the
generator resolves every read from a path it walked itself. There is no `readSetFile` and
no caller-supplied path to validate — do not reintroduce either as a "convenience", and
do not call `fs` from anywhere else. A second way to read the filesystem is a second thing
to get right.

## The set is not edited here

`content/` is a delivery surface. A convention change belongs upstream, in the workspace
set that authors it, and is then copied in. Fixing a file here forks it from its source.

## Errors

The set is read at boot, so a malformed file fails the process with a plain `Error`
saying which file and why. There is no per-call error path to design: a tool either exists
and returns its file, or the server did not start.

## Tests

`test/server.test.js` pins the surface, and every case in it is a property rather than a
sample:

* the tool list and the files on disk are a bijection, in both directions;
* every name is derived from its own filename, and names are unique;
* **no tool declares an input schema** — the structural claim, and the replacement for the
  traversal defence the old path-taking tool needed;
* every tool serves its file byte for byte, frontmatter intact;
* the total text returned across the tools equals the total markdown on disk;
* `roblox_index` routes all ten files under `roblox/`.

The last one is what forces the index to stay complete as files are added. Adding a
convention without adding it to `content/index/roblox-index.md` fails the suite.
