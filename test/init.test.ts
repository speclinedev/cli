// Acceptance tests for 0002-specline-init (the scaffolder). Mirrors its spec.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init, sync } from "../src/init/scaffold.ts";
import { isGenerated } from "../src/init/content.ts";
import { run, exitCodeFor } from "../src/engine/run.ts";

const fresh = () => mkdtempSync(join(tmpdir(), "specline-init-"));
const base = { tier: 1, decider: "jonathan", check: false } as const;

test("init produces a repo doctor validates with zero errors", () => {
  const t = fresh();
  init(t, { ...base, githubAction: true });
  const r = run(t, { mode: "gate", changed: [], now: "2026-06-15" });
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings, null, 2));
  assert.equal(exitCodeFor(r), 0);
});

test("generated files carry the header; scaffold starters do not", () => {
  const t = fresh();
  init(t, { ...base, githubAction: true });
  for (const f of ["docs/specs/README.md", "docs/knowledge/README.md", "docs/archive/README.md", "docs/conventions/README.md", ".github/workflows/specline.yml"]) {
    assert.ok(isGenerated(readFileSync(join(t, f), "utf8")), `${f} should be generated`);
  }
  for (const f of ["specline.yml", "docs/conventions/doc-architecture.md", "docs/architecture.md", "docs/specs/.id-counter"]) {
    assert.ok(!isGenerated(readFileSync(join(t, f), "utf8")), `${f} should be a scaffold starter`);
  }
  // the scaffolded config is the pin doctor reads
  assert.match(readFileSync(join(t, "specline.yml"), "utf8"), /^canon: 2\.4\.0-draft$/m);
  assert.match(readFileSync(join(t, "specline.yml"), "utf8"), /^tier: 1$/m);
});

test("sync is deterministic and idempotent across repos", () => {
  const a = fresh();
  const b = fresh();
  init(a, { ...base, githubAction: true });
  init(b, { ...base, githubAction: true });
  const read = (root: string) => readFileSync(join(root, "docs/knowledge/README.md"), "utf8");
  assert.equal(read(a), read(b)); // same canon → identical bytes
  const before = read(a);
  sync(a, { check: false });
  assert.equal(read(a), before); // re-sync is a no-op
});

test("sync never touches authored content", () => {
  const t = fresh();
  init(t, { ...base, githubAction: false });
  const authored = "# custom doc-architecture\nby hand\n";
  writeFileSync(join(t, "docs/conventions/doc-architecture.md"), authored);
  writeFileSync(join(t, "docs/knowledge/README.md"), "# my notes (authored, no header)\n");
  sync(t, { check: false });
  assert.equal(readFileSync(join(t, "docs/conventions/doc-architecture.md"), "utf8"), authored);
  assert.equal(readFileSync(join(t, "docs/knowledge/README.md"), "utf8"), "# my notes (authored, no header)\n");
});

test("--check writes nothing and flags a missing/stale repo", () => {
  const t = fresh();
  const dry = init(t, { ...base, githubAction: false, check: true });
  assert.equal(dry.clean, false);
  assert.equal(dry.wrote, false);
  assert.ok(!existsSync(join(t, "docs")), "check mode must not write");
  init(t, { ...base, githubAction: false });
  assert.equal(init(t, { ...base, githubAction: false, check: true }).clean, true);
});

test("github-action flag controls workflow generation", () => {
  const a = fresh();
  init(a, { ...base, githubAction: true });
  assert.ok(existsSync(join(a, ".github/workflows/specline.yml")));
  const b = fresh();
  init(b, { ...base, githubAction: false });
  assert.ok(!existsSync(join(b, ".github/workflows/specline.yml")));
});
