---
name: memory-state-repository-state
description: Current known state of rbagents-shared-instruction - what exists after the template was turned into a read-only instruction server, and the next obvious step.
---

# Repository State

## What this repository is right now

`rbagents-shared-instruction` is a working dual-purpose MCP server and CLI at version `1.0.0`. It serves
the Roblox development set read-only. It is no longer a template: `PROMPT.md` and `template-mode.md` are
gone, and the set is the tool surface — 11 tools, one per file, generated at boot.

## Stack

Node.js 20+, ESM, no build step. Three runtime dependencies:
`@modelcontextprotocol/sdk`, `express` and `zod`. Tests are `node --test`, no framework.

## What exists

* **The set.** `content/` holds 11 markdown files, copied verbatim from the workspace
  set with their frontmatter intact, routed by an index under `content/index/`.
* **Tool layer.** `src/tools/from-content.js` walks `content/` once at import and
  builds the whole surface: one tool per file, named from the basename, described by
  that file's frontmatter `description`. `src/server.js` freezes it as
  `TOOL_MODULES` and registers each with the three-argument form. Adding a file to the
  set adds a tool; nothing is registered by hand.
* **No path argument.** The single `roblox_instruction` tool is gone. No tool takes an
  argument, so there is no verb, no credential and no path to traverse with. The
  `readSetFile` traversal check in `src/content.js` went with it rather than being left
  as a defence with no caller; `src/content.js` is now just `CONTENT_DIR`.
* **Read-only, structurally.** No tool opens a socket, and the set is read into memory
  at boot, so a call is a map lookup with no filesystem I/O on the read path. The code
  that would write is absent rather than disabled.
* **Surface parity.** `src/cli.js` prints `listTools()` from `src/server.js`;
  `test/server.test.js` pins the CLI list against the MCP client's `tools/list`.
* **Instruction system.** Mode B - `AGENTS.md` plus `.agents/`, resolving the shared set
  through the `lxagents-agents-base` connector. Local rules: `repository`,
  `tool-authoring`, `secrets`. No overrides.
* **Documentation.** `wiki/information/` and `wiki/environments/`, all updated in the
  same commit as the code change they describe, plus changelogs at `wiki/logs/0/1/0/`
  and `wiki/logs/1/0/0/`.
* **Container image.** `Dockerfile` and `.dockerignore`, running `src/index.js` with
  `MCP_TRANSPORT` selecting the transport. **Written and never built** — see
  [`../tasks/http-transport-container.md`](../tasks/http-transport-container.md).
* **HTTP transport as an express application.** `src/app.js` builds the app and
  returns it without listening; `src/index.js` owns the port, the interface, the
  `inFlight` set and the drain. The `Host` guard is the SDK's
  `hostHeaderValidation` **mounted natively** — the hand-written `hostGuard` shim
  that inferred refusal from whether a stand-in `res.json()` was called is deleted.
  See [`../decisions/express-for-http-transport.md`](../decisions/express-for-http-transport.md).

## What is not built

* The HTTP transport is stateless and unauthenticated, and it is not a stateful
  server in front of a store. `MCP_ALLOWED_HOSTS` narrows which `Host` header
  values are answered, and is **off when unset** — narrower than no check at all,
  and still not authentication.
* No CI workflow, no linter, no formatter.
* `content/` is a copy. A change to the set belongs upstream in the workspace set first;
  this repository is a delivery surface for it, not its editor.
* `zod` is still a direct dependency in `package.json` but nothing in `src/` imports it
  any more, now that the only tool that had a schema is gone. Reported, not removed —
  see the task record.

## Shared set

Resolved through the `lxagents-agents-base` MCP connector. Nothing shared is vendored
here, and there are no overrides - see
[`../../index/root-index.md`](../../index/root-index.md).

## Next obvious step

Add CI that runs `npm test` on push. The suite is the only thing holding the two surfaces
together, and now also the only thing forcing `content/index/roblox-index.md` to stay
complete as files are added — nothing runs it automatically.
