// The orchestrator: load -> run tier-applicable rules -> apply author-mode
// downgrade and quarantine -> deterministic sort -> summary. Pure given (repo
// state, options); the only inputs are the model and the run options.

import { loadRepo, type Repo, type Finding, type RawFinding } from "./model.ts";
import { REGISTRY_BY_ID, RULES, type RuleContext } from "./rules.ts";
import { TOOL_VERSION, CANON } from "../version.ts";

export type Mode = "gate" | "author";

export interface RunOptions {
  mode: Mode;
  changed: string[];
  now: string | null;
  tierOverride?: number;
}

export interface Report {
  tool_version: string;
  canon: string;
  mode: Mode;
  tier: number;
  summary: { errors: number; warnings: number; info: number };
  findings: Finding[];
}

function normalize(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function compareFindings(a: Finding, b: Finding): number {
  const fa = a.file ?? "";
  const fb = b.file ?? "";
  if (fa !== fb) return fa < fb ? -1 : 1;
  const la = a.line ?? -1;
  const lb = b.line ?? -1;
  if (la !== lb) return la - lb;
  if (a.rule_id !== b.rule_id) return a.rule_id < b.rule_id ? -1 : 1;
  return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
}

/** Evaluate an already-loaded repo model. */
export function evaluate(repo: Repo, opts: RunOptions): Report {
  const changed = new Set(opts.changed.map(normalize));
  const ctx: RuleContext = { repo, changed, now: opts.now };

  const changedSpecDirs = new Set<string>();
  for (const f of repo.allFolders) {
    for (const c of changed) {
      if (c === f.rel || c.startsWith(`${f.rel}/`)) {
        changedSpecDirs.add(f.dirName);
        break;
      }
    }
  }

  const raw: RawFinding[] = [];
  for (const rule of RULES) raw.push(...rule(ctx));

  const findings: Finding[] = [];
  for (const r of raw) {
    const meta = REGISTRY_BY_ID.get(r.rule_id);
    if (!meta) throw new Error(`internal: rule_id ${r.rule_id} is not in the registry`);
    if (meta.tier > repo.tier) continue; // tier-gated off for this repo

    let severity = meta.severity;
    let label: string | undefined;

    // author mode: a missing required element is guidance, not failure.
    if (opts.mode === "author" && meta.downgradable && severity === "error") {
      severity = "info";
      label = "distance_to_ratifiable";
    }
    // quarantine: a spec's own error fails only when that spec is in --changed.
    if (meta.scope === "spec" && severity === "error") {
      const dir = r.specDir ?? null;
      if (dir === null || !changedSpecDirs.has(dir)) severity = "warning";
    }

    findings.push({
      rule_id: r.rule_id,
      severity,
      scope: meta.scope,
      file: r.file,
      line: r.line,
      message: r.message,
      fix_hint: r.fix_hint,
      ...(label ? { label } : {}),
    });
  }

  findings.sort(compareFindings);

  const summary = { errors: 0, warnings: 0, info: 0 };
  for (const f of findings) {
    if (f.severity === "error") summary.errors++;
    else if (f.severity === "warning") summary.warnings++;
    else summary.info++;
  }

  return { tool_version: TOOL_VERSION, canon: CANON, mode: opts.mode, tier: repo.tier, summary, findings };
}

/** Load a repo at `root` and evaluate it. */
export function run(root: string, opts: RunOptions): Report {
  const repo = loadRepo(root, { tierOverride: opts.tierOverride });
  return evaluate(repo, opts);
}

export function exitCodeFor(report: Report): number {
  return report.summary.errors > 0 ? 1 : 0;
}
