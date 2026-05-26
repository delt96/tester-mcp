import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildExecutorArgs, type ExecutorArgsOptions } from "./buildExecutorArgs.js";

const execFileAsync = promisify(execFile);
export interface Envelope { result: string; session_id?: string; total_cost_usd?: number; }

export function parseEnvelope(stdout: string): Envelope {
  try { const o = JSON.parse(stdout); if (o && typeof o.result === "string") return o as Envelope; }
  catch { /* fall through */ }
  return { result: stdout };
}

export type Runner = (cmd: string, args: string[]) => Promise<string>;
const defaultRunner: Runner = async (cmd, args) => {
  const { stdout } = await execFileAsync(cmd, args, { maxBuffer: 50 * 1024 * 1024 });
  return stdout;
};

export async function spawnExecutor(opts: ExecutorArgsOptions, runner: Runner = defaultRunner): Promise<Envelope> {
  return parseEnvelope(await runner("claude", buildExecutorArgs(opts)));
}
