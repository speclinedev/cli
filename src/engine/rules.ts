// The rule registry and the rules. The registry is the single source of truth:
// the engine runs these rules and `doctor rules` prints this same catalog, so a
// finding can never carry a rule_id the catalog lacks. Each rule is a pure
// function (context) -> raw findings; severity/scope/tier/downgradable live in
// the registry, not in the rule body.

import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { parseFlatYaml, headings, links } from "./parse.ts";
import type { Repo, RawFinding, RuleMeta, SpecFolder } from "./model.ts";

export const REGISTRY: RuleMeta[] = [
  { rule_id: "STRUCT-MISSING-SPEC", severity: "error", scope: "spec", tier: 1, downgradable: true },
  { rule_id: "STRUCT-MISSING-RELATIONS", severity: "error", scope: "spec", tier: 1, downgradable: true },
  { rule_id: "FRONTMATTER-UNPARSEABLE", severity: "error", scope: "spec", tier: 1, downgradable: false },
  { rule_id: "FRONTMATTER-ID-MISMATCH", severity: "error", scope: "spec", tier: 1, downgradable: false },
  { rule_id: "FRONTMATTER-MISSING-RATIFIED", severity: "error", scope: "spec", tier: 1, downgradable: false },
  { rule_id: "STATUS-SCHEMA", severity: "error", scope: "spec", tier: 1, downgradable: false },
  { rule_id: "ENUM-INVALID", severity: "error", scope: "spec", tier: 1, downgradable: false },
  { rule_id: "UNKNOWN-FRONTMATTER-KEY", severity: "warning", scope: "spec", tier: 1, downgradable: false },
  { rule_id: "UNKNOWN-SECTION", severity: "warning", scope: "spec", tier: 1, downgradable: false },
  { rule_id: "RELATION-DANGLING", severity: "error", scope: "repo", tier: 1, downgradable: false },
  { rule_id: "RELATION-CROSS-REPO", severity: "warning", scope: "repo", tier: 1, downgradable: false },
  { rule_id: "RELATION-KILLED", severity: "warning", scope: "repo", tier: 1, downgradable: false },
  { rule_id: "LINK-DANGLING", severity: "error", scope: "repo", tier: 1, downgradable: false },
  { rule_id: "KNOWLEDGE-HAS-STATUS", severity: "error", scope: "repo", tier: 1, downgradable: false },
  { rule_id: "ARCHIVE-EDITED", severity: "error", scope: "repo", tier: 1, downgradable: false },
  { rule_id: "ID-DUPLICATE", severity: "error", scope: "repo", tier: 1, downgradable: false },
  { rule_id: "ID-COUNTER-GAP", severity: "error", scope: "repo", tier: 1, downgradable: false },
  { rule_id: "GOAL-MISSING", severity: "warning", scope: "spec", tier: 1, downgradable: false },
  { rule_id: "ACCEPTANCE-NOT-RUNNABLE", severity: "warning", scope: "spec", tier: 1, downgradable: false },
  { rule_id: "LOOP-BUDGET-INVALID", severity: "warning", scope: "spec", tier: 1, downgradable: false },
];

export const REGISTRY_BY_ID: Map<string, RuleMeta> = new Map(REGISTRY.map((r) => [r.rule_id, r]));

const KNOWN_FRONTMATTER_KEYS = new Set([
  "id", "slug", "type", "status", "decider", "blast_radius", "target_model",
  "ratified_by", "ratified_at", "created", "canon", "shipped", "ttl_expires",
  "acceptance_results", "deputy", "killed_reason", "loop_budget",
]);

const KNOWN_SECTIONS = new Set([
  "Intent", "Goal", "Non-goals", "Non goals", "Behavior", "Business rules", "Critical files",
  "Acceptance checks", "Out of scope", "Out of scope / deferred", "Assumptions",
  "Open questions", "Status", "Context",
]);

const ALLOWED_BLAST_RADIUS = new Set(["low", "medium", "high"]);
const ALLOWED_TARGET_MODEL = new Set(["light", "standard", "frontier"]);
const STATUS_REQUIRED_SECTIONS = ["State", "Done", "In progress", "Last green checkpoint", "Dead ends"];
const RATIFIED_STATES = new Set(["ratified", "building"]);
const RELATION_KEYS = ["depends_on", "part_of", "supersedes", "conflicts_with"];

export interface RuleContext {
  repo: Repo;
  /** repo-root-relative POSIX paths the caller declared changed (added or modified). */
  changed: Set<string>;
  /** the subset that are modifications/deletions, not pure adds — for edit detection
   *  on otherwise-immutable files (e.g. archive/). Empty unless the caller supplies it. */
  modified: Set<string>;
  now: string | null;
}

export type Rule = (ctx: RuleContext) => RawFinding[];

function fmString(f: SpecFolder, key: string): string | null {
  const v = f.frontmatter?.data[key];
  return typeof v === "string" ? v : null;
}

function asEdges(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((s) => s.trim()).filter((s) => s !== "" && s !== "none");
}

// ── structural, spec-scoped ──────────────────────────────────────────────────

const structMissing: Rule = ({ repo }) => {
  const out: RawFinding[] = [];
  for (const f of repo.specs) {
    if (!f.hasSpec) {
      out.push({ rule_id: "STRUCT-MISSING-SPEC", file: `${f.rel}/spec.md`, line: null, specDir: f.dirName,
        message: `spec folder ${f.dirName} has no spec.md`,
        fix_hint: "add spec.md with frontmatter (id, slug, type, status) and an Intent section" });
    }
    if (!f.hasRelations) {
      out.push({ rule_id: "STRUCT-MISSING-RELATIONS", file: `${f.rel}/relations.md`, line: null, specDir: f.dirName,
        message: `spec folder ${f.dirName} has no relations.md`,
        fix_hint: "add relations.md; use `depends_on: none` if it is the first spec" });
    }
  }
  return out;
};

const frontmatterWellFormed: Rule = ({ repo }) => {
  const out: RawFinding[] = [];
  for (const f of [...repo.specs, ...repo.archive]) {
    if (f.specContent === null || f.frontmatter === null) continue;
    const fm = f.frontmatter;
    if (!fm.present || !fm.ok) {
      out.push({ rule_id: "FRONTMATTER-UNPARSEABLE", file: `${f.rel}/spec.md`, line: 1, specDir: f.dirName,
        message: `frontmatter does not parse: ${fm.error ?? "missing --- block"}`,
        fix_hint: "wrap frontmatter in `---` fences; one `key: value` per line" });
      continue;
    }
    const idVal = fmString(f, "id");
    const slugVal = fmString(f, "slug");
    if (idVal !== null && f.id !== null && idVal !== f.id) {
      out.push({ rule_id: "FRONTMATTER-ID-MISMATCH", file: `${f.rel}/spec.md`, line: fm.lineOf["id"] ?? 1, specDir: f.dirName,
        message: `frontmatter id "${idVal}" does not match directory id "${f.id}"`,
        fix_hint: `set id to ${f.id} or rename the directory to match` });
    }
    if (slugVal !== null && f.slug !== null && slugVal !== f.slug) {
      out.push({ rule_id: "FRONTMATTER-ID-MISMATCH", file: `${f.rel}/spec.md`, line: fm.lineOf["slug"] ?? 1, specDir: f.dirName,
        message: `frontmatter slug "${slugVal}" does not match directory slug "${f.slug}"`,
        fix_hint: `set slug to ${f.slug} or rename the directory to match` });
    }
  }
  return out;
};

const ratifiedFields: Rule = ({ repo }) => {
  const out: RawFinding[] = [];
  for (const f of [...repo.specs, ...repo.archive]) {
    if (f.frontmatter === null || !f.frontmatter.ok) continue;
    const status = fmString(f, "status");
    if (status === null || !RATIFIED_STATES.has(status)) continue;
    for (const key of ["ratified_by", "ratified_at"]) {
      if (fmString(f, key) === null) {
        out.push({ rule_id: "FRONTMATTER-MISSING-RATIFIED", file: `${f.rel}/spec.md`, line: f.frontmatter.lineOf["status"] ?? 1, specDir: f.dirName,
          message: `status "${status}" requires ${key} (B3)`,
          fix_hint: `add ${key} — set by the approving commit at ratification` });
      }
    }
  }
  return out;
};

const statusSchema: Rule = ({ repo }) => {
  const out: RawFinding[] = [];
  for (const f of repo.allFolders) {
    if (f.statusContent === null) continue;
    const h2 = headings(f.statusContent).filter((h) => h.level === 2);
    for (const req of STATUS_REQUIRED_SECTIONS) {
      const matches = h2.filter((h) => h.title.toLowerCase().startsWith(req.toLowerCase()));
      if (matches.length === 0) {
        out.push({ rule_id: "STATUS-SCHEMA", file: `${f.rel}/status.md`, line: null, specDir: f.dirName,
          message: `status.md missing required section "${req}"`,
          fix_hint: `add a "## ${req}" section (shape only; doctor never reads its prose)` });
      } else if (matches.length > 1) {
        out.push({ rule_id: "STATUS-SCHEMA", file: `${f.rel}/status.md`, line: matches[1]!.line, specDir: f.dirName,
          message: `status.md has a duplicated required section "${req}"`,
          fix_hint: `merge the duplicate "## ${req}" sections into one` });
      }
    }
  }
  return out;
};

const enumValues: Rule = ({ repo }) => {
  const out: RawFinding[] = [];
  const checks: [string, Set<string>][] = [["blast_radius", ALLOWED_BLAST_RADIUS], ["target_model", ALLOWED_TARGET_MODEL]];
  for (const f of [...repo.specs, ...repo.archive]) {
    if (f.frontmatter === null || !f.frontmatter.ok) continue;
    for (const [key, allowed] of checks) {
      const v = fmString(f, key);
      if (v !== null && !allowed.has(v)) {
        out.push({ rule_id: "ENUM-INVALID", file: `${f.rel}/spec.md`, line: f.frontmatter.lineOf[key] ?? 1, specDir: f.dirName,
          message: `${key} "${v}" is not one of ${[...allowed].join("|")}`,
          fix_hint: `set ${key} to one of: ${[...allowed].join(", ")}` });
      }
    }
  }
  return out;
};

const loopBudgetValid: Rule = ({ repo }) => {
  const out: RawFinding[] = [];
  for (const f of [...repo.specs, ...repo.archive]) {
    if (f.frontmatter === null || !f.frontmatter.ok) continue;
    const v = fmString(f, "loop_budget");
    if (v !== null && !/^[1-9]\d*$/.test(v)) {
      out.push({ rule_id: "LOOP-BUDGET-INVALID", file: `${f.rel}/spec.md`, line: f.frontmatter.lineOf["loop_budget"] ?? 1, specDir: f.dirName,
        message: `loop_budget "${v}" is not a positive integer`,
        fix_hint: "loop_budget is the autonomy grant — a positive integer of build cycles before escalating to a human gate" });
    }
  }
  return out;
};

const unknownFrontmatterKeys: Rule = ({ repo }) => {
  const out: RawFinding[] = [];
  for (const f of [...repo.specs, ...repo.archive]) {
    if (f.frontmatter === null || !f.frontmatter.ok) continue;
    for (const key of Object.keys(f.frontmatter.data)) {
      if (!KNOWN_FRONTMATTER_KEYS.has(key)) {
        out.push({ rule_id: "UNKNOWN-FRONTMATTER-KEY", file: `${f.rel}/spec.md`, line: f.frontmatter.lineOf[key] ?? 1, specDir: f.dirName,
          message: `unknown frontmatter key "${key}" (preserved, not an error)`,
          fix_hint: "likely a newer-canon key; safe to leave, or remove if a typo" });
      }
    }
  }
  return out;
};

const unknownSections: Rule = ({ repo }) => {
  const out: RawFinding[] = [];
  for (const f of repo.specs) {
    if (f.specContent === null) continue;
    for (const h of headings(f.specContent).filter((x) => x.level === 2)) {
      if (!KNOWN_SECTIONS.has(h.title)) {
        out.push({ rule_id: "UNKNOWN-SECTION", file: `${f.rel}/spec.md`, line: h.line, specDir: f.dirName,
          message: `unknown body section "## ${h.title}" (preserved, not an error)`,
          fix_hint: "likely a newer-canon section; safe to leave, or rename to a known section" });
      }
    }
  }
  return out;
};

// ── loop-orientation (warn-only nudges) ──────────────────────────────────────

const goalMissing: Rule = ({ repo }) => {
  const out: RawFinding[] = [];
  for (const f of repo.specs) {
    if (f.specContent === null) continue;
    const has = headings(f.specContent).some((h) => h.level === 2 && h.title === "Goal");
    if (!has) {
      out.push({ rule_id: "GOAL-MISSING", file: `${f.rel}/spec.md`, line: null, specDir: f.dirName,
        message: "spec has no `## Goal` section — the build loop has no single falsifiable target",
        fix_hint: "add a one-line falsifiable Goal: the observable outcome that means done" });
    }
  }
  return out;
};

const acceptanceNotRunnable: Rule = ({ repo }) => {
  const out: RawFinding[] = [];
  for (const f of repo.specs) {
    if (f.specContent === null) continue;
    const lines = f.specContent.split(/\r?\n/);
    const heads = headings(f.specContent).filter((h) => h.level === 2);
    const acc = heads.find((h) => h.title.toLowerCase().startsWith("acceptance"));
    if (!acc) continue;
    const next = heads.find((h) => h.line > acc.line);
    const body = lines.slice(acc.line, next ? next.line - 1 : undefined).join("\n");
    if (/agent-loopable/i.test(body) && !body.includes("`")) {
      out.push({ rule_id: "ACCEPTANCE-NOT-RUNNABLE", file: `${f.rel}/spec.md`, line: acc.line, specDir: f.dirName,
        message: "agent-loopable acceptance checks carry no runnable command — the loop must re-interpret prose",
        fix_hint: "lead each agent-loopable check with a runnable command in backticks (e.g. `npm test`) and its expected result" });
    }
  }
  return out;
};

// ── integrity, repo-scoped ───────────────────────────────────────────────────

const relationEdges: Rule = ({ repo }) => {
  const out: RawFinding[] = [];
  const knownIds = new Set(repo.allFolders.map((f) => f.id).filter((x): x is string => x !== null));
  const killedIds = new Set(
    repo.allFolders.filter((f) => fmString(f, "status") === "killed").map((f) => f.id).filter((x): x is string => x !== null),
  );
  for (const f of repo.specs) {
    if (f.relationsContent === null) continue;
    const parsed = parseFlatYaml(f.relationsContent);
    for (const key of RELATION_KEYS) {
      for (const edge of asEdges(parsed.data[key])) {
        const line = parsed.lineOf[key] ?? null;
        if (edge.startsWith("repo:")) {
          out.push({ rule_id: "RELATION-CROSS-REPO", file: `${f.rel}/relations.md`, line, specDir: null,
            message: `cross-repo edge ${edge} (${key}) is validated weakly`,
            fix_hint: "cross-repo edges are warn-only; ensure the sibling repo/id exists out of band" });
          continue;
        }
        const idMatch = edge.match(/^(\d{4})/);
        if (!idMatch) continue;
        const id = idMatch[1]!;
        if (!knownIds.has(id)) {
          out.push({ rule_id: "RELATION-DANGLING", file: `${f.rel}/relations.md`, line, specDir: null,
            message: `${key} edge ${edge} points to id ${id}, which exists nowhere in specs/, knowledge/, or archive/`,
            fix_hint: "fix the id, or remove the edge if the target was never created" });
        } else if (killedIds.has(id)) {
          out.push({ rule_id: "RELATION-KILLED", file: `${f.rel}/relations.md`, line, specDir: null,
            message: `${key} edge ${edge} points to killed id ${id}`,
            fix_hint: "edges to killed ids are warn-only; drop the edge if it is no longer meaningful" });
        }
      }
    }
  }
  return out;
};

const danglingLinks: Rule = ({ repo }) => {
  const out: RawFinding[] = [];
  for (const md of repo.mdFiles) {
    for (const lk of links(md.content)) {
      const target = lk.target.split("#")[0]!.trim();
      if (target === "") continue;
      if (/^(https?:|mailto:|tel:|\/)/.test(target)) continue;
      const resolved = resolve(dirname(md.abs), target);
      if (!existsSync(resolved)) {
        out.push({ rule_id: "LINK-DANGLING", file: md.rel, line: lk.line, specDir: null,
          message: `relative link "${lk.target}" does not resolve`,
          fix_hint: "fix the path; for a cross-repo reference, cite it by name instead of a relative link" });
      }
    }
  }
  return out;
};

const knowledgeHasStatus: Rule = ({ repo }) => {
  const out: RawFinding[] = [];
  for (const f of repo.knowledge) {
    for (const bad of ["status.md", "open-questions.md"]) {
      if (f.files.includes(bad)) {
        out.push({ rule_id: "KNOWLEDGE-HAS-STATUS", file: `${f.rel}/${bad}`, line: null, specDir: null,
          message: `knowledge/ must not contain ${bad} (lifecycle artifact)`,
          fix_hint: `delete ${bad} from knowledge/; knowledge records rules and rationale, not lifecycle state` });
      }
    }
  }
  return out;
};

const archiveEdited: Rule = ({ modified }) => {
  const out: RawFinding[] = [];
  // Only a *modification* of an archived spec is a violation — adding one is
  // graduation, which is allowed. So this reads `modified`, not `changed`. And only
  // archived specs (archive/NNNN-slug/...) count; the generated archive/README.md does not.
  const archivedSpec = /^docs\/archive\/\d{4}-[^/]+\//;
  for (const path of [...modified].sort()) {
    if (archivedSpec.test(path)) {
      out.push({ rule_id: "ARCHIVE-EDITED", file: path, line: null, specDir: null,
        message: `archive/ is read-only; ${path} was reported changed`,
        fix_hint: "revert the edit; archived specs are an immutable audit trail" });
    }
  }
  return out;
};

const idIntegrity: Rule = ({ repo }) => {
  const out: RawFinding[] = [];
  // Duplicates count only spec.md-bearing locations (specs/ + archive/). A
  // graduated feature legitimately has the same id in both archive/ and
  // knowledge/ — that is the shipped state, not a collision.
  const byId = new Map<string, SpecFolder[]>();
  for (const f of [...repo.specs, ...repo.archive]) {
    if (f.id === null) continue;
    (byId.get(f.id) ?? byId.set(f.id, []).get(f.id)!).push(f);
  }
  for (const [id, folders] of [...byId.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (folders.length > 1) {
      const sorted = [...folders].sort((a, b) => a.rel.localeCompare(b.rel));
      for (const f of sorted.slice(1)) {
        out.push({ rule_id: "ID-DUPLICATE", file: `${f.rel}/spec.md`, line: f.frontmatter?.lineOf["id"] ?? null, specDir: f.dirName,
          message: `id ${id} also declared in ${sorted[0]!.rel}`,
          fix_hint: "renumber the later-merged spec to a fresh id; nothing should reference it yet" });
      }
    }
  }
  if (repo.counter !== null) {
    const present = new Set(repo.allFolders.map((f) => f.id).filter((x): x is string => x !== null));
    for (let n = 1; n <= repo.counter; n++) {
      const id = String(n).padStart(4, "0");
      if (!present.has(id)) {
        out.push({ rule_id: "ID-COUNTER-GAP", file: null, line: null, specDir: null,
          message: `id ${id} <= .id-counter (${String(repo.counter).padStart(4, "0")}) is accounted for nowhere in specs/, knowledge/, or archive/`,
          fix_hint: "an abandoned spec is archived with status: killed, never deleted; restore it or correct the counter" });
      }
    }
  }
  return out;
};

export const RULES: Rule[] = [
  structMissing,
  frontmatterWellFormed,
  ratifiedFields,
  statusSchema,
  enumValues,
  loopBudgetValid,
  unknownFrontmatterKeys,
  unknownSections,
  goalMissing,
  acceptanceNotRunnable,
  relationEdges,
  danglingLinks,
  knowledgeHasStatus,
  archiveEdited,
  idIntegrity,
];
