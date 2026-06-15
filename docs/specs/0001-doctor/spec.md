---
id: 0001
slug: doctor
type: feature
status: draft        # ratifiable — Q1/Q2 resolved, Q3/Q4 carry legal defaults; awaiting human ratification (B3)
decider: jonathan
blast_radius: high   # everything in the repo depends on doctor being correct
created: 2026-06-11
canon: 2.3.0-draft
---

# doctor — the Specline validator

## Intent

Build `doctor`: the deterministic validator that enforces Specline's
structural rules so the methodology stops being honor-system. The product
outcome is that every consumer of a Specline repo — CI, the orchestrator, an
agent mid-loop, and the human at a gate — can ask one question, *"is this repo
structurally valid?"*, and get the same machine-readable answer with the same
exit code, every time.

**Appetite — one sitting.** This spec covers the **engine**, the **output
contract** (JSON + exit code + `rule_id`), the **repo-scoped structural and
integrity checks**, and the **local CLI** adapter. That is a coherent,
reviewable unit: *"doctor can validate structure and IDs and tell every
consumer about it in one format."* Lifecycle-state enforcement and the other
two adapters are deliberately deferred (see Out of scope).

## Goal

For a given repo state and `--now`, every consumer — CI, an agent, a human — gets
the same machine-readable structural verdict and exit code, byte-identical across
runs.

## Non-goals

The most important section. `doctor` earns its trust by what it refuses to do.

- **No judgment.** `doctor` runs no model, makes no semantic call, and never
  checks whether `behavior.md` *matches* the code. Tense, sizing, B6
  compliance, and one-sitting scope live at the human gates, not here. The
  moment `doctor` decides anything subjective, it stops being deterministic.
- **No repo code.** `doctor` reads only markdown, YAML, and directory
  structure. It never executes, imports, compiles, or links the repo it
  validates. This is the property that lets a single `doctor` validate Rails,
  Flutter, and Next.js repos identically — and it must not be quietly broken
  for "just one" language-specific check.
- **No network, no clock-as-input beyond an injected `--now`.** Determinism
  requires that time-dependent checks (TTL) receive the reference date as an
  argument, not read the wall clock, so a run is reproducible.
- **`--fix` touches only generated artifacts.** It may regenerate
  `relations-index.yml`; it never edits authored content. (The generator
  itself is deferred — see Out of scope.)
- **Not the build loop, not the reviewer.** Those are the orchestrator's
  agents. `doctor` is a gate they call, not a participant that reasons.
- **Lifecycle-state enforcement is not in this spec** (TTL/quarantine
  transitions, decider budget, open-question deadlines, graduation
  acceptance-link, context budget). Deferred — see Out of scope.

## Behavior

Observable, numbered, each verifiable from outside the process.

1. **Invocation.** `specline doctor [PATH] [--mode author|gate] [--format
   json|human] [--changed <file>...] [--now <iso-date>] [--tier 0|1|2]`. The CLI
   is the `specline` umbrella; `doctor` is its validate (health-check) verb.
   `PATH` defaults to the current directory; `doctor` locates `docs/` beneath it. `--mode` defaults
   to `gate`; the planning agent passes `--mode author` during shaping. With no
   flags it prints human output; agents and CI pass `--format json`.

2. **Output contract.** With `--format json`, `doctor` writes exactly one JSON
   document to stdout:

   ```json
   {
     "tool_version": "0.1.0",
     "canon": "2.3.0-draft",
     "summary": { "errors": 2, "warnings": 1 },
     "findings": [
       {
         "rule_id": "ID-DUPLICATE",
         "severity": "error",
         "scope": "repo",
         "file": "docs/specs/0007-ranch-mgmt/spec.md",
         "line": 2,
         "message": "id 0007 also declared in docs/knowledge/0007-...",
         "fix_hint": "renumber the later-merged spec; nothing references it yet"
       }
     ]
   }
   ```

   `--format human` renders the identical data as readable text. The JSON is
   the source of truth; the human format is a projection of it.

3. **Exit code and mode.** In `gate` mode, `0` when there are zero
   `error`-severity findings (warnings allowed), non-zero when at least one
   error exists; CI gates on the exit code, agents parse the findings, the two
   never disagree. In `author` mode, any `downgradable`
   registry rule that fires for a *missing required element* is emitted at
   `severity: info` labeled `distance_to_ratifiable` rather than `error`, and the
   run exits `0` — a work-in-progress spec is expected to be incomplete. This
   already has in-scope teeth: a draft missing `relations.md`, `open-questions.md`
   while questions exist, or `status.md` for an autonomous build downgrades.
   Non-`downgradable` defects (unparseable frontmatter, `id`≠directory, a
   duplicated required section) stay errors in both modes; they are never "in
   progress," they are wrong.

4. **Quarantine scope.** Every finding carries `scope: "repo"` or
   `scope: "spec"`. Repo-scoped errors fail everywhere. Spec-scoped errors fail
   only when the run is told that spec's files changed, via `--changed`; absent
   that, a spec-scoped violation is reported as a warning. The diff context is
   an **input**, never read from git by the engine, so all three adapters
   compute quarantine identically.

5. **Structural checks (canon 2.3 structural subset; per-rule `scope` per the
   registry — a spec's own well-formedness is `scope: spec`, cross-spec integrity
   is `scope: repo`).**
   - Every `docs/specs/NNNN-*` contains `spec.md` and `relations.md`.
   - Frontmatter parses, and its `id` + `slug` match the directory name.
   - `ratified` and `building` specs carry `ratified_by` and `ratified_at`
     (B3).
   - `relations.md` forward edges to repo-local IDs resolve at some lifecycle
     stage; cross-repo (`repo:NNNN-slug`) edges are warn-only; edges to
     `killed` IDs warn.
   - `status.md`, when present, conforms to the v2.3 schema — required sections
     (State, Done, In progress, Last green checkpoint, Dead ends) present and
     parseable. Shape only; never prose.
   - `blast_radius` and `target_model`, when present, hold values from the
     allowed sets (`low|medium|high`; `light|standard|frontier`).
   - Every relative link under `docs/**` resolves.
   - `knowledge/**` contains no `status.md`, `open-questions.md`, or acceptance
     checks; `archive/**` is exempt and read-only (any edit after the archiving
     commit errors).

   *(Deferred to the lifecycle spec, not here: the `ratified`-requires-
   `blast_radius`-and-partitioned-acceptance check, because it is a state-gate
   rule, not a pure structural one. This spec validates the shape of these
   fields where they appear; it does not enforce when they are mandatory.)*

6. **ID integrity (`scope: repo`).** IDs are unique across `specs/`,
   `knowledge/`, and `archive/`; no duplicates; no renumbered or reused IDs.
   **"Accounted for"** is defined as *present in `specs/ ∪ knowledge/ ∪
   archive/`* — and there is no other legitimate state, because an abandoned spec
   is **archived** (`status: killed`, reason "abandoned"), never bare-deleted
   (canon discipline). So any ID `≤ .id-counter` missing from all three is
   unconditionally an error; doctor needs no separate "burned ID" record, and
   `.id-counter` stays a bare integer. (A mechanical renumber-on-collision does
   not burn an ID — the later merger takes a *fresh* number, leaving no gap.)

7. **Stable rule identifiers.** Every check emits a documented, stable
   `rule_id` (e.g. `STRUCT-MISSING-RELATIONS`, `FRONTMATTER-ID-MISMATCH`,
   `ID-DUPLICATE`, `ID-COUNTER-GAP`, `LINK-DANGLING`, `ARCHIVE-EDITED`,
   `KNOWLEDGE-HAS-STATUS`). Consumers route on `rule_id`, not on message text.

8. **Determinism.** For a given repo state and `--now`, two runs produce
   byte-identical output. Findings are sorted by `file`, then `line`, then
   `rule_id`. A finding with no inherent line (e.g. a missing-file finding)
   carries `line: null`, which sorts **before** any integer line.

9. **Tier awareness.** `doctor` reads the repo's declared tier from
   `docs/conventions/doc-architecture.md` and runs only that tier's rules; a
   `--tier` flag overrides for testing.

10. **Self-describing subcommands.** `specline spec` prints the pinned canon (for
    injecting into an agent's context); `specline rules` prints the rule catalog —
    each `rule_id`, its severity, its quarantine scope — in `--format json` or
    `markdown`. These let a planning agent learn what it will be checked against
    before writing, and need no repo to run.

11. **Version-skew posture.** Unknown frontmatter keys and unknown body sections
    are preserved and reported at `severity: warning`, never error. A malformed
    *known* field (unparseable frontmatter, `id`≠directory) is always an error.
    A duplicated *required* section is an error. The principle: fail the wrong,
    tolerate the unfamiliar — a spec written against a newer canon must not
    hard-fail this `doctor` over a key it has not learned.

## The rule registry

A single registry is doctor's source of truth for what it checks. Every check is
one entry:

```
{ rule_id, severity (error|warning|info), scope (repo|spec), tier (0|1|2), downgradable (bool) }
```

- **The engine's emission and `doctor rules` iterate the same registry**, so a
  finding can never carry a `rule_id` absent from the catalog and the catalog can
  never drift from what the engine emits.
- **`scope`** drives quarantine (§4). `spec` = that one spec's own structure (its
  missing required files, frontmatter parse failure or `id`≠directory, `status.md`
  schema, a duplicated required section). `repo` = cross-spec integrity (ID
  uniqueness, counter gaps, dangling edges, broken links, archive edits).
- **`tier`** drives §9 filtering — doctor runs only entries at or below the repo's
  declared tier.
- **`downgradable`** drives author mode (§3). A `downgradable` rule that fires
  because a *required element is missing* is `error` in gate mode and
  `distance_to_ratifiable` (info) in author mode. A non-`downgradable` rule (a
  *malformed or wrong* known field) is an error in both modes.

`scope` and `downgradable` are orthogonal: `FRONTMATTER-ID-MISMATCH` is
`scope: spec, downgradable: false`; a missing `relations.md` is
`scope: spec, downgradable: true`; a duplicate ID is
`scope: repo, downgradable: false`.

## Business rules

- `doctor` **must** exit non-zero if and only if at least one finding has
  `severity: error`.
- Every `error`, `warning`, or `distance_to_ratifiable` finding **must** carry a
  non-empty `fix_hint`; pure `info` summaries **may** omit it. The
  doctor-as-loop-participant claim (an agent self-corrects from `rule_id` +
  `fix_hint` alone) depends on this, so it is a schema requirement, not a
  convention.
- `doctor` **must not** open a network connection or invoke a model.
- `doctor` **must not** write any file except `relations-index.yml` under
  `--fix`.
- `doctor` **must** emit well-formed JSON on stdout even when findings exist;
  internal failures go to stderr with a distinct non-zero code, never as
  malformed stdout.
- `doctor` **must** receive time via `--now`; it **must not** read the wall
  clock for rule evaluation.
- `doctor` **should** complete in under two seconds on a 500-spec repo (it sits
  in CI and the pre-handoff path).
- `doctor` **may** accept `--tier` to override the declared tier for testing.

## Critical files

Greenfield repo — pointers are to the governing contract and the fixture seed,
not to existing implementation.

- Specline canon `2.3.0-draft` — repo `speclinedev/specline`, `specline-2.3.md`
  § *Enforcement: the doctor* — the authoritative rule list this spec implements
  (the canon version pinned in frontmatter); any divergence is a bug in this
  spec, not in the canon. *(Cross-repo reference, not a repo-local link.)*
- `../../../fixtures/0012-clean/` — the worked `0012` example, vendored as the
  frozen fixture seed; seeds the valid-fixture corpus.

## Acceptance checks

Falsifiable, fixture-based, and **partitioned by who can execute them**
(previewing the canon 2.3 acceptance-check partition — agent-loopable checks
are the build loop's own exit condition; human-gate checks are verified once at
final review).

- *(agent-loopable)* Against the valid-fixture corpus (the `0012` example plus
  a hand-built clean repo), `doctor` exits `0` and emits zero `error` findings.
- *(agent-loopable)* For each malformed fixture — one per `rule_id`: missing
  `relations.md`, `id`≠directory, duplicate ID, ID-counter gap, dangling link,
  edited `archive/` file, `status.md` in `knowledge/`, missing `ratified_by` on
  a `building` spec — `doctor` exits non-zero and emits **the expected
  `rule_id` at the expected `file`**, and no unexpected error findings.
- *(agent-loopable)* Two consecutive runs on the same input with the same
  `--now` produce byte-identical stdout (determinism).
- *(agent-loopable)* Every `--format json` output validates against the
  published output JSON schema.
- *(agent-loopable)* A real `scope: spec` violation (e.g. a malformed
  `status.md` schema in one spec folder) reported without `--changed` is a
  warning and exits `0`; the same violation with `--changed` naming that file is
  an error and exits non-zero.
- *(agent-loopable)* A draft spec missing `relations.md` (a `downgradable`,
  `scope: spec` rule) is emitted as `distance_to_ratifiable` (info) and exits
  `0` in `--mode author`; the same fixture is an `error` and exits non-zero in
  `--mode gate`.
- *(agent-loopable)* `doctor rules --format json` lists every `rule_id` the
  engine can emit, each with a severity and scope, and no `rule_id` appears in a
  finding that is absent from this catalog.
- *(agent-loopable)* A fixture carrying an unknown frontmatter key and an unknown
  body section yields `warning` findings (not errors) and exits `0`; a fixture
  with a duplicated required section yields an error and exits non-zero.
- *(human-gate)* `jonathan` reads five sample findings and confirms an
  implementer agent could self-correct from `rule_id` + `fix_hint` alone,
  without opening the canon. *(This is the "doctor-as-loop-participant" test —
  the property that keeps humans on only the two ends of the loop.)*

## Out of scope / deferred

Deferred to sibling specs; IDs not yet allocated (the canon's rule: cite an ID
only once the folder exists).

- **Lifecycle-state enforcement** — TTL/quarantine state transitions, the B7
  decider budget, open-question deadline errors, the B5 graduation
  acceptance-link check, and the B2 context-budget proxy. Several of these
  depend on canon 2.3 (the acceptance-check partition and `status.md` schema),
  which is why they wait.
- **`relations-index.yml` generation** (`doctor --fix`) — the reverse-edge
  index builder.
- **`doctor diff <before> <after>`** — substantive-vs-status change
  classification and `ratified_at` regression detection. A distinct command
  tied to amendment mechanics and the mid-build revision-rate instrument; its
  own spec, so this one stays one-sitting.
- **Cross-repo edge resolution** — stays warn-only per the canon's open
  question; reading sibling-repo indexes is not built here.
- **Agent-tool (MCP) adapter** — the **immediate next spec**, not a deferred
  nicety: `author` mode only delivers its value when the planning agent can call
  doctor as a tool mid-session, so this wrapper is the highest-priority follow-on.
  This spec delivers the engine, the output contract (which the wrapper binds
  to), and the local CLI; the MCP wrapper is split out only to keep this spec
  one-sitting.
- **GitHub Action adapter** — the gate-mode CI wrapper; also a thin wrapper over
  the same contract, its own spec.
