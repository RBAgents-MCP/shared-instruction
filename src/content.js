/*
 * Where the published set lives.
 *
 * The set is read once, at boot, by src/tools/from-content.js, which turns each
 * markdown file into the tool that serves it. That reader is the only importer of
 * this module, and it resolves every read inside CONTENT_DIR from a path it walked
 * itself - so containment is a property of the constant rather than of anything a
 * caller passed in.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** The published Roblox development set. */
export const CONTENT_DIR = join(here, "..", "content");
