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

export class ExecutorTimeoutError extends Error {
  constructor(public timeoutMs: number) {
    super(`executor 타임아웃(${timeoutMs}ms 초과) — 자식 프로세스 종료됨`);
    this.name = "ExecutorTimeoutError";
  }
}

// Default runner: spawns `claude` and hard-kills it after timeoutMs (SIGTERM).
function makeDefaultRunner(timeoutMs?: number): Runner {
  return async (cmd, args) => {
    try {
      const { stdout } = await execFileAsync(cmd, args, {
        maxBuffer: 50 * 1024 * 1024,
        timeout: timeoutMs,
        killSignal: "SIGTERM",
      });
      return stdout;
    } catch (err: any) {
      // execFile sets killed=true (and signal) when the timeout kills the child.
      if (timeoutMs && err && (err.killed || err.signal === "SIGTERM")) {
        throw new ExecutorTimeoutError(timeoutMs);
      }
      throw err;
    }
  };
}

export async function spawnExecutor(
  opts: ExecutorArgsOptions,
  runner?: Runner,
  timeoutMs?: number
): Promise<Envelope> {
  const run = runner ?? makeDefaultRunner(timeoutMs);
  return parseEnvelope(await run("claude", buildExecutorArgs(opts)));
}
