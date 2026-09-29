/*
 * The MCP server.
 *
 * A fresh instance is created per connection because McpServer holds
 * per-connection state.
 *
 * Every tool is generated from a file under content/, by ./tools/from-content.js.
 * Adding a markdown file to the set adds the tool that serves it; there is nothing
 * to register by hand. Nothing else registers tools - listTools() and the CLI both
 * read this array, so a tool registered outside it would be invisible to both.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { CONTENT_TOOLS } from "./tools/from-content.js";

export const SERVER_ID = "rbagents-shared-instruction";
export const SERVER_TITLE = "RBAgents Roblox Instruction";

/*
 * The whole surface. Nothing here takes an argument, which is the point: there is
 * no `path` for a caller to traverse with, and no verb for a caller to act on.
 * Nothing reaches a network or a credential either - the code that would write is
 * absent, not disabled. A repository pointed at this server cannot mutate the set.
 */
const TOOL_MODULES = Object.freeze(CONTENT_TOOLS);

/**
 * The registered tools, as name/description pairs.
 *
 * The CLI prints this rather than keeping a list of its own, so the two
 * surfaces cannot drift apart.
 *
 * @returns {{ name: string, description: string }[]}
 */
export function listTools() {
  return TOOL_MODULES.map(({ config }) => ({
    name: config.name,
    description: config.description,
  }));
}

/**
 * @param {{ version: string }} options
 * @returns {McpServer}
 */
export function createServer({ version }) {
  const server = new McpServer(
    { name: SERVER_ID, title: SERVER_TITLE, version },
    {
      instructions:
        "The Roblox development set - Luau, Rojo, package architecture, asset submodules, data stores, auras, and naming - served read-only. Every file in the set is its own tool: call the one whose name says what you need, such as luau_authoring, rojo_guide, or data_store_management. Start at roblox_index to route rather than calling everything - it names the ten files under 'roblox/' by subject. For branch strategy and commit conventions, resolve the lxagents-agents-base server as well; this one does not replace it.",
    }
  );

  // The three-argument form, because no generated tool declares an input schema.
  // There is nothing to pass and nothing a caller could pass.
  for (const { config, handler } of TOOL_MODULES) {
    server.tool(config.name, config.description, handler);
  }

  return server;
}
