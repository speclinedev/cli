#!/usr/bin/env node
// Regenerate the bundled canon (cli/canon/) from the source canon in the sibling
// `specline` repo. The bundle is a BUILD ARTIFACT — never hand-edited — so this
// script is the only sanctioned way to update it.
//
//   node scripts/sync-canon.mjs           # copy source -> bundle
//   node scripts/sync-canon.mjs --check   # exit 1 if bundle != source (release/CI gate)
//   node scripts/sync-canon.mjs --source <dir>   # override the source repo dir
//
// The cross-repo check runs where both repos are checked out side by side
// (the umbrella ~/git/specline). It cannot run in the cli repo's own CI, which
// has no sibling canon — that drift class is caught by the release step instead.

import { readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const args = process.argv.slice(2);
const check = args.includes("--check");
const srcIdx = args.indexOf("--source");
const bundleDir = fileURLToPath(new URL("../canon/", import.meta.url));
const sourceDir = srcIdx !== -1 && args[srcIdx + 1]
  ? args[srcIdx + 1]
  : fileURLToPath(new URL("../../specline/", import.meta.url));

const onlyCanon = (dir) => readdirSync(dir).filter((f) => /^specline-.*\.md$/.test(f));

const sourceFiles = onlyCanon(sourceDir);
if (sourceFiles.length !== 1) {
  console.error(`sync-canon: expected exactly one specline-*.md in ${sourceDir}, found ${sourceFiles.length}`);
  process.exit(2);
}
const sourceName = sourceFiles[0];
const sourceText = readFileSync(join(sourceDir, sourceName), "utf8");

if (check) {
  const bundled = onlyCanon(bundleDir);
  const ok = bundled.length === 1 && bundled[0] === sourceName
    && readFileSync(join(bundleDir, bundled[0]), "utf8") === sourceText;
  if (!ok) {
    console.error(`sync-canon: DRIFT — bundle (${bundled.join(", ") || "none"}) != source (${sourceName}). Run: npm run sync-canon`);
    process.exit(1);
  }
  console.log(`sync-canon: bundle matches source (${sourceName}) ✓`);
  process.exit(0);
}

for (const f of onlyCanon(bundleDir)) rmSync(join(bundleDir, f));
writeFileSync(join(bundleDir, sourceName), sourceText);
console.log(`sync-canon: bundled ${sourceName} (${sourceText.length} bytes) from ${sourceDir}`);
