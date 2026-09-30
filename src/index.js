#!/usr/bin/env node

/*
 * Server entry point.
 * Nothing here may write to stdout: on stdio, stdout is the JSON-RPC channel.
 */

import cluster from "node:cluster";
import { availableParallelism } from "node:os";
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

/**
 * How many HTTP workers to run.
 *
 * `MCP_CLUSTER_WORKERS` overrides the count. **A value of 1 means no forking at
 * all** - one process, one listener, the pre-cluster behaviour - which is what
 * makes this change bisectable: the same code answers, with and without workers,
 * and a difference between them is a difference in the fork rather than in the
 * transport.
 *
 * Unset, the count is the number of CPUs the process was actually given, not a
 * constant: a container with two CPUs gets two workers and a laptop does not get
 * sixteen. Anything that is not an integer of at least 1 - unset, empty, `0`, a
 * word - is ignored rather than honoured, because a worker count of zero would
 * mean a server that answers nothing.
 *
 * @returns {number}
 */
function workerCount() {
  const configured = Number.parseInt(process.env.MCP_CLUSTER_WORKERS ?? "", 10);
  if (Number.isInteger(configured) && configured >= 1) return configured;
  return Math.max(1, availableParallelism());
}

/**
 * The worker: the process that actually answers.
 *
 * Every worker binds the same `port`. The kernel's shared handle and the round-robin
 * scheduler do the distribution - no `SO_REUSEPORT` is set by hand and no sticky
 * session logic is written, because the scheduler already has the information (which
 * connection is next) that a sticky-session scheme would have to reconstruct.
 */
function startWorker() {
  /*
   * A worker whose primary is gone holds the port for whoever starts next, and keeps
   * answering requests nobody is supervising. Not optional: the test suite kills the
   * primary outright with SIGKILL, so without this the suite would leak a worker per
   * failed run and the *next* run would fail on EADDRINUSE against a process nobody
   * remembers starting.
   */
  process.on("disconnect", () => process.exit(0));

  /*
   * In-flight requests. The transport is stateless - a fresh McpServer per
   * request - so "the live sessions" here are the requests currently being
   * answered. Tracked only so shutdown can close them deliberately.
   */
  const inFlight = new Set();

  const app = createApp({ inFlight });

  /*
   * Said before listen(), not inside its callback.
   *
   * The ordering is deliberate and the suite depends on it: the guard state is
   * announced whether or not the bind succeeds, so an operator reading a log that
   * never got a startup line still learns that no allow-list is in force. A
   * control that is off silently reads as present.
   *
   * Each worker states it for itself, so a two-worker run says it twice. That is
   * the honest shape: two processes, two listeners, two unguarded entry points.
   */
  if (allowedHosts().length === 0) {
    process.stderr.write(
      "MCP_ALLOWED_HOSTS is unset - the Host allow-list is off and every Host header is accepted\n"
    );
  }

  const httpServer = app.listen(port, host, () => {
    process.stderr.write(
      `${SERVER_ID} ${version} serving over http on ${host}:${port}/mcp\n`
    );
  });

  /*
   * Drain-before-close, and it is logged by the process actually draining.
   *
   * The order is the point: stop new arrivals first, then let each in-flight
   * request be closed deliberately rather than abandoned when the process exits,
   * and only then exit. Closing the listener and exiting in one step is what drops
   * sockets under a peer that was still being answered. A worker that relayed a
   * primary's signal without doing this would print a drain it never performed.
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
}

/**
 * The primary: the process that forks workers and does not serve.
 *
 * It binds nothing, so the startup lines in a container's log describe ports that
 * are genuinely open - one per worker, from the processes that opened them. A
 * primary that logged a listening line of its own would be claiming a port it does
 * not hold.
 */
function startPrimary() {
  const count = workerCount();

  // Read by the respawn handler below, and set by the signal handler further down, so
  // it is declared before either can run rather than beside the one that reads it
  // first.
  let draining = false;

  if (count <= 1) {
    // No fork. The worker path is the whole server, and this line is what a
    // single-process run prints; saying so is worth a line of its own. Which of the
    // two reasons applies is named, because "MCP_CLUSTER_WORKERS is 1" and "this
    // machine has one CPU" are different facts about a deployment.
    const why = process.env.MCP_CLUSTER_WORKERS
      ? `MCP_CLUSTER_WORKERS is ${count}`
      : `only ${count} CPU is available`;
    process.stderr.write(`${SERVER_ID} ${version} ${why}, so no worker is forked.\n`);
    startWorker();
    return;
  }

  process.stderr.write(
    `${SERVER_ID} ${version} forking ${count} HTTP workers on ${host}:${port}/mcp\n`
  );

  /*
   * A worker that exits unexpectedly is replaced, but not forever: a server that
   * cannot start its workers is a server that should say so and stop, not one that
   * respawns into a crash loop nobody is watching.
   */
  let starts = 0;

  function forkWorker() {
    starts += 1;
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    if (draining) return;
    if (starts > count * 10) {
      process.stderr.write(
        `${SERVER_ID} ${version} a worker exited ${code ?? signal} ${starts} times, not restarting it.\n`
      );
      process.exit(1);
      return;
    }
    process.stderr.write(
      `${SERVER_ID} ${version} worker ${worker.process.pid} exited ${code ?? signal}, restarting it\n`
    );
    forkWorker();
  });

  for (let i = 0; i < count; i += 1) forkWorker();

  /*
   * Relay the signal, then wait.
   *
   * The signal goes to the workers rather than being handled here alone, because the
   * workers hold the requests and the listener. The primary exits when the last
   * worker is gone, so the port is genuinely closed before the process that started
   * it is - a test that stops the server and then checks the port is refused must
   * not race a primary that exits while its workers are still answering.
   */
  const shutdown = (signal) => {
    if (draining) {
      // A second signal means the operator has stopped waiting.
      process.exit(0);
    }
    draining = true;

    const workers = Object.values(cluster.workers ?? {}).filter(Boolean);
    process.stderr.write(
      `${SERVER_ID} ${version} ${signal}, draining ${workers.length} worker(s)\n`
    );

    // Unref'd: this timer is a backstop for a wedged worker, not a reason to keep
    // the process alive when every worker has already gone.
    const forced = setTimeout(() => process.exit(0), 10_000);
    forced.unref();

    let remaining = workers.length;
    for (const worker of workers) {
      worker.once("exit", () => {
        remaining -= 1;
        if (remaining === 0) {
          clearTimeout(forced);
          process.exit(0);
        }
      });
    }

    for (const worker of workers) worker.kill(signal);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

if (transportName === "http" || transportName === "streamable-http") {
  if (cluster.isPrimary) {
    startPrimary();
  } else {
    startWorker();
  }
} else {
  // stdio never forks. stdout is the JSON-RPC channel here, and a worker's copy of
  // it would corrupt the stream.
  const server = createServer({ version });
  await server.connect(new StdioServerTransport());
  process.stderr.write(`${SERVER_ID} ${version} serving over stdio\n`);
}
