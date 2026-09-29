import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request as httpRequest, createServer as createNetServer } from "node:http";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

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
 * Nothing here hard-codes a tool count or a tool name. The surface is one tool
 * today and may be eleven after another plan lands; the count is read from
 * listTools() and the name is taken from that same call.
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

  const started = { proc: server, port, stdout: () => stdout, stderr: () => stderr };
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
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.end();
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
  const args = { path: "roblox/toolchain/rojo-guide.md" };

  const overTheWire = textOf(await overHttp.callTool({ name, arguments: args }));
  const inProcess = textOf(await memory.client.callTool({ name, arguments: args }));

  assert.equal(overTheWire, inProcess);
  assert.match(overTheWire, /^---\r?\n/, "the served bytes reach the client intact");
  await memory.server.close();
});

test("the traversal defence survives the network", async () => {
  const server = await startServer();
  const client = await connect(server.port);
  const { tools } = await client.listTools();

  for (const path of ["../../package.json", "../../../.git/config", "/etc/passwd"]) {
    const text = textOf(await client.callTool({ name: tools[0].name, arguments: { path } }));

    assert.match(text, /^not found:/, `${path} must be refused over HTTP too`);
    assert.doesNotMatch(text, /"name":/, `${path} must leak nothing`);
    assert.doesNotMatch(text, /\[core\]/, `${path} must leak nothing`);
  }
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
