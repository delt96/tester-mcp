import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const YAML_RE = /\.ya?ml$/i;

// Expand CLI scenario inputs into a sorted, de-duplicated list of resolved file paths.
// - a directory  → all *.yaml/*.yml directly inside it (sorted by name)
// - a file        → itself
// Shells typically pre-expand globs; this only needs to handle files + dirs.
export function expandScenarioPaths(inputs: string[]): string[] {
  const out: string[] = [];
  for (const input of inputs) {
    const p = resolve(input);
    let st;
    try { st = statSync(p); }
    catch { throw new Error(`시나리오 경로 없음: ${input}`); }
    if (st.isDirectory()) {
      const files = readdirSync(p).filter((f) => YAML_RE.test(f)).sort();
      if (files.length === 0) throw new Error(`디렉토리에 시나리오(.yaml/.yml) 없음: ${input}`);
      for (const f of files) out.push(join(p, f));
    } else {
      out.push(p);
    }
  }
  return [...new Set(out)];
}
