#!/usr/bin/env node
// GitHub Action entrypoint. Runs Specline in gate mode against the consumer repo and
// emits GitHub workflow commands (::error/::warning) so findings surface as PR
// annotations, then exits with specline's exit code so the check gates the merge.
// It reuses the same engine as the CLI — no new validation logic here.

import { run, exitCodeFor, type Mode } from "../engine/run.ts";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const path = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".";
const changedRaw = flag("--changed") ?? process.env.SPECLINE_CHANGED ?? "";
const changed = changedRaw.split(/\s+/).filter(Boolean);
const modifiedRaw = flag("--modified") ?? process.env.SPECLINE_MODIFIED ?? "";
const modified = modifiedRaw.split(/\s+/).filter(Boolean);
const now = flag("--now") ?? process.env.SPECLINE_NOW ?? null;
const mode: Mode = (flag("--mode") ?? "gate") === "author" ? "author" : "gate";

// GitHub workflow-command escaping for the message body.
const esc = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escProp = (s: string) => esc(s).replace(/,/g, "%2C").replace(/:/g, "%3A");

const report = run(path, { mode, changed, modified, now });

for (const f of report.findings) {
  const cmd = f.severity === "error" ? "error" : f.severity === "warning" ? "warning" : "notice";
  const props: string[] = [`title=${escProp(`specline: ${f.rule_id}`)}`];
  if (f.file) {
    props.unshift(`file=${escProp(f.file)}`);
    if (f.line !== null) props.push(`line=${f.line}`);
  }
  process.stdout.write(`::${cmd} ${props.join(",")}::${esc(`${f.message} — fix: ${f.fix_hint}`)}\n`);
}

const s = report.summary;
const summary = `specline check (${report.mode}, canon ${report.canon}): ${s.errors} error(s), ${s.warnings} warning(s), ${s.info} info`;
process.stdout.write(`\n${summary}\n`);

// Append to the PR check summary when running in GitHub Actions.
const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  try {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(summaryFile, `### ${summary}\n`);
  } catch {
    // best-effort; never fail the gate over a summary write
  }
}

process.exit(exitCodeFor(report));
