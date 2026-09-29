import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { CONTENT_DIR } from "../content.js";

/**
 * Names that do not survive mechanical derivation.
 *
 * Everything else is named after its own filename, so adding a file to `content/`
 * adds the tool that serves it without anyone deciding what to call it. This set
 * needs no entry today - every basename is a usable tool name - but the mechanism
 * stays, because the next set that does need one should not have to invent it.
 */
const NAME_OVERRIDES = {};

/** The shape an MCP client will accept as a tool name. */
const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Derive a tool name from a set-relative path.
 *
 * The folder is dropped, so `roblox/security/trust-boundaries.md` is
 * `trust_boundaries` rather than a qualified name. That keeps the short names a
 * caller actually types short, and the cost is that two folders holding the same
 * filename would collide - which `buildContentTools` treats as a startup error
 * rather than letting the second file silently shadow the first.
 */
function toolNameFor(relativePath) {
  const override = NAME_OVERRIDES[relativePath];
  if (override) return override;

  const base = relativePath.split("/").pop();
  return base.replace(/\.md$/, "").toLowerCase().replace(/-/g, "_");
}

/** Every `.md` under the set root, as set-relative forward-slash paths, sorted. */
function markdownFiles(dir = CONTENT_DIR, base = CONTENT_DIR) {
  const found = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...markdownFiles(full, base));
    else if (entry.name.endsWith(".md")) {
      found.push(relative(base, full).split(sep).join("/"));
    }
  }

  return found.sort((a, b) => a.localeCompare(b));
}

/**
 * Pull `name` and `description` out of a file's frontmatter.
 *
 * Only single-line scalar fields are read. A folded YAML value would need a real
 * parser, and the alternative is a dependency added to serve one call site, which
 * `.agents/rules/repository.md` forbids. A field this misses is caught below as a
 * missing description rather than silently serving an empty one.
 *
 * The value is matched as `\S.*` rather than `.*`, so the run of spaces in front of
 * it and the value behind it are different character classes. Two overlapping
 * greedy runs in a row are what let a line that fails to match be retried from
 * every length; with `\S` in front, handing a space back can never turn a failure
 * into a match, so a non-matching line costs one pass instead of one pass per space.
 */
function parseFrontmatter(text) {
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return null;

  const fields = {};
  for (const line of block[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z_][A-Za-z0-9_]*):[ \t]*(\S.*|)$/);
    if (field) fields[field[1]] = field[2].trim();
  }
  return fields;
}

/**
 * Build the whole per-file tool surface, reading the set once.
 *
 * Everything is resolved here, at import, so a malformed set fails the process
 * rather than surfacing as a wrong answer to the first caller that needed the file.
 * A handler is then a map lookup: there is no path argument, so there is nothing for
 * a caller to traverse with, and there is no filesystem I/O on the read path.
 *
 * The file is served whole, frontmatter included, byte-identical to what the set
 * holds - the frontmatter is part of the published text, not metadata to strip.
 *
 * @returns {{ tools: {config: object, handler: Function}[], files: Map<string, string> }}
 */
function buildContentTools() {
  const tools = [];
  const files = new Map();
  const claimed = new Map();

  for (const path of markdownFiles()) {
    const name = toolNameFor(path);

    if (!TOOL_NAME.test(name)) {
      throw new Error(
        `${path} derives the tool name "${name}", which is not a valid MCP tool name. Add it to NAME_OVERRIDES.`,
      );
    }
    if (claimed.has(name)) {
      throw new Error(
        `${path} and ${claimed.get(name)} both derive the tool name "${name}". One would silently shadow the other; add one to NAME_OVERRIDES.`,
      );
    }
    claimed.set(name, path);

    const text = readFileSync(join(CONTENT_DIR, path), "utf8");
    const frontmatter = parseFrontmatter(text);

    if (!frontmatter?.description) {
      throw new Error(
        `${path} has no frontmatter \`description:\`. It would publish as a tool a client cannot route on.`,
      );
    }

    files.set(name, path);
    tools.push({
      config: { name, description: frontmatter.description },
      handler: async () => ({ content: [{ type: "text", text }] }),
    });
  }

  if (tools.length === 0) {
    throw new Error(`No markdown files under ${CONTENT_DIR}. This server would expose nothing.`);
  }

  return { tools, files };
}

const { tools, files } = buildContentTools();

export const CONTENT_TOOLS = Object.freeze(tools);

/** Tool name -> the set-relative file it serves. The test suite pins both directions. */
export const TOOL_FILES = files;

export default CONTENT_TOOLS;
