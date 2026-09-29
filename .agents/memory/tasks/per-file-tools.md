---
name: memory-tasks-per-file-tools
description: Branch feat/per-file-tools - one MCP tool per markdown file in content/, generated at boot. Records the baseline, the deviations from the plan, and what was reported rather than fixed.
---

# Task — per-file tool surface

**Branch:** `feat/per-file-tools` (off `master`)
**Version:** `0.1.0` → `1.0.0`
**Plan:** [`.agents/plans/tasks.md`](../../../plans/tasks.md)
**Delivery:** local commits only — no push, no pull request, no merge. The owner's
standing instruction set aside the repository's own delivery gate for this run.

## What landed

Eleven tools, one per markdown file under `content/`, generated at boot by
`src/tools/from-content.js`. `roblox_instruction` and its `path` argument are removed.
The read path does no filesystem I/O: the set is read once at import and a call is a map
lookup.

| Commit | Change |
|---|---|
| `feat: serve one tool per Roblox guide` | `from-content.js`, `src/server.js`, delete `roblox-instruction.js` |
| `test: pin the per-file tool surface` | `test/server.test.js` rewritten |
| `refactor: drop the path argument from the Roblox surface` | `src/content.js`, `test/http.test.js` |
| `docs: correct the tool surface across the repository` | T7–T8 |
| `chore: release 1.0.0` | T9 |
| `docs: record the per-file tool task` | this file |

## Baseline

```
baseline: 22 / 22 on master @ ad5b281
```

Recorded before anything was touched, as `verification.md` requires. The suite had not
been run in this session before that.

**After:** `npm test` is **22 / 22** again. The count is coincidentally the same and the
membership is not: 12 cases went, 12 came. Removed — CLI parity was kept, but these did
not: `roblox_instruction is the only tool`, `roblox_instruction advertises the path it
takes`, `roblox_instruction returns a convention from the set`, `all ten Roblox
conventions are served`, `a traversal attempt reports not found and leaks nothing`, `an
unknown path inside the set reports not found`, `the set root itself is not a file`,
`the index is reachable and routes the ten files`, `no tool accepts a write verb`,
`no tool accepts a credential`, `the server needs no key to answer`, plus
`the traversal defence survives the network` in `http.test.js`. Added — the surface is
the eleven tools; the tool list and the files on disk are a bijection; every tool name
is derived from its own filename; every tool has a distinct name and a description;
no tool takes an argument; every tool returns its own file whole and with frontmatter;
the whole set is served and nothing is served twice; `roblox_index` is the entry point
and routes the ten files; the argument-free surface survives the network.

## Deviations from the plan, and why

1. **`CONTENT_DIR` is imported from `../content.js`, not `../version.js`.** T2 says
   `../version.js`. This repository's `version.js` exports only `version`, and
   `verification.md` item 11 requires `src/version.js` to be untouched — so the two
   cannot both hold. The set root stayed where it already lived, and T6 then had a real
   decision to make rather than a none.
2. **`test/http.test.js` was edited; the plan does not name it.** It carried a
   `{ path }` argument in two cases. The plan predates the transport plan merged into
   `master` (PR #2), and the same removal reaches that file by the same argument. Both
   cases were changed rather than left failing.
3. **The empty `NAME_OVERRIDES` object was kept.** `scope.md` says this set needs no
   override, and none was added. The mechanism stays so the next set that needs one does
   not have to invent it, and the two boot-error messages point at it.
4. **`zod` was left in `package.json`.** Nothing in `src/` imports it now that the only
   tool with a schema is gone. Removing a declared dependency is the owner's call, and
   `verification.md` does not ask for it. Reported below.
5. **`wiki/environments/docker.md` was edited** for the version tag, though `docs-to-correct.md`
   does not list it. It carries `rbagents-shared-instruction:0.1.0` in four places and a
   `"version":"0.1.0"` sample response, all of which the release falsifies.
6. **T4 says it "needs the owner's go-ahead"**; it was executed. The instruction to run
   the plan end to end is that go-ahead.

## Reported, not fixed

* **`content/index/roblox-index.md` has a dead `**Parent:**` link** to
  `content/index/root-index.md`, which does not exist in this repository. The index is
  what a caller routes on, so this is more than cosmetic. It is in `content/`, and this
  repository delivers the set rather than editing it — `AGENTS.md` says so directly.
  Fixing it here would quietly fork the file from its source. It needs raising where the
  Roblox set is authored. See
  [`../../../plans/discovery-findings.md`](../../../plans/discovery-findings.md).
* **The set has no `root-index.md` at all** where the `LXAgents-MCP/shared-instruction`
  copy has one at `content/index/root-index.md`. That may be deliberate — a single-domain
  set needs one router, not two — or it may be the same omission that produced the dead
  link. The two repositories are otherwise near-identical in shape, so a reader will
  assume the difference is deliberate. **Worth the owner confirming.**
* **`zod` is an unused direct dependency.** See deviation 4.
* **`content/roblox/security/trust-boundaries.md` and `zero-trust-networking.md` are
  byte-identical in `RBAgents-MCP/shared-instruction` and `RBAgents-MCP/security`.** A
  change to one will silently not reach the other, and nothing in either repository can
  see that. `duplicate-instruction-audit.md` covers a repository vendoring the *shared*
  set; it does not cover two sibling organizations holding the same content file, each as
  its own delivery surface. **That is a gap in a shared rule, and the finding most worth
  raising against the shared set.** Whether the Roblox security files should live in one
  repository is the owner's design call, not this change's.
* **`wiki/logs/0/1/0/CHANGELOG.md` describes zod schemas, four sample tools, and an
  optional `API_KEY`.** None is in this tree. History is not rewritten; the consequence is
  that `1.0.0` is the first accurate changelog here.

## Verification

`verification.md` run in full. Every check passes: `npm test` 22/22; `listTools()` returns
11 entries with the exact names in `tasks.md`; the traversal, unknown-path, set-root and
path-schema tests are gone from the file rather than passing; the bijection holds both
ways; no tool declares an input schema; `roblox_index` is reachable and names all ten
files under `roblox/`; total served text equals total markdown on disk;
`node src/cli.js tools` prints the eleven names and matches `tools/list`;
`git grep -iE 'roblox_instruction|"path"|path argument'` leaves only deliberate
"this is gone" statements and explanatory source comments; `package.json` is `1.0.0` and
`src/version.js` is untouched; the changelog and the `1.0.0` logs row exist; the
session-link scan is empty.

Items 16–18 of `verification.md` are the *after push* checks and were not run: this task
delivered local commits only.

## Next

CI that runs `npm test` on push. The suite is now the only thing holding the two surfaces
together **and** the only thing forcing `content/index/roblox-index.md` to stay complete
as files are added to the set.
