import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export const DEFAULT_TIMEOUT_MS = 300_000; // 5분 — executor 하드 타임아웃 기본값

export interface Config {
  project: string;
  targets: { frontend: string; backend?: string };
  runner: { model: string; timeout_ms: number };
}

export function parseConfig(yamlText: string): Config {
  const raw = (parseYaml(yamlText) ?? {}) as any;
  const frontend = raw?.targets?.frontend;
  if (typeof frontend !== "string") throw new Error("설정 필수 필드 누락: targets.frontend");
  return {
    project: typeof raw.project === "string" ? raw.project : "unknown",
    targets: { frontend, backend: raw?.targets?.backend },
    runner: {
      model: raw?.runner?.model ?? "haiku",
      timeout_ms: typeof raw?.runner?.timeout_ms === "number" ? raw.runner.timeout_ms : DEFAULT_TIMEOUT_MS,
    },
  };
}

export function loadConfig(path: string): Config {
  return parseConfig(readFileSync(path, "utf8"));
}
