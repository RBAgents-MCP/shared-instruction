---
name: memory-index
description: Index of .agents/memory/ - repository state and decisions. Read every session so work continues rather than restarts.
---

# Memory Index

**Scope:** `.agents/memory/`
**Parent:** [`root-index.md`](root-index.md)

This index is the standing exception to the routing protocol: it is read **every
session**, because continuity depends on it. Load only the rows whose scope matches the
current request.

## State

| File | Purpose |
|---|---|
| [`../memory/state/repository-state.md`](../memory/state/repository-state.md) | Current known state: what exists, the stack, what is not built, and the next obvious step. |

## Decisions

| File | Purpose |
|---|---|
| [`../memory/decisions/harness-branch-naming.md`](../memory/decisions/harness-branch-naming.md) | Why a harness-designated branch never overrides the branching strategy. |

## Tasks

| File | Purpose |
|---|---|
| [`../memory/tasks/http-transport-container.md`](../memory/tasks/http-transport-container.md) | Branch `build/http-transport-container`: host allow-list, explicit bind, drain-before-close, cross-platform `start:http`, container image, real-socket test. |
| [`../memory/tasks/per-file-tools.md`](../memory/tasks/per-file-tools.md) | Branch `feat/per-file-tools`: one tool per markdown file, generated at boot; `roblox_instruction` and the `path` argument removed; baseline, plan deviations, and what was reported rather than fixed. |
| [`../memory/tasks/express-cluster-migration.md`](../memory/tasks/express-cluster-migration.md) | Express at `POST /mcp` and cluster workers, deleting the shim that bridged the SDK `Host` middleware to a raw `node:http` response. |

## Maintenance

Any file added to or removed from `.agents/memory/` is reflected here **in the same
commit**. Memory is written freely and needs no approval — see
`agents://rules/memory-policy.md`.
