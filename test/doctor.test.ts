// Acceptance tests, fixture-based. Mirrors the partitioned acceptance checks in
// docs/specs/0001-doctor/spec.md. Run: node --test test/*.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { run, evaluate, exitCodeFor } from "../src/engine/run.ts";
import { loadRepo } from "../src/engine/model.ts";
import { REGISTRY, REGISTRY_BY_ID } from "../src/engine/rules.ts";
import { validate, type JsonSchema } from "../src/engine/schema.ts";

const reportSchema: JsonSchema = JSON.parse(
  readFileSync(fileURLToPath(new URL("../schema/report.schema.json", import.meta.url)), "utf8"),
);

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const changedAll = ["docs/specs/0001-widget/spec.md", "docs/specs/0001-widget/relations.md"];
const gate = (name: string, changed: string[] = []) =>
  run(fx(name), { mode: "gate", changed, now: "2026-06-14" });

function ruleIds(r: ReturnType<typeof gate>): string[] {
  return r.findings.map((f) => f.rule_id);
}
function errorIds(r: ReturnType<typeof gate>): string[] {
  return r.findings.filter((f) => f.severity === "error").map((f) => f.rule_id);
}

test("clean fixture: zero errors, exit 0", () => {
  const r = gate("clean");
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings, null, 2));
  assert.equal(exitCodeFor(r), 0);
});

test("repo's own docs validate with zero errors", () => {
  const r = run(fileURLToPath(new URL("..", import.meta.url)), { mode: "gate", changed: [], now: "2026-06-14" });
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings, null, 2));
});

// one malformed fixture per rule_id — expected rule fires, exit non-zero, no surprises
test("clean-0012 (the real worked example, docs-rooted): zero errors", () => {
  const r = gate("clean-0012");
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings, null, 2));
});

const repoScoped: [string, string][] = [
  ["dup-id", "ID-DUPLICATE"],
  ["counter-gap", "ID-COUNTER-GAP"],
  ["dangling-link", "LINK-DANGLING"],
  ["knowledge-status", "KNOWLEDGE-HAS-STATUS"],
  ["relation-dangling", "RELATION-DANGLING"],
];
for (const [name, rule] of repoScoped) {
  test(`${name} -> ${rule} (repo-scoped, errors without --changed)`, () => {
    const r = gate(name);
    assert.ok(errorIds(r).includes(rule), `expected ${rule}, got ${JSON.stringify(ruleIds(r))}`);
    assert.equal(exitCodeFor(r), 1);
  });
}

const specScoped: [string, string][] = [
  ["id-mismatch", "FRONTMATTER-ID-MISMATCH"],
  ["missing-relations", "STRUCT-MISSING-RELATIONS"],
  ["building-no-ratified", "FRONTMATTER-MISSING-RATIFIED"],
];
for (const [name, rule] of specScoped) {
  test(`${name} -> ${rule} (spec-scoped, errors only with --changed)`, () => {
    const r = gate(name, changedAll);
    assert.ok(errorIds(r).includes(rule), `expected ${rule}, got ${JSON.stringify(ruleIds(r))}`);
    assert.equal(exitCodeFor(r), 1);
  });
}

test("relation-cross-repo: repo: edge is a warning, exit 0", () => {
  const r = gate("relation-cross-repo");
  assert.ok(r.findings.some((f) => f.rule_id === "RELATION-CROSS-REPO" && f.severity === "warning"));
  assert.equal(r.summary.errors, 0);
});

test("relation-killed: edge to a killed id is a warning, exit 0", () => {
  const r = gate("relation-killed");
  assert.ok(r.findings.some((f) => f.rule_id === "RELATION-KILLED" && f.severity === "warning"));
  assert.equal(r.summary.errors, 0);
});

test("archive-edited: a --changed path under archive/ errors (repo-scoped)", () => {
  const r = gate("archive-edited", ["docs/archive/0013-old/spec.md"]);
  assert.ok(r.findings.some((f) => f.rule_id === "ARCHIVE-EDITED" && f.severity === "error"));
  assert.equal(exitCodeFor(r), 1);
  // without --changed there is nothing to flag
  assert.equal(gate("archive-edited").summary.errors, 0);
});

test("every --format json report validates against the published schema", () => {
  const names = ["clean", "clean-0012", "dup-id", "id-mismatch", "dangling-link",
    "relation-dangling", "version-skew", "archive-edited"];
  for (const name of names) {
    const errs = validate(reportSchema, gate(name, changedAll));
    assert.deepEqual(errs, [], `${name}: ${errs.join("; ")}`);
  }
});

test("quarantine: spec-scoped violation warns without --changed (exit 0), errors with it", () => {
  const without = gate("id-mismatch");
  assert.equal(without.summary.errors, 0);
  assert.ok(without.findings.some((f) => f.rule_id === "FRONTMATTER-ID-MISMATCH" && f.severity === "warning"));
  assert.equal(exitCodeFor(without), 0);

  const withChanged = gate("id-mismatch", changedAll);
  assert.ok(withChanged.findings.some((f) => f.rule_id === "FRONTMATTER-ID-MISMATCH" && f.severity === "error"));
  assert.equal(exitCodeFor(withChanged), 1);
});

test("author mode: a missing required element is distance_to_ratifiable (info), exit 0", () => {
  const author = run(fx("missing-relations"), { mode: "author", changed: changedAll, now: "2026-06-14" });
  const f = author.findings.find((x) => x.rule_id === "STRUCT-MISSING-RELATIONS");
  assert.ok(f, "expected the missing-relations finding");
  assert.equal(f!.severity, "info");
  assert.equal(f!.label, "distance_to_ratifiable");
  assert.equal(exitCodeFor(author), 0);

  // same fixture in gate mode, with --changed, is a hard error
  const g = gate("missing-relations", changedAll);
  assert.equal(exitCodeFor(g), 1);
});

test("version skew: unknown key + unknown section warn (exit 0)", () => {
  const r = gate("version-skew");
  assert.equal(r.summary.errors, 0);
  assert.ok(ruleIds(r).includes("UNKNOWN-FRONTMATTER-KEY"));
  assert.ok(ruleIds(r).includes("UNKNOWN-SECTION"));
  assert.equal(exitCodeFor(r), 0);
});

test("determinism: two evaluations of the same model are byte-identical", () => {
  const repo = loadRepo(fx("dup-id"));
  const a = JSON.stringify(evaluate(repo, { mode: "gate", changed: [], now: "2026-06-14" }));
  const b = JSON.stringify(evaluate(repo, { mode: "gate", changed: [], now: "2026-06-14" }));
  assert.equal(a, b);
});

test("catalog completeness: every emitted rule_id exists in the registry", () => {
  const names = ["clean", "id-mismatch", "missing-relations", "building-no-ratified",
    "dup-id", "counter-gap", "dangling-link", "knowledge-status", "version-skew"];
  for (const name of names) {
    for (const f of gate(name, changedAll).findings) {
      assert.ok(REGISTRY_BY_ID.has(f.rule_id), `finding rule_id ${f.rule_id} absent from registry`);
    }
  }
});

test("every finding carries a non-empty fix_hint", () => {
  for (const f of gate("dangling-link").findings) {
    assert.ok(f.fix_hint && f.fix_hint.length > 0, `${f.rule_id} missing fix_hint`);
  }
  assert.ok(REGISTRY.length > 0);
});
