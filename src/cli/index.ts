#!/usr/bin/env node
// The local CLI adapter — a thin wrapper over the engine and the scaffolder. It
// parses args, renders output (JSON is the source of truth; human is a projection),
// and maps results to a stable exit code. All real logic lives in the engine/init.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { run, exitCodeFor, type Mode, type Report } from "../engine/run.ts";
import { REGISTRY } from "../engine/rules.ts";
import { init, sync, type RunResult } from "../init/scaffold.ts";
import { TOOL_VERSION, CANON } from "../version.ts";
import { loadCanon } from "../canon.ts";

const USAGE = `specline — spec-driven development tooling

  specline doctor [PATH] [--mode author|gate] [--format json|human]
                         [--changed <file>...] [--now <iso-date>] [--tier 0|1|2]
  specline init   [PATH] [--tier 0|1|2] [--decider <name>]
                         [--github-action | --no-github-action] [--check] [--yes]
  specline sync   [PATH] [--check]
  specline rules  [--format json|markdown]
  specline spec

  doctor validates structure (read-only). init/sync write generated artifacts.

Exit: 0 = ok, 1 = errors / --check stale, 2 = usage error, 3 = internal error.`;

type Format = "json" | "human" | "markdown";

interface Args {
  command: "check" | "rules" | "spec" | "init" | "sync";
  path: string;
  mode: Mode;
  format: Format | null;
  changed: string[];
  modified: string[];
  now: string | null;
  tier: number | undefined;
  decider: string;
  githubAction: "yes" | "no" | "ask";
  check: boolean;
  yes: boolean;
}

function fail(msg: string): never {
  process.stderr.write(`specline: ${msg}\n\n${USAGE}\n`);
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    command: "check", path: ".", mode: "gate", format: null, changed: [], modified: [], now: null,
    tier: undefined, decider: "you", githubAction: "ask", check: false, yes: false,
  };
  const sub = argv[0];
  if (sub === undefined || sub === "-h" || sub === "--help") {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }
  if (sub === "doctor") a.command = "check";
  else if (sub === "rules") a.command = "rules";
  else if (sub === "spec") a.command = "spec";
  else if (sub === "init") a.command = "init";
  else if (sub === "sync") a.command = "sync";
  else if (sub.startsWith("-")) fail(`the first argument must be a command (doctor, init, sync, rules, spec), not ${sub}`);
  else fail(`unknown command "${sub}" — did you mean: specline doctor ${sub}`);

  let sawPath = false;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--mode": {
        const v = argv[++i];
        if (v !== "author" && v !== "gate") fail(`--mode must be author or gate`);
        a.mode = v;
        break;
      }
      case "--format": {
        const v = argv[++i];
        if (v !== "json" && v !== "human" && v !== "markdown") fail(`--format must be json, human, or markdown`);
        a.format = v;
        break;
      }
      case "--now":
        a.now = argv[++i] ?? fail(`--now needs an ISO date`);
        break;
      case "--tier": {
        const v = Number(argv[++i]);
        if (!Number.isInteger(v) || v < 0 || v > 2) fail(`--tier must be 0, 1, or 2`);
        a.tier = v;
        break;
      }
      case "--changed":
        while (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) a.changed.push(argv[++i]!);
        break;
      case "--modified":
        while (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) a.modified.push(argv[++i]!);
        break;
      case "--decider":
        a.decider = argv[++i] ?? fail(`--decider needs a name`);
        break;
      case "--github-action":
        a.githubAction = "yes";
        break;
      case "--no-github-action":
        a.githubAction = "no";
        break;
      case "--check":
        a.check = true;
        break;
      case "--yes":
      case "-y":
        a.yes = true;
        break;
      case "-h":
      case "--help":
        process.stdout.write(`${USAGE}\n`);
        process.exit(0);
      default:
        if (arg.startsWith("--")) fail(`unknown flag ${arg}`);
        if (sawPath) fail(`unexpected extra argument ${arg}`);
        a.path = arg;
        sawPath = true;
    }
  }
  return a;
}

function canonText(): string {
  return loadCanon().text;
}

function printRules(format: Format): void {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify({ tool_version: TOOL_VERSION, canon: CANON, rules: REGISTRY }, null, 2)}\n`);
    return;
  }
  const lines = [`# doctor rules — catalog (tool ${TOOL_VERSION}, canon ${CANON})`, ""];
  lines.push("| rule_id | severity | scope | tier | downgradable |");
  lines.push("|---|---|---|---|---|");
  for (const r of REGISTRY) {
    lines.push(`| \`${r.rule_id}\` | ${r.severity} | ${r.scope} | ${r.tier} | ${r.downgradable} |`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

const SEV_LABEL: Record<string, string> = { error: "ERROR ", warning: "WARN  ", info: "INFO  " };

function renderHuman(report: Report, path: string): string {
  const out: string[] = [];
  out.push(`doctor ${report.tool_version} · canon ${report.canon} · mode ${report.mode} · tier ${report.tier}`);
  out.push(path);
  out.push("");
  if (report.findings.length === 0) {
    out.push("  ✓ no findings");
  } else {
    for (const f of report.findings) {
      const loc = f.file ? `${f.file}${f.line !== null ? `:${f.line}` : ""}` : "(repo)";
      const tag = f.label ? ` [${f.label}]` : "";
      out.push(`  ${SEV_LABEL[f.severity] ?? f.severity}  ${f.rule_id}${tag}  ${loc}`);
      out.push(`         ${f.message}`);
      out.push(`         ↳ ${f.fix_hint}`);
      out.push("");
    }
  }
  const s = report.summary;
  out.push(`${s.errors} error${s.errors === 1 ? "" : "s"}, ${s.warnings} warning${s.warnings === 1 ? "" : "s"}, ${s.info} info`);
  return out.join("\n");
}

function renderScaffold(cmd: string, path: string, res: RunResult, check: boolean): string {
  const out = [`specline ${cmd} · ${path}${check ? " · --check (no writes)" : ""}`, ""];
  for (const o of res.outcomes) out.push(`  ${o.action.padEnd(14)} ${o.rel}`);
  out.push("");
  if (check) out.push(res.clean ? "✓ up to date" : "✗ missing or stale — run without --check to write");
  else out.push(res.wrote ? "✓ written" : "✓ nothing to do");
  return `${out.join("\n")}\n`;
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function resolveGithubAction(args: Args): Promise<boolean> {
  if (args.githubAction === "yes") return true;
  if (args.githubAction === "no") return false;
  if (args.yes || !process.stdin.isTTY) return false; // non-interactive default: no
  const ans = (await ask("Add a GitHub Action to gate docs/ on PRs? [y/N] ")).trim().toLowerCase();
  return ans === "y" || ans === "yes";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "spec") {
    const text = canonText();
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
    process.exit(0);
  }
  if (args.command === "rules") {
    printRules(args.format ?? "markdown");
    process.exit(0);
  }
  if (args.command === "init") {
    const res = init(args.path, {
      tier: args.tier ?? 1,
      decider: args.decider,
      githubAction: await resolveGithubAction(args),
      check: args.check,
    });
    process.stdout.write(renderScaffold("init", args.path, res, args.check));
    process.exit(args.check && !res.clean ? 1 : 0);
  }
  if (args.command === "sync") {
    const res = sync(args.path, { check: args.check });
    process.stdout.write(renderScaffold("sync", args.path, res, args.check));
    process.exit(args.check && !res.clean ? 1 : 0);
  }

  if (!existsSync(join(args.path, "docs"))) {
    fail(`no docs/ directory found under ${args.path}`);
  }

  const report = run(args.path, { mode: args.mode, changed: args.changed, modified: args.modified, now: args.now, tierOverride: args.tier });
  const format = args.format ?? "human";
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderHuman(report, args.path)}\n`);
  }
  process.exit(exitCodeFor(report));
}

main().catch((err) => {
  process.stderr.write(`specline: internal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(3);
});
