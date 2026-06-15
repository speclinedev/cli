#!/usr/bin/env node
// The local CLI adapter — a thin wrapper over the engine. It parses args, renders
// the engine's report (JSON is the source of truth; human is a projection), and
// maps the result to a stable exit code. All real logic lives in the engine.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { run, exitCodeFor, type Mode, type Report } from "../engine/run.ts";
import { REGISTRY } from "../engine/rules.ts";
import { TOOL_VERSION, CANON } from "../version.ts";

const USAGE = `specline — spec-driven development tooling

  specline doctor [PATH] [--mode author|gate] [--format json|human]
                         [--changed <file>...] [--now <iso-date>] [--tier 0|1|2]
  specline rules  [--format json|markdown]
  specline spec

  doctor  validates a Specline repo's structure — a health check, deterministic,
          no model, no judgment.

Exit: 0 = no errors, 1 = at least one error, 2 = usage error, 3 = internal error.`;

type Format = "json" | "human" | "markdown";

interface Args {
  command: "check" | "rules" | "spec";
  path: string;
  mode: Mode;
  format: Format | null;
  changed: string[];
  now: string | null;
  tier: number | undefined;
}

function fail(msg: string): never {
  process.stderr.write(`specline: ${msg}\n\n${USAGE}\n`);
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const a: Args = { command: "check", path: ".", mode: "gate", format: null, changed: [], now: null, tier: undefined };
  let i = 0;
  const sub = argv[0];
  if (sub === undefined || sub === "-h" || sub === "--help") {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }
  if (sub === "doctor") a.command = "check";
  else if (sub === "rules") a.command = "rules";
  else if (sub === "spec") a.command = "spec";
  else if (sub.startsWith("-")) fail(`the first argument must be a command (doctor, rules, spec), not ${sub}`);
  else fail(`unknown command "${sub}" — did you mean: specline doctor ${sub}`);
  i = 1;
  let sawPath = false;
  for (; i < argv.length; i++) {
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
  const p = fileURLToPath(new URL("../../canon/specline-2.3.md", import.meta.url));
  return readFileSync(p, "utf8");
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

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "spec") {
    process.stdout.write(canonText());
    if (!canonText().endsWith("\n")) process.stdout.write("\n");
    process.exit(0);
  }
  if (args.command === "rules") {
    printRules(args.format ?? "markdown");
    process.exit(0);
  }

  if (!existsSync(join(args.path, "docs"))) {
    fail(`no docs/ directory found under ${args.path}`);
  }

  const report = run(args.path, { mode: args.mode, changed: args.changed, now: args.now, tierOverride: args.tier });
  const format = args.format ?? "human";
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderHuman(report, args.path)}\n`);
  }
  process.exit(exitCodeFor(report));
}

try {
  main();
} catch (err) {
  // Internal failure: distinct non-zero code, message to stderr, never malformed stdout.
  process.stderr.write(`specline: internal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(3);
}
