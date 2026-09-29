#!/usr/bin/env node

/*
 * Server entry point.
 * Nothing here may write to stdout: on stdio, stdout is the JSON-RPC channel.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { allowedHosts, createApp } from "./app.js";
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

if (transportName === "http" || transportName === "streamable-http") {
  /*
   * In-flight requests. The transport is stateless - a fresh McpServer per
   * request - so "the live sessions" here are the requests currently being
   * answered. Tracked only so shutdown can close them deliberately.
   */
  const inFlight = new Set();

  const httpServer = createApp({ inFlight }).listen(port, host, () => {
    process.stderr.write(
      `${SERVER_ID} ${version} serving over http on ${host}:${port}/mcp\n`
    );
  });

  /*
   * Said before listen(), not inside its callback.
   *
   * The ordering is deliberate and the suite depends on it: the guard state is
   * announced whether or not the bind succeeds, so an operator reading a log that
   * never got a startup line still learns that no allow-list is in force. A
   * control that is off silently reads as present.
   */
  if (allowedHosts().length === 0) {
    process.stderr.write(
      "MCP_ALLOWED_HOSTS is unset - the Host allow-list is off and every Host header is accepted\n"
    );
  }

  /*
   * Drain-before-close. The order is the point: stop new arrivals first, then
   * let each in-flight request be closed deliberately rather than abandoned when
   * the process exits, and only then exit. Closing the listener and exiting in
   * one step is what drops sockets under a peer that was still being answered.
   */
  const shutdown = () => {
    httpServer.close();

    const pending = [...inFlight];
    if (pending.length === 0) {
      process.exit(0);
      return;
    }

    process.stderr.write(`draining ${pending.length} in-flight request(s)\n`);
    void Promise.allSettled(pending.map((request) => request())).then(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} else {
  const server = createServer({ version });
  await server.connect(new StdioServerTransport());
  process.stderr.write(`${SERVER_ID} ${version} serving over stdio\n`);
}
