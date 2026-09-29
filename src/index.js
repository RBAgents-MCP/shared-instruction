#!/usr/bin/env node

/*
 * Server entry point.
 * Nothing here may write to stdout: on stdio, stdout is the JSON-RPC channel.
 */

import { createServer as createHttpServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { SERVER_ID, createServer } from "./server.js";
import { version } from "./version.js";

const transportName = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

/*
 * The bind address, named rather than implied.
 *
 * listen(port) with no host binds every interface. That is what a published port
 * needs and what a container gets, but it is a decision nobody made - so it is
 * made here, visibly, and HOST=127.0.0.1 is the way to take it back.
 */
const host = process.env.HOST ?? "0.0.0.0";

/*
 * The Host allow-list, off when the variable is unset or empty.
 *
 * The SDK's own Express application applies Host validation automatically, but
 * only when the host is loopback. A container binds every interface, which is
 * exactly the case where the guard would be off, so this server applies it
 * explicitly instead of inheriting it. An empty value means the guard is off -
 * the safe-looking default is the unsafe one.
 */
const allowedHosts = (process.env.MCP_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

async function readBody(req, limit = 4 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("request body too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function rpcError(res, status, code, message) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

/**
 * Wrap the SDK's Host allow-list for a plain node:http server.
 *
 * The middleware is Express-shaped: it refuses with `res.status(code).json(body)`
 * and hands control on with `next()`. This server has neither, so it is given the
 * two methods the middleware actually reaches for and a no-op next. The guard is
 * the SDK's - only the response writer is ours, which is why the decision to drop
 * express cost nothing here.
 *
 * @param {string[]} hosts Allowed hostnames, without ports.
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => boolean}
 *   True when the request may continue.
 */
function hostGuard(hosts) {
  const middleware = hostHeaderValidation(hosts);
  return (req, res) => {
    let refused = false;
    const shim = {
      status: (code) => ({
        json: (body) => {
          refused = true;
          rpcError(res, code, body.error.code, body.error.message);
        },
      }),
    };
    middleware(req, shim, () => {});
    return !refused;
  };
}

if (transportName === "http" || transportName === "streamable-http") {
  const guard = allowedHosts.length > 0 ? hostGuard(allowedHosts) : null;

  const httpServer = createHttpServer(async (req, res) => {
    // Before the body parser, and before any route: a request that fails the
    // Host check must not be able to reach a handler at all.
    if (guard && !guard(req, res)) return;

    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: SERVER_ID, version }));
      return;
    }

    if (req.url !== "/mcp") {
      rpcError(res, 404, -32601, `Not found: ${req.url}`);
      return;
    }

    if (req.method !== "POST") {
      rpcError(res, 405, -32000, `${req.method} is not supported in stateless mode`);
      return;
    }

    let body;
    try {
      body = await readBody(req);
    } catch {
      rpcError(res, 400, -32700, "Parse error: request body is not valid JSON");
      return;
    }

    const server = createServer({ version });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      if (!res.headersSent) rpcError(res, 500, -32603, String(error));
    }
  });

  if (guard === null) {
    process.stderr.write(
      "MCP_ALLOWED_HOSTS is unset - the Host allow-list is off and every Host header is accepted\n"
    );
  }

  httpServer.listen(port, host, () => {
    process.stderr.write(
      `${SERVER_ID} ${version} serving over http on ${host}:${port}/mcp\n`
    );
  });

  const shutdown = () => httpServer.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} else {
  const server = createServer({ version });
  await server.connect(new StdioServerTransport());
  process.stderr.write(`${SERVER_ID} ${version} serving over stdio\n`);
}
