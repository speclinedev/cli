# doctor — Architecture

> Read first. This repo builds **`doctor`**, the deterministic validator for
> Specline. The repo is itself a Specline repo: it dogfoods the methodology
> it enforces. Until `doctor` can run, this repo is validated by hand against
> the canon; the first green `doctor` build closes that bootstrap gap.

## What this repo is

`doctor` is the structural validator that turns Specline from a convention
into enforced tooling. The canon's claim is *"a convention without a validator
is a suggestion."* This repo produces the validator.

`doctor` is **not an agent**. It makes no judgment calls, runs no model, and
reaches no network. It occupies the half of the system the canon reserves for
non-judgment — *structure validation* — leaving *meaning validation* to the
two human gates. Same input, same output, every run.

## Core areas

| Area | Responsibility |
|---|---|
| **Engine** | Walk `docs/`, parse YAML frontmatter + markdown + directory structure, run the rule set, produce findings. The only stateful logic. |
| **Output contract** | One JSON document on stdout + a stable exit code + a stable `rule_id` on every finding. This is the agnostic surface all consumers bind to. |
| **Rules** | Pure functions: `(repo model) → findings[]`. Each owns a `rule_id`, a severity, and a quarantine scope. |
| **Adapters** | Thin wrappers that invoke the engine: CLI (in scope here), GitHub Action and orchestrator/MCP tool (deferred to a sibling spec). |

## Agent guidance

`doctor` reads **only** markdown, YAML, and directory structure — it never
executes or imports repo code. That is what lets one `doctor` binary validate a
Rails repo, a Flutter repo, and a Next.js repo identically. Its own
implementation language is therefore independent of any repo it checks; the
only contract that crosses the boundary is the JSON output schema and the exit
code.

The three consumers do not each re-implement validation. They share one engine
and differ only in how they *render* its output:

```
                   ┌─────────────────────────────┐
                   │        doctor engine         │
                   │  parse → walk → rules → JSON │
                   └──────────────┬──────────────┘
              JSON on stdout + exit code + rule_id
        ┌──────────────────┬──────────────────┬──────────────────┐
        ▼                  ▼                  ▼
  GitHub Action      Orchestrator /       Local CLI
  (gate: exit code   agent tool           (human: --format
   → PR annotations) (parse JSON →          human)
                      self-correct on
                      rule_id + fix_hint)
```

## Canon

This repo tracks **Specline canon** — pinned in
`docs/conventions/doc-architecture.md`. The contract changes first; this repo
follows.
