// The repo model: doctor's read-only view of a Specline repo. Walks `docs/`,
// parses frontmatter and structure, and exposes a plain data model that the rule
// functions consume. It never executes, imports, or compiles repo code.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parseFrontmatter, type Frontmatter } from "./parse.ts";

export type Severity = "error" | "warning" | "info";
export type Scope = "repo" | "spec";
export type SpecKind = "spec" | "knowledge" | "archive";

export interface RuleMeta {
  rule_id: string;
  severity: Severity;
  scope: Scope;
  tier: number;
  downgradable: boolean;
}

export interface RawFinding {
  rule_id: string;
  /** repo-root-relative POSIX path, or null for repo-wide findings. */
  file: string | null;
  line: number | null;
  message: string;
  fix_hint: string;
  /** the spec dirName this finding belongs to, for quarantine; null = repo-wide. */
  specDir?: string | null;
}

export interface Finding {
  rule_id: string;
  severity: Severity;
  scope: Scope;
  file: string | null;
  line: number | null;
  message: string;
  fix_hint: string;
  label?: string;
}

export interface SpecFolder {
  kind: SpecKind;
  /** absolute directory path. */
  abs: string;
  /** repo-root-relative POSIX path of the directory. */
  rel: string;
  dirName: string;
  id: string | null;
  slug: string | null;
  files: string[];
  hasSpec: boolean;
  hasRelations: boolean;
  hasStatus: boolean;
  hasOpenQuestions: boolean;
  specContent: string | null;
  frontmatter: Frontmatter | null;
  statusContent: string | null;
  relationsContent: string | null;
}

export interface MdFile {
  abs: string;
  rel: string;
  content: string;
}

export interface RepoConfig {
  /** acceptance + Behavior item count above which SCOPE-EXCEEDS-SIZE nudges while size: small. */
  suggestSlicingPast: number;
}

export interface Repo {
  root: string;
  docsDir: string;
  tier: number;
  tierSource: "declared" | "override" | "default";
  config: RepoConfig;
  counter: number | null;
  specs: SpecFolder[];
  knowledge: SpecFolder[];
  archive: SpecFolder[];
  /** every spec/knowledge/archive folder, flattened. */
  allFolders: SpecFolder[];
  mdFiles: MdFile[];
}

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
}

function walkMd(dir: string, root: string, acc: MdFile[]): void {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) walkMd(abs, root, acc);
    else if (e.isFile() && e.name.endsWith(".md")) {
      acc.push({ abs, rel: toPosix(relative(root, abs)), content: readFileSync(abs, "utf8") });
    }
  }
}

function loadFolder(kind: SpecKind, abs: string, root: string): SpecFolder {
  const dirName = abs.split(sep).pop() ?? "";
  const m = dirName.match(/^(\d{4})-(.+)$/);
  const files = listFiles(abs);
  const read = (name: string): string | null =>
    files.includes(name) ? readFileSync(join(abs, name), "utf8") : null;
  const specContent = read("spec.md");
  return {
    kind,
    abs,
    rel: toPosix(relative(root, abs)),
    dirName,
    id: m ? m[1]! : null,
    slug: m ? m[2]! : null,
    files,
    hasSpec: files.includes("spec.md"),
    hasRelations: files.includes("relations.md"),
    hasStatus: files.includes("status.md"),
    hasOpenQuestions: files.includes("open-questions.md"),
    specContent,
    frontmatter: specContent !== null ? parseFrontmatter(specContent) : null,
    statusContent: read("status.md"),
    relationsContent: read("relations.md"),
  };
}

function readTier(docsDir: string): number | null {
  const f = join(docsDir, "conventions", "doc-architecture.md");
  if (!existsSync(f)) return null;
  const text = readFileSync(f, "utf8");
  const m = text.match(/\*\*Tier\*\*\s*\|\s*\*\*\s*(\d)/);
  return m ? Number(m[1]) : null;
}

/** Read `specline.yml` at repo root — the source of truth for pins and thresholds
 *  (doc-architecture.md is the demoted fallback). Only the top-level scalars doctor
 *  currently consumes are read; nested blocks (staleness, focus_limit, models) have
 *  no rule consuming them yet, so parsing them now would be scaffolding. */
function readSpeclineConfig(root: string): { tier: number | null; config: RepoConfig } {
  const f = join(root, "specline.yml");
  const fallback = { tier: null as number | null, config: { suggestSlicingPast: 6 } };
  if (!existsSync(f)) return fallback;
  const text = readFileSync(f, "utf8");
  const tierM = text.match(/^tier:\s*(\d+)/m);
  const sliceM = text.match(/^suggest_slicing_past:\s*(\d+)/m);
  return {
    tier: tierM ? Number(tierM[1]) : null,
    config: { suggestSlicingPast: sliceM ? Number(sliceM[1]) : 6 },
  };
}

function readCounter(specsDir: string): number | null {
  const f = join(specsDir, ".id-counter");
  if (!existsSync(f)) return null;
  const raw = readFileSync(f, "utf8").trim();
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

export interface LoadOptions {
  tierOverride?: number;
}

/** Locate `docs/` beneath `root` and build the repo model. */
export function loadRepo(root: string, opts: LoadOptions = {}): Repo {
  const docsDir = join(root, "docs");
  const specsDir = join(docsDir, "specs");
  const knowledgeDir = join(docsDir, "knowledge");
  const archiveDir = join(docsDir, "archive");

  const specs = listDirs(specsDir).map((d) => loadFolder("spec", join(specsDir, d), root));
  const knowledge = listDirs(knowledgeDir).map((d) => loadFolder("knowledge", join(knowledgeDir, d), root));
  const archive = listDirs(archiveDir).map((d) => loadFolder("archive", join(archiveDir, d), root));

  const mdFiles: MdFile[] = [];
  walkMd(docsDir, root, mdFiles);

  const { tier: ymlTier, config } = readSpeclineConfig(root);
  const declaredTier = ymlTier ?? readTier(docsDir);
  let tier: number;
  let tierSource: Repo["tierSource"];
  if (opts.tierOverride !== undefined) {
    tier = opts.tierOverride;
    tierSource = "override";
  } else if (declaredTier !== null) {
    tier = declaredTier;
    tierSource = "declared";
  } else {
    tier = 1;
    tierSource = "default";
  }

  return {
    root,
    docsDir,
    tier,
    tierSource,
    config,
    counter: readCounter(specsDir),
    specs,
    knowledge,
    archive,
    allFolders: [...specs, ...knowledge, ...archive],
    mdFiles,
  };
}

export { existsSync, statSync, join, toPosix };
