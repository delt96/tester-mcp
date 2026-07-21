import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Scenario } from "./types.js";
import { parseScenarioObject } from "./parseScenario.js";
import { discoverReuseAssets } from "./reuseAssets.js";
import { expandRawScenario } from "./expandScenario.js";

// File → nearest reuse assets → parse-time expansion → validated Scenario.
export function loadScenario(filePath: string, vars: Record<string, string> = {}): Scenario {
  const p = resolve(filePath);
  const raw = parseYaml(readFileSync(p, "utf8"));
  const expanded = expandRawScenario(raw, { assets: discoverReuseAssets(p), vars, source: filePath });
  return parseScenarioObject(expanded);
}
