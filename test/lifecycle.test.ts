// Coverage for the lifecycle-completeness (tier 1) and governance (tier 2) rules.
// Fixtures: lifecycle-gaps/ (a ratified spec missing blast_radius + unpartitioned
// acceptance + an incomplete open question, plus a shipped archive with no
// acceptance link) and governance/ (tier 2, a tiny focus_limit + context_window so
// the budget/staleness/coupling rules trip). Run: node --test test/*.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { run } from "../src/engine/run.ts";

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const ids = (r: ReturnType<typeof run>) => new Set(r.findings.map((f) => f.rule_id));

test("lifecycle-gaps: tier-1 completeness rules fire; tier-2 rules stay silent", () => {
  const r = run(fx("lifecycle-gaps"), { mode: "gate", changed: [], modified: [], now: "2026-06-16" });
  const got = ids(r);
  for (const id of ["RATIFIED-NO-BLAST-RADIUS", "RATIFIED-ACCEPTANCE-UNPARTITIONED", "OPEN-QUESTION-INCOMPLETE", "ARCHIVE-NO-ACCEPTANCE"]) {
    assert.ok(got.has(id), `expected ${id}`);
  }
  for (const id of ["STALE-QUARANTINE", "DECIDER-OVER-BUDGET", "COUPLING-CEILING"]) {
    assert.ok(!got.has(id), `tier-2 rule ${id} must not fire at tier 1`);
  }
});

test("lifecycle-gaps: downgradable completeness becomes distance_to_ratifiable in author mode", () => {
  const r = run(fx("lifecycle-gaps"), { mode: "author", changed: [], modified: [], now: "2026-06-16" });
  const f = r.findings.find((x) => x.rule_id === "RATIFIED-NO-BLAST-RADIUS");
  assert.ok(f, "rule should still be reported in author mode");
  assert.equal(f!.severity, "info");
  assert.equal(f!.label, "distance_to_ratifiable");
});

test("governance: tier-2 rules fire when the repo declares tier 2", () => {
  const r = run(fx("governance"), { mode: "gate", changed: [], modified: [], now: "2026-06-16" });
  const got = ids(r);
  for (const id of ["DECIDER-OVER-BUDGET", "STALE-QUARANTINE", "COUPLING-CEILING"]) {
    assert.ok(got.has(id), `expected ${id}`);
  }
});

test("governance: tier-2 rules are gated off when run at tier 1", () => {
  const r = run(fx("governance"), { mode: "gate", changed: [], modified: [], now: "2026-06-16", tierOverride: 1 });
  const got = ids(r);
  for (const id of ["DECIDER-OVER-BUDGET", "STALE-QUARANTINE", "COUPLING-CEILING"]) {
    assert.ok(!got.has(id), `tier-2 rule ${id} must not fire at tier 1`);
  }
});
