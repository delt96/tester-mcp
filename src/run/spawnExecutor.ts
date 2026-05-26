import { spawn } from "node:child_process";
import { buildExecutorArgs, type ExecutorArgsOptions } from "./buildExecutorArgs.js";
import { makeStreamAccumulator, type StreamState } from "./streamParser.js";

export interface Envelope { result: string; session_id?: string; total_cost_usd?: number; }

export function parseEnvelope(stdout: string): Envelope {
  try { const o = JSON.parse(stdout); if (o && typeof o.result === "string") return o as Envelope; }
  catch { /* fall through */ }
  return { result: stdout };
}

export class ExecutorTimeoutError extends Error {
  constructor(public timeoutMs: number) {
    super(`executor 타임아웃(${timeoutMs}ms 초과) — 자식 프로세스 종료됨`);
    this.name = "ExecutorTimeoutError";
  }
}

export interface SpawnHandle { kill(signal: NodeJS.Signals): void; }
export interface StreamSpawner {
  (cmd: string, args: string[], handlers: {
    onLine: (line: string) => void;
    onClose: (code: number | null, signal: string | null) => void;
  }): SpawnHandle;
}

export interface SpawnExecutorResult {
  envelope?: Envelope;
  state: StreamState;
  killedReason?: "stall" | "timeout";
}

export interface SpawnExecutorDeps {
  spawner?: StreamSpawner;
  logLine?: (line: string) => void;
  now?: () => number;
  timeoutMs?: number;   // hard backstop
  stallMs?: number;     // no-event watchdog (default 60s)
  tickMs?: number;      // watchdog poll interval (default 5s)
}

// Default streaming spawner: child_process.spawn + newline buffering.
const defaultSpawner: StreamSpawner = (cmd, args, h) => {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  let buf = "";
  child.stdout.on("data", (d: Buffer) => {
    buf += d.toString();
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) { h.onLine(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
  });
  child.on("close", (code, signal) => { if (buf.trim()) h.onLine(buf); h.onClose(code, signal); });
  child.on("error", () => h.onClose(null, null));
  return { kill: (sig) => child.kill(sig) };
};

export function spawnExecutor(
  opts: ExecutorArgsOptions,
  deps: SpawnExecutorDeps = {}
): Promise<SpawnExecutorResult> {
  const spawner = deps.spawner ?? defaultSpawner;
  const logLine = deps.logLine ?? (() => {});
  const now = deps.now ?? (() => Date.now());
  const stallMs = deps.stallMs ?? 60_000;
  const tickMs = deps.tickMs ?? 5_000;
  const acc = makeStreamAccumulator(now);

  return new Promise<SpawnExecutorResult>((resolve) => {
    let lastEvent = now();
    let killedReason: "stall" | "timeout" | undefined;
    let done = false;
    const intervals: NodeJS.Timeout[] = [];
    const timeouts: NodeJS.Timeout[] = [];
    const clearAll = () => { intervals.forEach(clearInterval); timeouts.forEach(clearTimeout); };

    const handle = spawner("claude", buildExecutorArgs(opts), {
      onLine: (line) => { lastEvent = now(); acc.push(line); logLine(line); },
      onClose: () => {
        if (done) return;
        done = true; clearAll();
        const snap = acc.snapshot();
        resolve({ envelope: snap.envelope, state: snap, killedReason });
      },
    });

    intervals.push(setInterval(() => {
      if (!done && now() - lastEvent > stallMs) { killedReason = "stall"; handle.kill("SIGTERM"); }
    }, tickMs));

    if (deps.timeoutMs) {
      timeouts.push(setTimeout(() => {
        if (!done) { killedReason = "timeout"; handle.kill("SIGTERM"); }
      }, deps.timeoutMs));
    }
  });
}
