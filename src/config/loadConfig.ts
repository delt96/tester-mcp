import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export const DEFAULT_TIMEOUT_MS = 300_000; // 5분 — executor 하드 타임아웃 기본값

export interface Config {
  project: string;
  targets: { frontend: string; backend?: string };
  runner: { model: string; timeout_ms: number };
  vars: Record<string, string>;
}

export function parseConfig(yamlText: string): Config {
  const raw = (parseYaml(yamlText) ?? {}) as any;
  const frontend = raw?.targets?.frontend;
  if (typeof frontend !== "string") throw new Error("설정 필수 필드 누락: targets.frontend");

  const rawVars = (raw?.vars ?? {}) as Record<string, unknown>;
  if (typeof rawVars !== "object" || Array.isArray(rawVars))
    throw new Error("config field 'vars' must be a map of string values");
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawVars)) {
    if (typeof v !== "string") throw new Error(`config var '${k}' must be a string`);
    vars[k] = v;
  }

  return {
    project: typeof raw.project === "string" ? raw.project : "unknown",
    targets: { frontend, backend: raw?.targets?.backend },
    runner: {
      model: raw?.runner?.model ?? "haiku",
      timeout_ms: typeof raw?.runner?.timeout_ms === "number" ? raw.runner.timeout_ms : DEFAULT_TIMEOUT_MS,
    },
    vars,
  };
}

export function loadConfig(path: string): Config {
  return parseConfig(readFileSync(path, "utf8"));
}
