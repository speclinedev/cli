// The writer: scaffolds a Specline repo (init) and regenerates generated artifacts
// (sync). It writes generated files (folder READMEs, the workflow) and one-time
// scaffold starters (architecture.md, the pin, .id-counter). It NEVER overwrites an
// authored file — a generated file is recognized by its header; anything else is
// off-limits.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  FOLDER_DOCS, TIER_FOLDERS, renderReadme, renderDocsReadme, isGenerated,
  docArchitecture, architectureMd, githubWorkflow, speclineYml,
} from "./content.ts";

export type FileKind = "generated" | "scaffold";
export type Action = "create" | "update" | "skip-authored" | "skip-exists" | "ok";

interface Planned { rel: string; content: string; kind: FileKind; }
export interface Outcome { rel: string; action: Action; }
export interface RunResult { outcomes: Outcome[]; clean: boolean; wrote: boolean; }

export interface InitOptions { tier: number; decider: string; githubAction: boolean; check: boolean; }
export interface SyncOptions { check: boolean; }

function planInit(opts: InitOptions): Planned[] {
  const folders = TIER_FOLDERS[opts.tier] ?? TIER_FOLDERS[1]!;
  const plan: Planned[] = folders.map((f) => ({ rel: `docs/${f}/README.md`, content: renderReadme(f), kind: "generated" as const }));
  plan.push({ rel: "docs/README.md", content: renderDocsReadme(folders), kind: "generated" });
  plan.push({ rel: "specline.yml", content: speclineYml(opts.tier, opts.decider), kind: "scaffold" });
  plan.push({ rel: "docs/architecture.md", content: architectureMd(), kind: "scaffold" });
  plan.push({ rel: "docs/conventions/doc-architecture.md", content: docArchitecture(opts.tier, opts.decider), kind: "scaffold" });
  plan.push({ rel: "docs/specs/.id-counter", content: "0000", kind: "scaffold" });
  if (opts.githubAction) plan.push({ rel: ".github/workflows/specline.yml", content: githubWorkflow(), kind: "generated" });
  return plan;
}

function planSync(root: string): Planned[] {
  const plan: Planned[] = [];
  const present = Object.keys(FOLDER_DOCS).filter((f) => existsSync(join(root, "docs", f)));
  if (existsSync(join(root, "docs"))) {
    plan.push({ rel: "docs/README.md", content: renderDocsReadme(present), kind: "generated" });
  }
  for (const f of present) {
    plan.push({ rel: `docs/${f}/README.md`, content: renderReadme(f), kind: "generated" });
  }
  if (existsSync(join(root, ".github/workflows/specline.yml"))) {
    plan.push({ rel: ".github/workflows/specline.yml", content: githubWorkflow(), kind: "generated" });
  }
  return plan;
}

function evaluate(abs: string, p: Planned): Action {
  const exists = existsSync(abs);
  if (p.kind === "scaffold") return exists ? "skip-exists" : "create";
  if (!exists) return "create";
  const cur = readFileSync(abs, "utf8");
  if (!isGenerated(cur)) return "skip-authored";
  return cur === p.content ? "ok" : "update";
}

function run(root: string, plan: Planned[], check: boolean): RunResult {
  const outcomes: Outcome[] = [];
  let clean = true;
  let wrote = false;
  for (const p of plan) {
    const abs = join(root, p.rel);
    const action = evaluate(abs, p);
    if (action === "create" || action === "update") clean = false;
    if (!check && (action === "create" || action === "update")) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, p.content);
      wrote = true;
    }
    outcomes.push({ rel: p.rel, action });
  }
  return { outcomes, clean, wrote };
}

export function init(root: string, opts: InitOptions): RunResult {
  return run(root, planInit(opts), opts.check);
}

export function sync(root: string, opts: SyncOptions): RunResult {
  return run(root, planSync(root), opts.check);
}
