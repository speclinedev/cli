// Canon-derived content for the scaffolder. The per-folder definitions here are the
// source the generated READMEs render from (a projection of the canon's Repository
// layout). Generated files carry a header; authored starters do not.

import { CANON } from "../version.ts";

export const GENERATED_HEADER = `<!-- generated · canon ${CANON} · do not edit · run: specline sync -->`;
export const GENERATED_YAML_HEADER = `# generated · canon ${CANON} · do not edit · run: specline sync`;
const MARKER = "generated · canon"; // presence on the first non-empty line ⇒ regenerable

export function isGenerated(content: string): boolean {
  const first = content.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  return first.includes(MARKER);
}

interface FolderDoc {
  purpose: string;
  whatsHere: string;
  howToWrite: string;
  howToRead: string;
  notHere: string;
}

// Keyed by directory name. Tier gates which of these a repo scaffolds.
export const FOLDER_DOCS: Record<string, FolderDoc> = {
  specs: {
    purpose: "in-flight work",
    whatsHere: "A folder per in-flight feature (`NNNN-slug`) plus `.id-counter`. Prescriptive, temporary.",
    howToWrite: "A `spec.md` (Intent, Non-goals, Behavior, Business rules, Acceptance checks, Out of scope) and a `relations.md`. Shape it with the PO; log unknowns in `open-questions.md`.",
    howToRead: "The contract a feature is being built toward — what we intend, not yet what exists.",
    notHere: "No shipped descriptions — those graduate to `knowledge/` and `archive/`.",
  },
  knowledge: {
    purpose: "shipped reality",
    whatsHere: "A folder per shipped feature (`NNNN-slug`): how it works now and why. Permanent.",
    howToWrite: "Present tense, descriptive. Keep intent, rules, and rationale; cut anything the code already says. Start with `overview.md`; add files only if a topic earns it.",
    howToRead: '"What\'s true now," not a contract. The original promise lives in `archive/NNNN`.',
    notHere: "No specs, status, or open questions — those live in `specs/`.",
  },
  archive: {
    purpose: "terminal contracts",
    whatsHere: "The final `spec.md` of every shipped, killed, or bug feature, with acceptance results linked. Permanent, read-only.",
    howToWrite: "Nothing by hand — graduation moves a ratified spec here verbatim. Never edit an archived file.",
    howToRead: "What was promised and who ratified it — the audit trail. For current behavior, read `knowledge/NNNN`.",
    notHere: "No living docs — those are `knowledge/`.",
  },
  conventions: {
    purpose: "standards & pins",
    whatsHere: "`doc-architecture.md` (the canon-version + tier pin + deciders), templates, and the model-tier map.",
    howToWrite: "Authored by the repo owner. The pin is what Specline reads to know your canon version and tier.",
    howToRead: "How this repo configures Specline.",
    notHere: "No feature work — that's `specs/`/`knowledge/`.",
  },
  decisions: {
    purpose: "repo-local ADRs",
    whatsHere: "Architecture decision records (`NNNN-slug.md`), append-only once accepted.",
    howToWrite: "One decision per file; cite the spec IDs it affects in the header. Precedence: ADR > spec > knowledge.",
    howToRead: "Why a cross-cutting choice was made, when a spec or knowledge doc isn't the right home.",
    notHere: "No feature contracts — those are `specs/`.",
  },
  strategy: {
    purpose: "direction",
    whatsHere: "Vision, roadmap snapshots, launch contracts. Dated; archived, never deleted.",
    howToWrite: "Date each artifact. Supersede by adding a newer dated one, not by editing in place.",
    howToRead: "Where the product is headed and why — the context above any single feature.",
    notHere: "No implementation detail — that's `technical/` or a spec.",
  },
  technical: {
    purpose: "cross-cutting patterns",
    whatsHere: "Implementation patterns that span features — only when non-obvious.",
    howToWrite: "Document a pattern only if the code doesn't already make it clear (B6 applies here too).",
    howToRead: "How recurring technical concerns are handled across the repo.",
    notHere: "No per-feature docs — those are `knowledge/`.",
  },
};

export function renderReadme(dir: string): string {
  const d = FOLDER_DOCS[dir];
  if (!d) throw new Error(`no folder definition for ${dir}`);
  return [
    GENERATED_HEADER,
    `# ${dir}/ — ${d.purpose}`,
    "",
    `**What's here**  ${d.whatsHere}`,
    "",
    `**How to write**  ${d.howToWrite}`,
    "",
    `**How to read**  ${d.howToRead}`,
    "",
    `**What's not here**  ${d.notHere}`,
    "",
  ].join("\n");
}

// Which directories each tier scaffolds.
export const TIER_FOLDERS: Record<number, string[]> = {
  0: ["specs", "knowledge", "archive", "conventions"],
  1: ["specs", "knowledge", "archive", "conventions"],
  2: ["specs", "knowledge", "archive", "conventions", "decisions", "strategy", "technical"],
};

// The docs/ root README — the map. Distinct from architecture.md (which is authored
// content about the *system*; this is generated meta about the *docs structure*).
export function renderDocsReadme(folders: string[]): string {
  const rows = folders
    .filter((f) => FOLDER_DOCS[f])
    .map((f) => `| \`${f}/\` | ${FOLDER_DOCS[f]!.purpose} — see its \`README.md\` |`)
    .join("\n");
  return [
    GENERATED_HEADER,
    "# docs/ — the product record",
    "",
    "This is a Specline repo. `docs/` is the product's source of truth: prescriptive",
    "while in-flight, descriptive once shipped. **Start with `architecture.md`.** Each",
    "directory explains itself in its own `README.md`.",
    "",
    "| Directory | What |",
    "|---|---|",
    rows,
    "",
    "`architecture.md` is a sibling of this file, not a README: it orients you to the",
    "*system itself* (what it is), while this file maps how the *docs* are organized.",
    "",
  ].join("\n");
}

// ── authored starters (scaffolded once, never regenerated by sync) ──────────────

export function docArchitecture(tier: number, decider: string): string {
  return [
    "# Doc architecture — pin & deciders",
    "",
    "| Field | Value |",
    "|---|---|",
    `| **Canon** | Specline ${CANON} |`,
    `| **Tier** | **${tier} — the loop.** |`,
    `| **Decider** | ${decider} |`,
    "",
    "<!-- scaffolded by `specline init` — edit freely; not regenerated. -->",
    "",
  ].join("\n");
}

export function speclineYml(tier: number, decider: string): string {
  return [
    "# specline.yml — repo config: the pins and thresholds Specline reads.",
    "# Scaffolded by `specline init` — edit freely; this is the source of truth.",
    `canon: ${CANON}`,
    `tier: ${tier}`,
    `deciders: [${decider}]`,
    "deputy: null",
    "staleness:            # how long before an untouched build is presumed abandoned",
    "  building: 30 days",
    "  blocked:  14 days",
    "focus_limit:          # decider WIP ceiling (B7)",
    "  building: 3",
    "  active:   6",
    "coupling_ceiling: 50%        # spec + forced loads, as % of context_window (B2)",
    "context_window: 400000       # chars in the weakest in-use model's window (the coupling denominator)",
    "suggest_slicing_past: 6      # Behavior+Acceptance count that nudges to slice while size: small",
    "review_rounds_before_human: 2  # outer-loop verifier↔implementer bounce budget",
    "models:               # capability tier → real model",
    "  light:    claude-haiku",
    "  standard: claude-sonnet",
    "  frontier: claude-opus",
    "",
  ].join("\n");
}

export function architectureMd(): string {
  return [
    "# Architecture",
    "",
    "> Read first. One or two paragraphs: what this system is, its core areas, and any",
    "> guidance an agent needs before touching the code.",
    "",
    "<!-- scaffolded by `specline init` — edit freely; not regenerated. -->",
    "",
  ].join("\n");
}

// ── the GitHub Action workflow (0003) that init optionally generates ────────────

export function githubWorkflow(): string {
  return `${GENERATED_YAML_HEADER}
name: specline
on:
  pull_request:
    paths: ["docs/**"]
jobs:
  specline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: speclinedev/cli@v2.3
`;
}
