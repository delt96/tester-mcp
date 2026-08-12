import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export const DEFAULT_TIMEOUT_MS = 300_000; // 5 min — default hard timeout for an executor

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];

// A haiku executor is denied every chrome tool ("Claude in Chrome requires permission"),
// while sonnet/opus pass with the same flags — measured 2026-08-05, undocumented.
const DEFAULT_MODEL = "sonnet";

export interface PreflightCheck { url: string; expect_status?: number[]; expect_title?: string; }

export interface Config {
  project: string;
  targets: { frontend: string; backend?: string };
  runner: { model: string; timeout_ms: number; effort?: Effort };
  vars: Record<string, string>;
  preflight?: PreflightCheck[];
}

function substituteTargets(url: string, targets: Config["targets"]): string {
  return url.replace(/\$\{targets\.(frontend|backend)\}/g, (_m, key: string) => {
    const v = (targets as Record<string, string | undefined>)[key];
    if (!v) throw new Error(`config preflight refers to \${targets.${key}} but targets.${key} is not set`);
    return v;
  });
}

function parsePreflight(raw: unknown, targets: Config["targets"]): PreflightCheck[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error("config field 'preflight' must be a list");
  return raw.map((e: any, i: number): PreflightCheck => {
    if (typeof e?.url !== "string") throw new Error(`config preflight[${i}] is missing a required field: url`);
    let expect_status: number[] | undefined;
    if (e.expect_status !== undefined) {
      const list = Array.isArray(e.expect_status) ? e.expect_status : [e.expect_status];
      if (!list.every((n: unknown) => typeof n === "number"))
        throw new Error(`config preflight[${i}] expect_status must be a number or a list of numbers`);
      expect_status = list;
    }
    if (e.expect_title !== undefined && typeof e.expect_title !== "string")
      throw new Error(`config preflight[${i}] expect_title must be a string`);
    return { url: substituteTargets(e.url, targets), expect_status, expect_title: e.expect_title };
  });
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

  const targets = { frontend, backend: raw?.targets?.backend };
  return {
    project: typeof raw.project === "string" ? raw.project : "unknown",
    targets,
    runner: {
      model: raw?.runner?.model ?? DEFAULT_MODEL,
      timeout_ms: typeof raw?.runner?.timeout_ms === "number" ? raw.runner.timeout_ms : DEFAULT_TIMEOUT_MS,
      effort: rawEffort as Effort | undefined,
    },
    vars,
    preflight: parsePreflight(raw?.preflight, targets),
  };
}

export function loadConfig(path: string): Config {
  return parseConfig(readFileSync(path, "utf8"));
}
