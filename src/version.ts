// The tool version, and the canon version it serves. The canon version is read
// FROM the bundled canon (see canon.ts) — never hand-typed — so it cannot drift
// from the file doctor actually serves. doctor@MAJOR.MINOR tracks canon
// MAJOR.MINOR (see open-questions Q1); bump the tool version on a cli release.
import { loadCanon } from "./canon.ts";

export const TOOL_VERSION = "0.1.0";
export const CANON = loadCanon().version;
