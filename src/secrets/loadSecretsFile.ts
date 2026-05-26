import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

// Load the gitignored secrets file (tester-mcp.secrets.yaml). File-first: if it
// exists, parse YAML → object; if missing, return {} (env SECRET_* is the fallback).
export function loadSecretsFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const parsed = parseYaml(readFileSync(path, "utf8"));
  return (parsed ?? {}) as Record<string, unknown>;
}
