---
id: 0003
slug: github-action
type: feature
status: draft
decider: jonathan
blast_radius: medium
created: 2026-06-15
canon: 2.3.0-draft
---

# github action — the gate-mode CI wrapper

## Intent

Build the **enforcement** surface: a GitHub Action that runs doctor in gate mode on
every pull request touching `docs/`, and **blocks the merge** when the change
doesn't conform. This is how a team stays on-method without relying on goodwill or
on everyone having read the canon — you can't merge a non-conforming change. It is
a thin wrapper over the same engine and output contract as the CLI (`0001-doctor`)
and the MCP server; only the trigger (a PR) and the reporting (PR annotations)
differ. The workflow file it runs is what `specline init` optionally generates
(see `0002-specline-init`).

**Appetite — one sitting.** The composite/reusable action, the PR-diff →
`--changed` wiring, the exit-code gate, and PR-annotation reporting.

## Goal

A pull request that breaks a spec's structure cannot merge — the check fails with
inline annotations; a conforming PR passes, with parity to the local CLI.

## Non-goals

- **No validation logic of its own.** Every rule lives in the doctor engine; the
  action only invokes it and reports. If a check is wrong, it's wrong in the
  engine, not here.
- **No judgment, no meaning.** It enforces *structure* (and, once the lifecycle
  rules land, *process*) — never whether a spec is good, right-sized, or true.
  That stays at the human ratify gate. "Prevents changes that don't follow the
  narrative" means *structurally/procedurally*, not *semantically*.
- **Never mutates the repo.** It is a gate, not a fixer — it reads, reports, and
  sets a status. Generation/regeneration is `init`/`sync`'s job (`0002`).
- **Not GitHub-only in spirit.** The engine + vendored binary run in any CI; this
  spec is the GitHub adapter specifically.

## Behavior

1. **Trigger.** Runs on `pull_request` events whose diff touches `docs/**` (and the
   canon pin in `conventions/`).

2. **Diff → `--changed`.** Computes the PR's changed files against the base branch
   and passes them as `--changed`, so quarantine applies: a spec-scoped error gates
   the merge only when that spec was touched; repo-scoped errors gate always. The
   diff is an **input**, exactly as the engine requires — the action computes it,
   the engine never reads git.

3. **Invocation.** Runs `specline doctor --mode gate --format json --changed <files>
   --now <iso>`, where `--now` is the workflow run date (or commit date), so
   time-dependent checks are reproducible.

4. **Gate.** Exit `0` → the check passes (green). Exit `1` (≥1 error) → the check
   fails (red), blocking merge under branch protection. The action gates on the
   **exit code**, never on message text.

5. **Reporting.** Renders findings as PR annotations / a check-run summary, each
   carrying `rule_id`, `file`, `line`, `message`, and `fix_hint`, so the author
   self-corrects from the annotation alone — without opening the canon.

6. **Distribution.** A **composite action in the `cli` repo itself**
   (`speclinedev/cli@<ver>`): GitHub checks the action's repo out alongside the
   consumer's, so it runs the bundled doctor directly — no separate package and no
   npm publish needed for CI. Version-pinned to the canon (`@v2.3` ↔ canon 2.3).

## Business rules

- The action **must** gate on doctor's exit code and **must not** parse message
  text to decide pass/fail.
- The action **must not** write to the repository under test.
- The action **must** pass the PR diff as `--changed`; it **must not** ask the
  engine to read git.
- A green check **must** mean zero `error` findings for the changed set under gate
  mode — the same answer the CLI and MCP would give on the same input.

## Critical files

- `0001-doctor` — the engine, output contract, and gate-mode/exit-code semantics
  this wraps. Any divergence in pass/fail is a bug here, not in the engine.
- `0002-specline-init` — generates the `.github/workflows/specline.yml` that
  invokes this action.

## Acceptance checks

- *(agent-loopable)* A PR that introduces a structural error to a spec it touches
  makes the check fail (red), blocking merge.
- *(agent-loopable)* A PR touching only spec A does **not** fail on a pre-existing
  spec-scoped error in spec B (quarantine); a repo-scoped error (e.g. duplicate ID)
  fails any PR.
- *(agent-loopable)* The check's pass/fail matches `specline doctor --mode gate
  --changed <same files>` run locally on the same commit (parity across adapters).
- *(agent-loopable)* Findings surface as PR annotations carrying `rule_id` +
  `fix_hint`.
- *(human-gate)* `jonathan` confirms a contributor could correct a failing PR from
  the annotations alone, without reading the canon.

## Out of scope / deferred

- **The orchestrator / build loop** — the agents that shape and build. The action
  is a gate they pass through, not a participant.
- **Auto-fix in CI** — regeneration is `init`/`sync`'s job (`0002`), not the gate's.
- **Non-GitHub CI adapters** — the vendored-binary path works anywhere; other CI
  wrappers are their own specs.
