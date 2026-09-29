# 1.0.0

**Released:** 2026-09-29

The surface becomes the set. Every markdown file under `content/` is now its own MCP tool,
named from that file's own basename, described by that file's own frontmatter. A major
bump, because `roblox_instruction` is gone and the way a caller reaches the set has
changed with it.

This is also the first version whose changelog matches the tree. `0.1.0` describes zod
schemas, four sample tools, and an optional `API_KEY`; none of those are in this
repository. That entry is history and is left as written.

## Added

- `src/tools/from-content.js` — walks `content/` once at import and builds the whole tool
  surface: one tool per markdown file, name derived from the basename (`.md` dropped,
  lowercased, `-` to `_`, folder discarded), description taken from the file's frontmatter
  `description:`. Exports `CONTENT_TOOLS`, `TOOL_FILES`, and a default.
- A boot-time guard in that module. The process fails, rather than serving something
  wrong, on a derived name that is not a valid MCP tool name, on a name two files both
  claim, on a file with no frontmatter `description:`, and on an empty set.
- Eleven tools: `roblox_index`, `luau_authoring`, `naming_conventions`,
  `package_architecture`, `asset_submodules`, `data_store_management`, `character_auras`,
  `trust_boundaries`, `zero_trust_networking`, `rojo_guide`, `rojo_studio_mcp`.
- Tests that pin the files-to-tools bijection in both directions, that every name is
  derived from its own filename, that names are unique, that every tool serves its file
  byte for byte with the frontmatter intact, and that the total served text equals the
  total markdown on disk.
- `wiki/logs/1/0/0/`, this file.

## Removed

- **`roblox_instruction`, and the `path` argument with it.** This is the breaking change.
  A caller that asked for `roblox/toolchain/rojo-guide.md` now calls `rojo_guide`. No
  alias is kept — an alias would preserve exactly the surface being replaced.
- `src/tools/roblox-instruction.js`, the per-tool module that took the path.
- `readSetFile` and the `..`-rejecting traversal check in `src/content.js`. The check
  existed to guard a caller-supplied path; with no path argument there is nothing to
  guard, and a defence with no caller reads as load-bearing to the next person who finds
  it. `src/content.js` is now just the set root, `CONTENT_DIR`.
- The traversal, unknown-path, set-root, and path-schema tests. They were correct, and
  they were about a tool that no longer exists.
- The four tests in the suite that hard-coded a one-tool surface.

## Changed

- `src/server.js` freezes the generated array as `TOOL_MODULES` and registers each tool
  with the three-argument form. The `if (config.schema)` branch is gone: no generated
  tool declares a schema, so it could only ever have been unreachable.
- The server `instructions` prose named `roblox_instruction` and told a caller to start at
  a path. It now describes the per-file surface and routes through `roblox_index`. The
  pointer to `lxagents-agents-base` for branch and commit conventions is unchanged — it
  is true, and it is load-bearing.
- `test/http.test.js` called a tool with `{ path }` in two cases, which is the same
  change arriving through the transport plan merged after this one was written. The
  byte-comparison case now calls a tool the way a client does, with no arguments; the
  traversal case became the claim that survives, which is that no tool advertises an
  argument over a real socket either.
- `.agents/rules/tool-authoring.md` was rewritten. It told a contributor to hand-write a
  file under `src/tools/` and register it — the one document in the repository that would
  have actively misled the next person. Adding a markdown file to `content/` is now
  adding a tool.
- Documentation corrected in the same change: `README.md`,
  `wiki/information/overview.md`, `wiki/information/architecture.md`,
  `wiki/environments/setup.md`, `wiki/environments/docker.md`,
  `.agents/rules/repository.md`, and `.agents/wiki/context/repository-map.md`.

## Security

- The read-only property is **structural, and stronger than before**. No tool takes an
  argument at all, so there is no verb to act on, no credential to present, and no path
  to traverse with. The set is read into memory at boot, so a call is a map lookup and
  the read path does no filesystem I/O at all.

## Known, reported, not fixed

- `content/index/roblox-index.md` carries a `**Parent:**` link to
  `content/index/root-index.md`, which does not exist in this repository. `content/` is a
  delivery surface for the upstream workspace set and is not edited here; the link needs
  fixing where the set is authored.
- `zod` remains a direct dependency in `package.json` while nothing in `src/` imports it,
  now that the only tool with a schema is gone. Left alone deliberately — it resolves
  through the SDK either way, and removing a declared dependency is the owner's call.
