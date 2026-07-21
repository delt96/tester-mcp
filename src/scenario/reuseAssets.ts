import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Target } from "./types.js";

export interface Fragment {
  id: string;
  params: Record<string, string | null>;
  steps: unknown[];
}

export interface ReuseAssets {
  fragments: Map<string, Fragment>;
  selectors: Record<string, Target>;
}

const NAME_RE = /^[A-Za-z0-9_-]+$/;
const YAML_RE = /\.ya?ml$/i;
const TARGET_KEYS = ["css", "placeholder", "label", "text", "role", "description"];

export function parseFragment(yamlText: string, sourcePath: string): Fragment {
  const raw = parseYaml(yamlText) as any;
  if (!raw || typeof raw !== "object") throw new Error(`${sourcePath}: empty fragment document`);
  if (typeof raw.id !== "string" || !NAME_RE.test(raw.id))
    throw new Error(`${sourcePath}: fragment 'id' is required and must match [A-Za-z0-9_-]+`);
  const params: Record<string, string | null> = {};
  if (raw.params !== undefined) {
    if (!raw.params || typeof raw.params !== "object" || Array.isArray(raw.params))
      throw new Error(`${sourcePath}: 'params' must be a map (name → default; empty = required)`);
    for (const [k, v] of Object.entries(raw.params)) {
      if (!NAME_RE.test(k)) throw new Error(`${sourcePath}: param name '${k}' must match [A-Za-z0-9_-]+`);
      if (v !== null && typeof v !== "string")
        throw new Error(`${sourcePath}: param '${k}' default must be a string, or empty for required`);
      params[k] = v as string | null;
    }
  }
  if (!Array.isArray(raw.steps) || raw.steps.length === 0)
    throw new Error(`${sourcePath}: fragment 'steps' must be a non-empty list`);
  raw.steps.forEach((st: any, i: number) => {
    if (st && typeof st === "object" && "use" in st)
      throw new Error(`${sourcePath}: steps[${i}]: fragments cannot nest other fragments ('use' is not allowed here)`);
  });
  return { id: raw.id, params, steps: raw.steps };
}

export function parseSelectors(yamlText: string, sourcePath: string): Record<string, Target> {
  const raw = parseYaml(yamlText) as any;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error(`${sourcePath}: _selectors.yaml must be a map of name → target`);
  const out: Record<string, Target> = {};
  for (const [name, val] of Object.entries(raw)) {
    if (!NAME_RE.test(name)) throw new Error(`${sourcePath}: selector name '${name}' must match [A-Za-z0-9_-]+`);
    if (!val || typeof val !== "object" || Array.isArray(val))
      throw new Error(`${sourcePath}: selector '${name}' must be a target object (css/text/role/...)`);
    const target: Record<string, string> = {};
    for (const [k, v] of Object.entries(val as object)) {
      if (!TARGET_KEYS.includes(k)) throw new Error(`${sourcePath}: selector '${name}' has unknown target field '${k}'`);
      if (typeof v !== "string") throw new Error(`${sourcePath}: selector '${name}.${k}' must be a string`);
      target[k] = v;
    }
    if (Object.keys(target).length === 0) throw new Error(`${sourcePath}: selector '${name}' is empty`);
    out[name] = target as Target;
  }
  return out;
}

// Nearest-ancestor lookup: from the scenario's directory upward, take the FIRST
// _fragments/ dir and the FIRST _selectors.yaml found (independently), stop at fs root.
export function discoverReuseAssets(scenarioFile: string): ReuseAssets {
  let fragments: Map<string, Fragment> | undefined;
  let selectors: Record<string, Target> | undefined;
  let dir = dirname(resolve(scenarioFile));
  for (;;) {
    if (!fragments) {
      const fragDir = join(dir, "_fragments");
      if (existsSync(fragDir) && statSync(fragDir).isDirectory()) {
        fragments = new Map();
        for (const f of readdirSync(fragDir).filter((n) => YAML_RE.test(n)).sort()) {
          const p = join(fragDir, f);
          const frag = parseFragment(readFileSync(p, "utf8"), p);
          if (fragments.has(frag.id)) throw new Error(`${p}: duplicate fragment id '${frag.id}'`);
          fragments.set(frag.id, frag);
        }
      }
    }
    if (!selectors) {
      const selFile = join(dir, "_selectors.yaml");
      if (existsSync(selFile)) selectors = parseSelectors(readFileSync(selFile, "utf8"), selFile);
    }
    const parent = dirname(dir);
    if ((fragments && selectors) || parent === dir) break;
    dir = parent;
  }
  return { fragments: fragments ?? new Map(), selectors: selectors ?? {} };
}
