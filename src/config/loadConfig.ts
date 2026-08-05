import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export const DEFAULT_TIMEOUT_MS = 300_000; // 5 min — default hard timeout for an executor

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];

// A haiku executor is denied every chrome tool ("Claude in Chrome requires permission"),
// while sonnet/opus pass with the same flags — measured 2026-08-05, undocumented.
const DEFAULT_MODEL = "sonnet";

export interface Config {
  project: string;
  targets: { frontend: string; backend?: string };
  runner: { model: string; timeout_ms: number; effort?: Effort };
  vars: Record<string, string>;
}

export function parseConfig(yamlText: string): Config {
  const raw = (parseYaml(yamlText) ?? {}) as any;
  const frontend = raw?.targets?.frontend;
  if (typeof frontend !== "string") throw new Error("config is missing a required field: targets.frontend");

  const rawVars = (raw?.vars ?? {}) as Record<string, unknown>;
  if (typeof rawVars !== "object" || Array.isArray(rawVars))
    throw new Error("config field 'vars' must be a map of string values");
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawVars)) {
    if (typeof v !== "string") throw new Error(`config var '${k}' must be a string`);
    vars[k] = v;
  }

  const rawEffort = raw?.runner?.effort;
  if (rawEffort !== undefined && !EFFORT_LEVELS.includes(rawEffort))
    throw new Error(`config runner.effort must be one of ${EFFORT_LEVELS.join(", ")} (got '${String(rawEffort)}')`);

  return {
    project: typeof raw.project === "string" ? raw.project : "unknown",
    targets: { frontend, backend: raw?.targets?.backend },
    runner: {
      model: raw?.runner?.model ?? DEFAULT_MODEL,
      timeout_ms: typeof raw?.runner?.timeout_ms === "number" ? raw.runner.timeout_ms : DEFAULT_TIMEOUT_MS,
      effort: rawEffort as Effort | undefined,
    },
    vars,
  };
}

export function loadConfig(path: string): Config {
  return parseConfig(readFileSync(path, "utf8"));
}
