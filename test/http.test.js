import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync, readdirSync } from "node:fs";
import { request as httpRequest, createServer as createNetServer } from "node:http";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BODY_LIMIT_BYTES } from "../src/app.js";
import { createServer, SERVER_ID } from "../src/server.js";

/*
 * The HTTP transport, over a real socket.
 *
 * test/server.test.js is entirely in-memory: no case in it starts a process or
 * opens a port, so a green suite says nothing about the path a container runs.
 * Every case here spawns src/index.js as its own process and speaks to it the
 * way a client would, because the parts most likely to be wrong - the route, the
 * Host check, the message path - are exactly the parts a stub would replace with
 * the assumption being tested.
 *
 * Nothing here hard-codes a tool count or a tool name. The surface is generated
 * from content/ and may change with the set; the count is read from listTools()
 * and the name is taken from that same call.
 */

const ENTRY = fileURLToPath(new URL("../src/index.js", import.meta.url));
const READY = "serving over http";
const UNSET_NOTICE = "MCP_ALLOWED_HOSTS is unset";

/** Every server this file spawns, so none is left running. */
const servers = new Set();

/** Every client this file opens, so none holds the event loop open. */
const openClients = new Set();

after(async () => {
  for (const client of openClients) await client.close().catch(() => {});
  for (const server of servers) stop(server);
});

function stop(server) {
  if (server.exitCode === null && server.signalCode === null) server.kill();
}

/** A port nothing is listening on, so two cases never collide. */
async function freePort() {
  const probe = createNetServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/**
 * Resolve once the server's output contains `needle`, or reject if it dies or
 * runs out of time. Polled rather than piped because the same output has to be
 * readable afterwards, for the assertions that care what was *not* said.
 */
function waitForOutput(server, read, needle, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (read().includes(needle)) return resolve();
      if (server.exitCode !== null || server.signalCode !== null) {
        return reject(new Error(`server exited before "${needle}". Output:\n${read()}`));
      }
      if (Date.now() > deadline) {
        return reject(new Error(`timed out waiting for "${needle}". Output:\n${read()}`));
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}

/**
 * How many times `needle` has appeared in a stream so far.
 *
 * Not a boolean: with `MCP_CLUSTER_WORKERS=2` the startup line is printed once per
 * worker, and "the line appeared" cannot tell one worker from two. Counting it is
 * how the suite observes that a fork happened without adding a pid to a response
 * body or a field to a log line that other cases already pin.
 */
function countOutput(read, needle) {
  return read().split(needle).length - 1;
}

/** Resolve once `needle` has appeared `n` times, or reject if the deadline passes. */
function waitForCount(server, read, needle, n, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (countOutput(read, needle) >= n) return resolve();
      if (server.exitCode !== null || server.signalCode !== null) {
        return reject(new Error(`server exited before "${needle}" x${n}. Output:\n${read()}`));
      }
      if (Date.now() > deadline) {
        return reject(
          new Error(`timed out waiting for "${needle}" x${n}, saw ${countOutput(read, needle)}. Output:\n${read()}`)
        );
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}

/**
 * Start the real server. `HOST=127.0.0.1` by default, or every case in this file
 * binds all interfaces for the duration of the suite.
 */
async function startServer(env = {}) {
  const port = await freePort();
  const server = spawn(process.execPath, [ENTRY], {
    env: {
      ...process.env,
      MCP_TRANSPORT: "http",
      PORT: String(port),
      HOST: "127.0.0.1",
      MCP_ALLOWED_HOSTS: "",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  servers.add(server);

  let stdout = "";
  let stderr = "";
  server.stdout.setEncoding("utf8");
  server.stderr.setEncoding("utf8");
  server.stdout.on("data", (chunk) => (stdout += chunk));
  server.stderr.on("data", (chunk) => (stderr += chunk));

  const started = {
    proc: server,
    port,
    stdout: () => stdout,
    stderr: () => stderr,
    countOutput: (needle) => countOutput(() => stdout + stderr, needle),
  };
  await waitForOutput(server, () => stdout + stderr, READY);
  return started;
}

/** Connect a real MCP client to the spawned server. */
async function connect(port) {
  const client = new Client({ name: "http-test-client", version: "0.0.0" });
  openClients.add(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  return client;
}

/** Connect a second client to the same implementation, without a socket. */
async function connectInMemory() {
  const server = createServer({ version: "0.0.0" });
  const client = new Client({ name: "memory-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  openClients.add(client);
  return { client, server };
}

/** The text of a single-content tool result. */
function textOf(result) {
  assert.notEqual(result.isError, true, "expected a successful result");
  assert.equal(result.content.length, 1, "expected exactly one content block");
  return result.content[0].text;
}

/**
 * A plain request with a chosen Host header.
 *
 * fetch drops a forbidden header rather than sending it, so an allow-list tested
 * through fetch would pass whatever the control really does.
 */
function requestWithHost(port, hostHeader, path = "/healthz", method = "GET") {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method, headers: { Host: hostHeader } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * A request with no `Host` header at all.
 *
 * `setHost: false` is what suppresses it — node:http otherwise fills the header in
 * on the caller's behalf, so the header is never actually absent and the SDK's
 * "Missing Host header" branch would be unreachable through the default client.
 */
function requestWithoutHost(port, path = "/healthz") {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, setHost: false }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

/** A raw `POST /mcp` with a body this test chose, bypassing the SDK client. */
function postToMcp(port, body) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(body, "utf8");
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: "/mcp",
        method: "POST",
        headers: {
          Host: `127.0.0.1:${port}`,
          "content-type": "application/json",
          "content-length": payload.length,
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: text }));
      }
    );
    req.on("error", reject);
    req.end(payload);
  });
}

/** Whether a TCP connect to `port` on `address` succeeds. */
function canConnect(address, port) {
  return new Promise((resolve) => {
    const req = httpRequest({ host: address, port, path: "/healthz", timeout: 2_000 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

test("the transport does not change the tool surface", async () => {
  const server = await startServer();
  const overHttp = await connect(server.port);
  const memory = await connectInMemory();

  const { tools: httpTools } = await overHttp.listTools();
  const { tools: memoryTools } = await memory.client.listTools();

  // JSON is the wire format on both sides of this comparison. The SDK leaves
  // `title`, `annotations` and `_meta` present-but-undefined on the in-memory
  // object, and no client - in memory or over a socket - ever sees those keys,
  // because JSON has no undefined. Comparing without normalising would assert
  // a difference in the transport that only exists in the object model.
  assert.deepEqual(httpTools, JSON.parse(JSON.stringify(memoryTools)));

  // Read from the server rather than a literal, so neither a plan that adds a
  // tool nor one that removes one fails a number nobody here wrote down.
  assert.ok(httpTools.length > 0, "the server exposes at least one tool");
  await memory.server.close();
});

test("a tool call over HTTP returns the same bytes as in memory", async () => {
  const server = await startServer();
  const overHttp = await connect(server.port);
  const memory = await connectInMemory();

  const { tools } = await overHttp.listTools();
  const name = tools[0].name;

  const overTheWire = textOf(await overHttp.callTool({ name, arguments: {} }));
  const inProcess = textOf(await memory.client.callTool({ name, arguments: {} }));

  assert.equal(overTheWire, inProcess);
  assert.match(overTheWire, /^---\r?\n/, "the served bytes reach the client intact");
  await memory.server.close();
});

test("the argument-free surface survives the network", async () => {
  const server = await startServer();
  const client = await connect(server.port);
  const { tools } = await client.listTools();

  // The structural replacement for the traversal case this file used to carry:
  // over a real socket, no tool advertises an argument, so there is nothing a
  // caller could traverse with. A path argument over the wire would have to come
  // back as a property in the advertised schema, and it does not.
  for (const tool of tools) {
    assert.deepEqual(
      tool.inputSchema.properties ?? {},
      {},
      `${tool.name} must take no argument over HTTP either`
    );
  }
});

test("the health check answers without a session", async () => {
  const server = await startServer();

  const response = await requestWithHost(server.port, `127.0.0.1:${server.port}`, "/healthz");
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.server, SERVER_ID);
  assert.match(body.version, /^\d+\.\d+\.\d+/, "the version the server reports is its own");
});

test("an unknown route is a 404 that names what this server serves", async () => {
  const server = await startServer();

  const response = await requestWithHost(server.port, `127.0.0.1:${server.port}`, "/nope");

  assert.equal(response.status, 404);
  assert.match(response.body, /\/mcp/);
  assert.match(response.body, /\/healthz/);
});

test("an unset allow-list says so at startup, and writes nothing to stdout", async () => {
  const server = await startServer();

  await waitForOutput(server.proc, server.stderr, UNSET_NOTICE);

  assert.equal(server.stdout(), "", "stdout is the protocol channel and stays empty");
});

test("a set allow-list is not announced as unset", async () => {
  const server = await startServer({ MCP_ALLOWED_HOSTS: "example.test" });

  assert.ok(
    server.stderr().includes(READY),
    "the server came up with the allow-list enabled"
  );
  assert.equal(
    server.stderr().includes(UNSET_NOTICE),
    false,
    "a warning printed unconditionally would pass the previous case for the wrong reason"
  );
});

test("the allow-list refuses a Host outside it and answers one inside it", async () => {
  const server = await startServer({ MCP_ALLOWED_HOSTS: "example.test" });

  const refused = await requestWithHost(server.port, "evil.test");
  assert.equal(refused.status, 403, "a Host outside the list is refused");

  // The list matches the hostname, not host:port - the port is the client's
  // business, not the operator's.
  const answered = await requestWithHost(server.port, "example.test");
  assert.equal(answered.status, 200);

  const answeredWithPort = await requestWithHost(server.port, `example.test:${server.port}`);
  assert.equal(answeredWithPort.status, 200);
});

test("a refused request leaves the server answering the next one", async () => {
  const server = await startServer({ MCP_ALLOWED_HOSTS: "example.test" });

  await requestWithHost(server.port, "evil.test");
  const client = await connect(server.port).catch(() => null);

  assert.equal(client, null, "the SDK client sends Host: 127.0.0.1 and is refused too");

  const answered = await requestWithHost(server.port, "example.test");
  assert.equal(answered.status, 200, "the process is still alive and still serving");
});

test("HOST confines the listener to the interface it was given", async () => {
  const server = await startServer();

  assert.ok(
    server.stderr().includes(`on 127.0.0.1:${server.port}/mcp`),
    `the startup line must report the bind address. Output:\n${server.stderr()}`
  );
  assert.equal((await requestWithHost(server.port, `127.0.0.1:${server.port}`)).status, 200);

  const external = Object.values(networkInterfaces())
    .flat()
    .find((address) => address && address.family === "IPv4" && !address.internal);

  if (!external) {
    // Nothing to try: a host with no external IPv4 cannot prove anything here.
    return;
  }

  assert.equal(
    await canConnect(external.address, server.port),
    false,
    `HOST=127.0.0.1 must not answer on ${external.address}`
  );
});

test("SIGTERM stops the server", async () => {
  const server = await startServer();
  const exited = once(server.proc, "exit");

  server.proc.kill("SIGTERM");
  const [code, signal] = await exited;

  if (process.platform === "win32") {
    // Windows does not deliver SIGTERM to a Node child: the signal terminates
    // the process without the handler running. All that is observable is that
    // it did not crash on the way out.
    assert.notEqual(code, 1, "the server must not exit 1");
    assert.ok(signal !== null || code !== null);
  } else {
    assert.equal(code, 0, "shutdown drains and exits 0");
  }
});

/* -------------------------------------------------------------------------- *
 * The guard, mounted natively rather than through a shim.
 *
 * `MCP_ALLOWED_HOSTS` is the SDK's `hostHeaderValidation`, mounted as express
 * middleware. Everything the previous `hostGuard` shim did — refuse before a route
 * runs, answer in the JSON-RPC envelope, match the hostname and not `host:port` —
 * is the SDK's, and these are the cases where the boundary of the list is what
 * matters.
 * -------------------------------------------------------------------------- */

test("an allow-list of nothing but separators still counts as unset", async () => {
  // `MCP_ALLOWED_HOSTS=,` is a shell that lost the value and a paste that did.
  // Treating either as "allow nothing" would refuse every request with a message
  // that names no host at all — and the startup warning is the only thing an
  // operator has to go on, so it has to appear here too.
  const server = await startServer({ MCP_ALLOWED_HOSTS: " , , " });

  assert.equal(
    (await requestWithHost(server.port, "anything.test")).status,
    200,
    "separators are not a list"
  );
  await waitForOutput(server.proc, server.stderr, UNSET_NOTICE);
});

test("a request with no Host header never reaches a handler", async () => {
  // The SDK's middleware has a "Missing Host header" branch that answers 403. It is
  // not reachable over a socket, and not because of anything this repository does:
  // node's HTTP/1.1 parser rejects a request with no `Host` header before the
  // listener's callback runs at all, with a bare 400 and an empty body. So what is
  // asserted here is the property the branch exists to protect — a Host-less request
  // is refused rather than served — and not the code, which belongs to node's parser
  // and to the version of it a given Node ships.
  const server = await startServer({ MCP_ALLOWED_HOSTS: "example.test" });

  const response = await requestWithoutHost(server.port);

  assert.ok(response.status >= 400, `a Host-less request was served: ${response.status}`);
  assert.equal(response.body.includes('"status":"ok"'), false, "the health check did not answer");
});

test("a bracketed IPv6 host is matched as the list writes it", async () => {
  // The SDK parses the header with the URL API, and `URL` keeps the brackets on an
  // IPv6 hostname. An operator who wrote `[::1]` in the list must therefore get a
  // match, and one who wrote `::1` must not — the list is compared literally, and a
  // test that only used a bare name would not tell the two apart.
  const server = await startServer({ MCP_ALLOWED_HOSTS: "[::1],example.test" });

  assert.equal(
    (await requestWithHost(server.port, "[::1]:3000")).status,
    200,
    "a bracketed IPv6 host on the list is served"
  );
  assert.equal(
    (await requestWithHost(server.port, "::1")).status,
    403,
    "the unbracketed form is a different host string"
  );
});

/* -------------------------------------------------------------------------- *
 * The body limit, and the framework it moved to.
 * -------------------------------------------------------------------------- */

test("the body limit is the 4 MB it was before express", () => {
  // Pinned as a number, not as a relation to whatever the constant now says. A
  // limit that quietly became 64 MB would keep every boundary test in this file
  // passing, and the number is a documented property of the transport rather than
  // an implementation detail.
  assert.equal(BODY_LIMIT_BYTES, 4 * 1024 * 1024);
});

test("a body over the limit is refused, and says so in the JSON-RPC envelope", async () => {
  const server = await startServer();

  // Valid JSON, valid MCP, simply too large: the only thing wrong with it is its
  // size, so the refusal here is the limit rather than a parse failure.
  const oversized = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "roblox_index", arguments: {}, padding: "x".repeat(BODY_LIMIT_BYTES) },
  });
  assert.ok(oversized.length > BODY_LIMIT_BYTES, "the payload must actually exceed the limit");

  const response = await postToMcp(server.port, oversized);
  const body = JSON.parse(response.body);

  assert.equal(response.status, 400);
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.error.code, -32700);
});

test("malformed JSON is refused with exactly the same answer as a body that is too large", async () => {
  // Not tidiness. The hand-rolled reader express replaced threw one failure for both
  // cases, so a client that learned to expect 400/-32700 on a malformed body was
  // never taught anything different for an oversized one. Collapsing them keeps that
  // promise; splitting them would be a behaviour change nobody asked for.
  const server = await startServer();

  const response = await postToMcp(server.port, "{ this is not json");
  const body = JSON.parse(response.body);

  assert.equal(response.status, 400);
  assert.equal(body.error.code, -32700);
  assert.equal(body.error.message, "Parse error: request body is not valid JSON");
});

test("no response advertises that the server is running express", async () => {
  const server = await startServer();

  // Checked on a served route, on the catch-all, and on the 405, because the 404 and
  // the 405 are produced by middleware rather than by a route and could plausibly
  // have taken a different path through the stack. `X-Powered-By` hands an
  // unauthenticated caller the framework and its version, which is a free upgrade
  // suggestion.
  const health = await requestWithHost(server.port, `127.0.0.1:${server.port}`);
  const missing = await requestWithHost(server.port, `127.0.0.1:${server.port}`, "/nope");
  const refused = await requestWithHost(server.port, `127.0.0.1:${server.port}`, "/mcp");

  for (const response of [health, missing, refused]) {
    assert.equal(
      response.headers["x-powered-by"],
      undefined,
      `X-Powered-By leaked on a ${response.status} response`
    );
  }
});

/* -------------------------------------------------------------------------- *
 * The workers.
 *
 * One PORT, several processes. Everything here is about the fork rather than the
 * transport: that it happened, that nothing outlives it, and that a request still
 * gets the right answer whichever process won the connection.
 * -------------------------------------------------------------------------- */

test("MCP_CLUSTER_WORKERS=1 forks nothing and serves on its own", async () => {
  const server = await startServer({ MCP_CLUSTER_WORKERS: "1" });

  await waitForOutput(server.proc, server.stderr, "so no worker is forked");

  assert.doesNotMatch(
    server.stderr(),
    /forking \d+ HTTP workers/,
    "a count of 1 must not fork a worker and then report it as a fork"
  );
  assert.equal(server.countOutput(READY), 1, "one process, one startup line");

  // Still a working server: disabling the fork must not disable the transport.
  const client = await connect(server.port);
  const { tools } = await client.listTools();
  assert.ok(tools.length > 0, "the single process still serves the set");
  await client.close();
});

test("MCP_CLUSTER_WORKERS=2 binds the port from two separate workers", async () => {
  const server = await startServer({ MCP_CLUSTER_WORKERS: "2" });

  assert.match(
    server.stderr(),
    new RegExp(`forking 2 HTTP workers on 127\\.0\\.0\\.1:${server.port}/mcp`),
    "the primary says what it forked, without claiming a port of its own"
  );

  // Two startup lines means two processes each bound the port - which only happens
  // through the cluster's shared handle, because two independent `listen` calls on
  // one port would be EADDRINUSE. This is the assertion that the fork is real.
  await waitForCount(server.proc, server.stderr, READY, 2);

  // And both are answering: enough concurrent requests to outlast one process's
  // accept loop, each on its own connection.
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => requestWithHost(server.port, `127.0.0.1:${server.port}`))
  );
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).server, SERVER_ID);
  }
});

test("concurrent tool calls stay isolated when they cross a process boundary", async () => {
  // The property `cluster` can plausibly break. Each request builds its own McpServer
  // in whichever worker wins the connection, so three callers asking for three
  // different files must each get their own - and the workers are separate processes,
  // so anything cached at module scope would have to be right in two of them at once.
  const server = await startServer({ MCP_CLUSTER_WORKERS: "2" });
  await waitForCount(server.proc, server.stderr, READY, 2);

  // Named from the server rather than written down here, as everywhere else in this
  // file: the surface is generated from content/ and may change with the set.
  const lister = await connect(server.port);
  const chosen = (await lister.listTools()).tools.slice(0, 3).map((tool) => tool.name);
  await lister.close();
  assert.equal(chosen.length, 3, "the set has at least three files to ask for");

  const clients = await Promise.all(chosen.map(() => connect(server.port)));
  const memory = await connectInMemory();

  try {
    const results = await Promise.all(
      clients.map((client, i) => client.callTool({ name: chosen[i], arguments: {} }))
    );

    for (const [i, result] of results.entries()) {
      // Compared against the same tool served in process, not just against "some
      // file": a server that answered all three callers from one shared McpServer
      // would return a non-empty body for each and still be wrong.
      assert.equal(
        textOf(result),
        textOf(await memory.client.callTool({ name: chosen[i], arguments: {} })),
        `${chosen[i]} was answered with another request's file`
      );
    }

    // And the first client still works after the other two have been talking.
    assert.equal(
      textOf(await clients[0].callTool({ name: chosen[0], arguments: {} })),
      textOf(await memory.client.callTool({ name: chosen[0], arguments: {} }))
    );
  } finally {
    await Promise.all(clients.map((client) => client.close()));
    await memory.server.close();
  }
});

test(
  "no worker outlives a primary that was killed outright",
  // The failure this catches does not show up in the run that causes it. A worker
  // whose primary is gone keeps the port and keeps answering, so this suite would
  // pass, and then the *next* run fails on EADDRINUSE against a process nobody
  // remembers starting. `after()` stops the primary with SIGTERM, so without the
  // `disconnect` handler a failed run would leak a worker per failed run.
  { skip: process.platform === "win32" ? "no signal delivery on Windows" : false },
  async () => {
    const server = await startServer({ MCP_CLUSTER_WORKERS: "2" });
    await waitForCount(server.proc, server.stderr, READY, 2);

    const exited = once(server.proc, "exit");

    // SIGKILL cannot be caught, handled, or forwarded. The primary leaves instantly
    // and the workers are told only through the IPC channel that closes with it.
    server.proc.kill("SIGKILL");
    await exited;

    // A worker takes a moment to notice the disconnect and exit. The generous window
    // is the point: a check that ran immediately would pass even when the handler is
    // missing, because the orphan has not finished dying yet.
    await new Promise((resolve) => setTimeout(resolve, 2_000));

    // The proof, in two parts. The port stops answering...
    assert.equal(
      await canConnect("127.0.0.1", server.port),
      false,
      `the port is still served after the primary died - port ${server.port} has an orphan`
    );
    // ...and it is genuinely free, which a request that merely timed out would not
    // show: something else can bind it again.
    const rebound = createNetServer();
    try {
      await new Promise((resolve, reject) => {
        rebound.on("error", reject);
        rebound.listen(server.port, "127.0.0.1", resolve);
      });
    } finally {
      await new Promise((resolve) => rebound.close(resolve));
    }
  }
);

test(
  "the cluster drains on SIGINT and exits 0",
  { skip: process.platform === "win32" ? "no signal delivery on Windows" : false },
  async () => {
    const server = await startServer({ MCP_CLUSTER_WORKERS: "2" });
    await waitForCount(server.proc, server.stderr, READY, 2);

    const exited = once(server.proc, "exit");
    server.proc.kill("SIGINT");
    const [code, signal] = await exited;

    assert.equal(code, 0, `the primary did not exit cleanly: signal ${signal}`);

    // The primary relays rather than killing outright - a worker killed mid-request
    // would drop a response the client is still reading - so it names the count it
    // is waiting for. The workers drain themselves; see the task record for why the
    // worker's own `draining {n} in-flight request(s)` line has no test here.
    assert.match(server.stderr(), /SIGINT, draining 2 worker\(s\)/);

    // And the port is really closed, which is the ordering the primary exists to
    // guarantee: it cannot exit until the last worker holding the listener is gone.
    assert.equal(
      await canConnect("127.0.0.1", server.port),
      false,
      "the primary exited while its workers were still answering"
    );
  }
);

test("stdio forks nothing, because a worker's stdout would corrupt the stream", async () => {
  // Not observable through `startServer`, which waits for an HTTP startup line that
  // stdio never prints. Driven through the SDK's own stdio client instead, so this is
  // the real entry point over a real pipe - the assertion is that the tool list comes
  // back intact, not that a log happens to be quiet.
  const client = new Client({ name: "stdio-cluster-test", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [ENTRY],
    env: { ...process.env, MCP_TRANSPORT: "stdio" },
    stderr: "pipe",
  });
  openClients.add(client);

  let stderr = "";
  transport.stderr?.on("data", (chunk) => (stderr += chunk));

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.ok(tools.length > 0, "stdio still serves the set");

    // The fork is the thing being ruled out, so it is asserted rather than assumed.
    // The handshake above already implies it: a forked worker writing to the
    // inherited stdout would have corrupted the stream before `initialize` was
    // answered.
    assert.match(stderr, /serving over stdio/);
    assert.doesNotMatch(stderr, /forking \d+ HTTP workers/);
    assert.doesNotMatch(stderr, /no worker is forked/);
  } finally {
    await client.close();
  }
});

/**
 * The worker pids of a primary, read from the kernel.
 *
 * The suite knows the primary's pid - it spawned it - but not its workers', and the
 * startup line is pinned by the cases above, so adding a pid to it would change a
 * surface this task was not asked to change. The kernel knows them.
 *
 * `/proc/<pid>/task/<tid>/children` is the direct answer and reads back **empty** on
 * this kernel, so the parent pid is read from field 4 of `/proc/<pid>/stat` for every
 * process instead. The comm field in that line is parenthesised and may itself contain
 * spaces, so the fields are split after the last `)`. Linux only, which is why every
 * case using this skips elsewhere.
 *
 * @param {number} primaryPid
 * @returns {number[]}
 */
function workerPids(primaryPid) {
  const found = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let stat;
    try {
      stat = readFileSync(`/proc/${entry}/stat`, "utf8");
    } catch {
      continue; // The process exited between the readdir and the read.
    }
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    if (Number(fields[1]) === primaryPid) found.push(Number(entry));
  }
  return found;
}

/** Resident memory of a process, in kilobytes. Zero if it is already gone. */
function residentKb(pid) {
  try {
    return Number(readFileSync(`/proc/${pid}/status`, "utf8").match(/VmRSS:\s*(\d+)/)[1]);
  } catch {
    return 0;
  }
}

test(
  "a worker that dies is replaced, and the server keeps serving",
  // Two facts at once, and neither is observable without knowing a worker's pid: the
  // primary notices, and what it does about it. The replacement is a new pid, not the
  // old one coming back, and the primary says so out loud rather than silently
  // refilling the pool.
  { skip: process.platform === "linux" ? false : "worker pids are read from /proc" },
  async () => {
    const server = await startServer({ MCP_CLUSTER_WORKERS: "2" });
    await waitForCount(server.proc, server.stderr, READY, 2);

    const workers = workerPids(server.proc.pid);
    assert.equal(workers.length, 2, `expected two workers, found ${workers.join(", ")}`);

    // `process.kill`, not `child.kill`: the latter takes a signal and nothing else,
    // so passing a pid as a second argument silently kills the *primary* instead -
    // which looks like a server that ignores its workers dying.
    process.kill(workers[0], "SIGKILL");

    await waitForOutput(server.proc, server.stderr, `worker ${workers[0]} exited`);
    await waitForCount(server.proc, server.stderr, READY, 3);

    const after = workerPids(server.proc.pid);
    assert.equal(after.length, 2, "the pool is back to two");
    assert.ok(!after.includes(workers[0]), "a dead pid is not back");
    assert.ok(after.includes(workers[1]), "the surviving worker was left alone");

    // And the server is still answering, on the pool it has now.
    const client = await connect(server.port);
    assert.ok((await client.listTools()).tools.length > 0);
    await client.close();
  }
);

test(
  "the whole server does not grow without bound across many requests",
  // A loose canary, not a leak budget. Measured on this machine over 800 sequential
  // tool calls, the total resident memory of the primary and its workers went from
  // 300 MB to 353 MB with two workers, and from 108 MB to 196 MB with one - and the
  // *pre-express* `node:http` server does the same thing (+85% over the same 800
  // calls, against +81% for express with one worker). So the growth is the
  // fresh-McpServer-per-request lifecycle this repository has always had, not
  // something this migration introduced, and it is not linear.
  //
  // What the bound is for is the failure that would be a real regression: a per-request
  // object that is never released shows up as multiples, not tens of megabytes.
  { skip: process.platform === "linux" ? false : "resident memory is read from /proc" },
  async () => {
    const server = await startServer({ MCP_CLUSTER_WORKERS: "2" });
    await waitForCount(server.proc, server.stderr, READY, 2);

    const pids = () => [server.proc.pid, ...workerPids(server.proc.pid)];
    const totalKb = () => pids().reduce((sum, pid) => sum + residentKb(pid), 0);

    const client = await connect(server.port);
    const name = (await client.listTools()).tools[0].name;
    const before = totalKb();
    assert.ok(before > 0, "the workers report their resident memory");

    try {
      for (let i = 0; i < 200; i += 1) await client.callTool({ name, arguments: {} });
    } finally {
      await client.close();
    }

    const after = totalKb();
    assert.ok(
      after < before * 3,
      `resident memory grew from ${before} kB to ${after} kB over 200 requests`
    );
  }
);
