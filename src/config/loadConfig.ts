import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export interface Config {
  project: string;
  targets: { frontend: string; backend?: string };
  runner: { model: string };
}

export function parseConfig(yamlText: string): Config {
  const raw = (parseYaml(yamlText) ?? {}) as any;
  const frontend = raw?.targets?.frontend;
  if (typeof frontend !== "string") throw new Error("설정 필수 필드 누락: targets.frontend");
  return {
    project: typeof raw.project === "string" ? raw.project : "unknown",
    targets: { frontend, backend: raw?.targets?.backend },
    runner: { model: raw?.runner?.model ?? "haiku" },
  };
}

export function loadConfig(path: string): Config {
  return parseConfig(readFileSync(path, "utf8"));
}
