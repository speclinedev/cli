// The bundled canon. The cli ships a verbatim copy of the canon under `canon/`
// so `doctor spec` and the MCP `doctor_spec` tool can serve it offline, version-
// locked to the binary. The copy is a BUILD ARTIFACT, not a second original:
// `scripts/sync-canon.mjs` regenerates it from the source repo, and the version
// is read FROM the file here rather than hand-typed — so the filename, the
// served text, and the reported version can never drift apart.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export interface BundledCanon {
  /** the full canon markdown. */
  text: string;
  /** the canon version, parsed from the `**Canon version:**` line. */
  version: string;
  /** absolute path to the bundled file. */
  path: string;
}

let cached: BundledCanon | null = null;

/** Resolve, read, and parse the single bundled canon. Throws if zero or more than
 *  one is present, or if it carries no version line — both are packaging errors. */
export function loadCanon(): BundledCanon {
  if (cached !== null) return cached;
  const dir = fileURLToPath(new URL("../canon/", import.meta.url));
  const files = readdirSync(dir).filter((f) => /^specline-.*\.md$/.test(f));
  if (files.length !== 1) {
    throw new Error(`expected exactly one bundled canon in canon/, found ${files.length} (${files.join(", ") || "none"})`);
  }
  const path = join(dir, files[0]!);
  const text = readFileSync(path, "utf8");
  const m = text.match(/\*\*Canon version:\*\*\s*(\d+\.\d+\.\d+(?:-[a-z0-9]+(?:\.[a-z0-9]+)*)?)/i);
  if (m === null) throw new Error(`bundled canon ${files[0]} has no "**Canon version:**" line`);
  cached = { text, version: m[1]!, path };
  return cached;
}
