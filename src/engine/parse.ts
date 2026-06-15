// Pure parsing helpers: a flat-YAML reader for frontmatter and relations.md, and
// markdown structure extraction (headings, links). No filesystem, no judgment.

export interface ParsedYaml {
  data: Record<string, string | string[]>;
  /** 1-based source line each key was declared on. */
  lineOf: Record<string, number>;
  ok: boolean;
  error?: string;
}

/** Strip a `#` comment that is at line start or follows whitespace, honoring quotes. */
function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let j = 0; j < line.length; j++) {
    const c = line[j];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "#" && !inSingle && !inDouble) {
      if (j === 0 || /\s/.test(line[j - 1] ?? " ")) return line.slice(0, j);
    }
  }
  return line;
}

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Parse a flat key/value YAML subset: scalars, `[]`, `[a, b]`, and `- item` lists. */
export function parseFlatYaml(text: string, startLine = 1): ParsedYaml {
  const data: Record<string, string | string[]> = {};
  const lineOf: Record<string, number> = {};
  const lines = text.split(/\r?\n/);
  let ok = true;
  let error: string | undefined;
  let pendingListKey: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const lineNo = startLine + i;
    const stripped = stripComment(raw);
    if (stripped.trim() === "") continue;

    const listItem = stripped.match(/^\s*-\s+(.*)$/);
    if (listItem && pendingListKey) {
      const arr = data[pendingListKey];
      if (Array.isArray(arr)) arr.push(unquote(listItem[1] ?? ""));
      continue;
    }

    const m = stripped.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) {
      ok = false;
      error ??= `unparseable line ${lineNo}: ${raw.trim()}`;
      continue;
    }
    const key = m[1]!;
    const valRaw = (m[2] ?? "").trim();
    lineOf[key] = lineNo;

    if (valRaw === "") {
      data[key] = [];
      pendingListKey = key;
      continue;
    }
    pendingListKey = null;

    const inline = valRaw.match(/^\[(.*)\]$/);
    if (inline) {
      const inner = inline[1]!.trim();
      data[key] = inner === "" ? [] : inner.split(",").map((s) => unquote(s));
      continue;
    }
    data[key] = unquote(valRaw);
  }

  return { data, lineOf, ok, error };
}

export interface Frontmatter extends ParsedYaml {
  /** number of lines consumed by the frontmatter block incl. fences, for body offset. */
  endLine: number;
  present: boolean;
}

/** Extract a `---` fenced YAML frontmatter block from the top of a markdown doc. */
export function parseFrontmatter(md: string): Frontmatter {
  const lines = md.split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "---") {
    return { data: {}, lineOf: {}, ok: false, present: false, endLine: 0, error: "no frontmatter block" };
  }
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? "").trim() === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) {
    return { data: {}, lineOf: {}, ok: false, present: true, endLine: lines.length, error: "unterminated frontmatter block" };
  }
  const body = lines.slice(1, close).join("\n");
  const parsed = parseFlatYaml(body, 2); // first content line is line 2
  return { ...parsed, present: true, endLine: close + 1 };
}

export interface Heading {
  level: number;
  title: string;
  line: number;
}

/** All ATX headings, fence-aware, with markdown emphasis stripped from the title. */
export function headings(md: string): Heading[] {
  const out: Heading[] = [];
  const lines = md.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (/^\s*```/.test(l)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = l.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      out.push({
        level: m[1]!.length,
        title: m[2]!.replace(/[*_`]/g, "").trim(),
        line: i + 1,
      });
    }
  }
  return out;
}

export interface MdLink {
  target: string;
  line: number;
}

/** Inline `[text](target)` links. Skips images is not needed; callers filter targets. */
export function links(md: string): MdLink[] {
  const out: MdLink[] = [];
  const lines = md.split(/\r?\n/);
  let inFence = false;
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (/^\s*```/.test(l)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(l)) !== null) {
      out.push({ target: m[1]!.trim(), line: i + 1 });
    }
  }
  return out;
}
