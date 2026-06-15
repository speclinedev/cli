# Open questions — 0001-doctor

Each entry carries **who decides**, **the options**, **the default**, and **the
deadline**. An entry with a stated default and a future deadline is legal during
`building`: indecision becomes a logged choice with an override window, and the
agent keeps moving. This spec stays `draft` until Q1 and Q2 resolve, because
they change what gets built.

---

## Q1 — Implementation language for the engine — RESOLVED

- **Decides:** jonathan
- **Options:** TypeScript/Node · Go · Python
- **Resolved (2026-06-11):** **TypeScript/Node**, on decoupled criteria (below).

**Decision criterion (corrected).** Doctor is **not** coupled to any one
orchestrator — the methodology is meant for any product owner, so the language
is chosen for *universal runnability*: it must run for any PO and any agent, in
CI or by hand, with the least possible friction, and the building agent must be
able to hold it as a tool. The agnostic layer is the *output contract*
(JSON + exit code + `rule_id`); the language only decides distribution and
agent-invocation ergonomics.

**Why TypeScript on those criteria.**
- **Agent-as-tool is the decisive surface.** The thing the PO wants — the
  planning/building agent checking its own work against doctor mid-loop — is an
  MCP tool, and the MCP SDK is TS-native. This is now a first-class delivery
  surface, not a deferred nicety (see note below).
- **Universal single binary.** `bun build --compile` emits a standalone,
  dependency-free binary, so a non-technical PO downloads and runs one file —
  no runtime to install. This was Go's only real edge and it is covered.
- **CI with no Docker.** JS GitHub Actions run natively; a vendored binary
  works in any other CI.
- **Pinned distribution.** npm gives `doctor@2.3` ↔ `canon 2.3.0`.

**Near-equal alternative:** **Go**, if single-binary maturity is weighted over
MCP ergonomics. The MCP and Action wrappers would shell out to the Go binary.
One word flips it.

---

## Q2 — Canon version to build against — RESOLVED

- **Decides:** jonathan
- **Options:** pin 2.2.0 now · build against 2.3.0-draft
- **Resolved (2026-06-11):** **build against 2.3.0-draft**, now that v2.3 is
  drafted (canon `specline-2.3.md`, repo `speclinedev/specline`).

**Why.** The engine, the output contract, and the integrity checks are stable
across 2.2 → 2.3. v2.3's additions split two ways: the **structural** ones
(`status.md` schema conformance, `blast_radius`/`target_model` value
validation) are folded into this spec's structural checks; the **state-gate**
ones (`ratified` requires `blast_radius` + partitioned acceptance) stay
deferred to the lifecycle spec. Pinning 2.3.0-draft avoids a second
re-spec once 2.3 ratifies. *(Correction to the earlier framing: not all 2.3
additions were lifecycle-only — some are pure structure and belong here.)*

---

## Q3 — Distribution mechanism

- **Decides:** jonathan
- **Options:** npm package only · standalone compiled binary only · both
- **Default:** **both** — npm (`npx doctor`, pinned) as primary; a
  `bun --compile` binary for the Tier-0 vendored / no-Node case
- **Deadline:** 2026-06-20

---

## Q4 — Source of the quarantine diff context

- **Decides:** jonathan
- **Options:** `--changed <file>...` passed by the caller · engine shells to
  git · both
- **Default:** **`--changed` passed by the caller**
- **Deadline:** 2026-06-20

**Why.** Keeping the engine free of a git dependency preserves determinism and
purity (Non-goal: no repo execution). The GitHub Action knows the PR diff and
the orchestrator knows the branch diff, so both can supply `--changed`
cheaply. A git fallback can be added later without changing the contract.
