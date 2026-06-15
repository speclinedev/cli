# Doc architecture — pin & deciders

| Field | Value |
|---|---|
| **Canon** | Specline `2.3.0-draft` (governing contract: `specline-2.3.md` in repo `speclinedev/specline`; supersedes `spec-flow-v2` when ratified) |
| **Note** | v2.3 adds the acceptance-check partition, the `status.md` schema, the Assumptions section, and `blast_radius`/`target_model` routing. `0001-doctor` builds the **structural** subset of these now; the **state-gate** rules (e.g. `ratified` requires `blast_radius` + partitioned acceptance) are deferred to the lifecycle spec. |
| **Tier** | **1 — the loop.** Ratification frontmatter, the two-PR pattern, graduation + `archive/`, `knowledge/`. (Tier 2 enforcement — TTL/quarantine, decider budget, context budget — is exactly what `doctor` is being built to provide; this repo ratchets to Tier 2 once `doctor` self-validates.) |
| **Decider** | `jonathan` (non-delegable per B3) |
| **Deputy** | none yet — TTL/open-question deadlines park to stated defaults until one is named |
| **`doctor` distribution** | TBD — see `0001-doctor/open-questions.md`. Proposed: a canon-version-pinned package (`doctor@2.x` ↔ `canon 2.x.0`) with a standalone compiled binary for the Tier-0 vendored case. |

## Bootstrap note

`doctor` does not exist yet, so this repo's own conformance is checked by hand
against the canon's *Enforcement: the doctor* section. The first passing
`doctor` build runs against this repo as fixture zero. Until then, treat the
self-check in `0001-doctor` as the manual stand-in.
