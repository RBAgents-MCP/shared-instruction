---
name: memory-tasks-http-transport-container
description: Task record for build/http-transport-container - harden the HTTP transport this repository already has and add a container image. Entries appended as the work lands.
---

# Task — HTTP transport and container

Branch: `build/http-transport-container`, off `master`.

The premise the request started from was wrong in a way that shaped the whole task:
this repository **already has** an HTTP transport. `src/index.js` reads
`MCP_TRANSPORT` and, on `http`, serves `GET /healthz` and `POST /mcp` over
`StreamableHTTPServerTransport` with `node:http`. So this task configures that
transport and adds a container; it does not add a second one.

**Decided by the owner before any code was written:** keep
`StreamableHTTPServerTransport`. No `express`, no `src/http.js`, no
`SSEServerTransport` — the SDK deprecates it in favour of what already runs here.
The Dockerfile entrypoint is `node src/index.js` with `MCP_TRANSPORT=http`.

**Not decided, and not assumed:** delivery (no pull request without asking), the
version bump (needs the owner; the branch collides with `feat/per-file-tools` on
`package.json`), and whether anyone builds the image.

## Baseline

`npm install` then `npm test` on `master`: **12 tests, 12 pass, 0 fail**, all in
memory in `test/server.test.js`. None starts a process or opens a socket, so a green
baseline said nothing about the HTTP path. (The plan predicted 10 tests; it is 12.)

## Entries

### S1, S2, S3 — the container files

`Dockerfile`, `.dockerignore`, and `wiki/environments/docker.md` are written, plus
the `project-wiki-index.md` row in the same commit.

`FROM node:22-alpine`, `WORKDIR /srv`, `npm ci --ignore-scripts --omit=dev`,
`COPY src ./src`, `COPY content ./content`, `EXPOSE 3000`, `USER node`,
`ENTRYPOINT ["node", "src/index.js"]`. Every path `COPY`ed exists in this
repository. The entrypoint serves **stdio** unless `MCP_TRANSPORT` says otherwise,
which is why the image does not serve HTTP by itself.

`.dockerignore` keeps patterns for `.github/` and `compose.yaml`, which this
repository does not have — a pattern for an absent path costs nothing.

**No Docker command was run.** Not `build`, not `run`, not `version`. `docker.md`
says the image has never been built, in those terms, and retiring that sentence is
the owner's call.
