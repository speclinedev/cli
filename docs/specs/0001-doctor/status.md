# Status — 0001-doctor

> **Pre-build.** This spec is `draft`; no implementation branch exists yet.
> The structure below doubles as a **proposed canon 2.3 `status.md` schema** —
> the agent's cross-iteration memory in a fresh-context build loop. Sections
> are fixed so that "fresh me" resumes from state instead of re-deriving it and
> re-walking dead ends.

## State

`building` — first vertical slice of the engine + output contract + CLI is
implemented and green. TypeScript run directly on Node 22 (native type-stripping;
no Bun/install needed). Bun reserved for the `--compile` binary (Q3) later.

## Done

- **Engine**: repo model + flat-YAML/frontmatter/markdown parsers (`src/engine/parse.ts`,
  `model.ts`); pure `(model) → findings[]` rule pipeline.
- **Rule registry** (`src/engine/rules.ts`): 17 rules, each `{rule_id, severity,
  scope, tier, downgradable}`; engine emission and `doctor rules` share it.
- **Output contract** (`src/engine/run.ts`): single JSON document, summary,
  deterministic sort (`file`, then `line` with `null` first, then `rule_id`),
  exit non-zero iff ≥1 error.
- **Mode + quarantine + tier**: author-mode `distance_to_ratifiable` downgrade;
  spec-scoped errors gated on `--changed`; tier filter from the registry.
- **CLI** (`src/cli/index.ts`): `doctor [PATH] [--mode --format --changed --now
  --tier]`, plus `doctor spec` (serves vendored canon) and `doctor rules`.
- **Tests** (`test/doctor.test.ts`): 15 passing — clean corpus, one malformed
  fixture per rule, quarantine, author downgrade, version-skew, determinism,
  catalog completeness, `fix_hint` presence. doctor self-validates with 0 errors.

## In progress

- (none — slice complete; see next targets below)

## Last green checkpoint

- `node --test test/*.test.ts` → 15/15 pass; `doctor .` on this repo → 0 errors
  (1 expected warning: the non-canon `## The rule registry` section, correct
  version-skew behavior). Determinism verified byte-identical across runs.

## Not yet built (next slice)

- Published output **JSON schema** file + a validate-against-schema test.
- `RELATION-DANGLING`/`-CROSS-REPO`/`-KILLED` lack dedicated fixtures (logic
  present, untested).
- `ARCHIVE-EDITED` keys off `--changed` paths under `archive/` (git-free by
  design); needs a fixture.
- A proper `docs/`-rooted clean fixture derived from the `0012` example (the
  vendored `fixtures/0012-clean/` is the example's resting-place mirror, not a
  `docs/`-rooted repo).
- `bun build --compile` binary; MCP adapter (next spec).

## Dead ends (what was tried and did not work)

- **Bun as the runtime** — not installed locally and would need a network
  install. Node 22.21 strips TS types natively (`node src/cli/index.ts` just
  runs), so the source stays real TypeScript with zero build step and zero deps.
  Bun stays the distribution/compile tool, not a dev prerequisite.

---

### Proposed `status.md` schema (for canon 2.3)

A build-loop `status.md` carries exactly these sections, in this order:

1. **State** — current lifecycle status + the one thing blocking forward motion.
2. **Done** — completed, verifiable units.
3. **In progress** — the unit currently being worked, if any.
4. **Last green checkpoint** — the most recent state known to pass its checks;
   the resume point.
5. **Dead ends** — approaches tried and rejected, with the reason, so fresh
   context does not re-walk them.

Rationale: items 4 and 5 are what a stateless re-entry cannot reconstruct from
the diff. `doctor` would check this file's *shape* (sections present, parseable)
— never its prose, which stays judgment.
