import { execFileSync } from "node:child_process";
import type { Environment } from "../result/types.js";

export interface CaptureEnvOptions {
  model: string; frontendDir?: string; backendDir?: string;
  gitSha?: (dir: string) => string | undefined;
}

function realGitSha(dir: string): string | undefined {
  try { return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); }
  catch { return undefined; }
}

export function captureEnv(opts: CaptureEnvOptions): Environment {
  const gitSha = opts.gitSha ?? realGitSha;
  return {
    frontend_commit: opts.frontendDir ? gitSha(opts.frontendDir) : undefined,
    backend_commit: opts.backendDir ? gitSha(opts.backendDir) : undefined,
    browser: "chrome (claude-in-chrome)",
    runner_model: opts.model,
    node_version: process.version,
    os: process.platform,
  };
}
