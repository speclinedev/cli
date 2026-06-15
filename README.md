# doctor

The deterministic structural validator for [Specline](../specline) repos. One
question — *"is this repo structurally valid?"* — answered the same way, with the
same exit code, for every consumer: CI, the orchestrator, an agent mid-loop, and
the human at a gate.

`doctor` reads **only** markdown, YAML, and directory structure. It never
executes, imports, or compiles the repo it validates — which is what lets one
binary validate a Rails, Flutter, or Next.js repo identically. It runs no model
and makes no judgment call; meaning lives at the two human gates, structure lives
here.

## Status

Pre-build. The spec is ratified in [`docs/specs/0001-doctor`](docs/specs/0001-doctor/spec.md);
implementation has not started. This repo dogfoods Specline — its own `docs/` is
fixture zero for the first green build.

## Scope (spec 0001)

In: the **engine**, the **output contract** (JSON + exit code + stable
`rule_id`), the **repo-scoped structural and integrity checks**, and the **local
CLI**. Deferred to sibling specs: lifecycle-state enforcement, `--fix` index
generation, `doctor diff`, the MCP adapter, and the GitHub Action adapter.

## Layout

| Path | What |
|---|---|
| `docs/` | This repo's own Specline docs — the `0001-doctor` spec, conventions, architecture. |
| `src/engine/` | Pure rule engine: `(repo model) → findings[]`. The only stateful logic. |
| `src/cli/` | The local CLI adapter — a thin wrapper over the engine. |
| `fixtures/` | Frozen test corpus (valid + one malformed per `rule_id`). Owned by the test suite. |

## Usage

The CLI is the `specline` umbrella; `doctor` is its validate (health-check) verb.

```
specline doctor [PATH] [--mode author|gate] [--format json|human] [--changed <file>...] [--now <iso-date>] [--tier 0|1|2]
specline spec       # print the pinned canon, for agent context injection
specline rules      # print the rule catalog: every rule_id, severity, scope
```
