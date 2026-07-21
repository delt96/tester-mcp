import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const YAML_RE = /\.ya?ml$/i;

// Underscore-prefixed entries are reuse assets (_fragments/, _selectors.yaml), not scenarios.
function collectDir(dir: string, out: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    if (e.name.startsWith("_")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) collectDir(p, out);
    else if (YAML_RE.test(e.name)) out.push(p);
  }
}

// Expand CLI scenario inputs into a sorted, de-duplicated list of resolved file paths.
// - a directory → all *.yaml/*.yml under it, recursively
// - a file      → itself
export function expandScenarioPaths(inputs: string[]): string[] {
  const out: string[] = [];
  for (const input of inputs) {
    const p = resolve(input);
    let st;
    try { st = statSync(p); }
    catch { throw new Error(`scenario path not found: ${input}`); }
    if (st.isDirectory()) {
      const before = out.length;
      collectDir(p, out);
      if (out.length === before) throw new Error(`no scenarios (*.yaml/*.yml) under directory: ${input}`);
    } else {
      out.push(p);
    }
  }
  return [...new Set(out)];
}
