import { spawn } from "node:child_process";
import { buildExecutorArgs, type ExecutorArgsOptions } from "./buildExecutorArgs.js";
import { makeStreamAccumulator, type StreamState } from "./streamParser.js";

export interface Envelope { result: string; session_id?: string; total_cost_usd?: number; }

export function parseEnvelope(stdout: string): Envelope {
  try { const o = JSON.parse(stdout); if (o && typeof o.result === "string") return o as Envelope; }
  catch { /* fall through */ }
  return { result: stdout };
}

export interface SpawnHandle { kill(signal: NodeJS.Signals): void; }
export interface StreamSpawner {
  (cmd: string, args: string[], handlers: {
    onLine: (line: string) => void;
    onStderrLine?: (line: string) => void;
    onClose: (code: number | null, signal: string | null) => void;
  }): SpawnHandle;
}

export interface SpawnExecutorResult { envelope?: Envelope; state: StreamState; killedReason?: "stall" | "timeout"; }

export interface SpawnExecutorDeps {
  spawner?: StreamSpawner;
  logLine?: (line: string) => void;
  now?: () => number;
  timeoutMs?: number;       // hard backstop
  stallMs?: number;         // no-event watchdog (default 60s)
  tickMs?: number;          // watchdog poll interval (default 5s)
  killGraceMs?: number;     // SIGTERM → SIGKILL delay (default 5s)
  forceResolveMs?: number;  // SIGKILL → force-resolve delay (default 5s)
}

// Default streaming spawner: spawn + newline buffering (stdout → onLine, stderr → onStderrLine), \r-stripped.
const defaultSpawner: StreamSpawner = (cmd, args, h) => {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  const lineBuf = (emit: (line: string) => void) => {
    let buf = "";
    return {
      push(d: Buffer) { buf += d.toString(); let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) { emit(buf.slice(0, nl).replace(/\r$/, "")); buf = buf.slice(nl + 1); } },
      flush() { if (buf.trim()) emit(buf.replace(/\r$/, "")); },
    };
  };
  const out = lineBuf(h.onLine);
  const err = lineBuf((l) => h.onStderrLine?.(l));
  child.stdout.on("data", (d: Buffer) => out.push(d));
  child.stderr.on("data", (d: Buffer) => err.push(d));
  child.on("close", (code, signal) => { out.flush(); err.flush(); h.onClose(code, signal); });
  child.on("error", () => h.onClose(null, null));
  return { kill: (sig) => { try { child.kill(sig); } catch { /* already dead */ } } };
};

export function spawnExecutor(opts: ExecutorArgsOptions, deps: SpawnExecutorDeps = {}): Promise<SpawnExecutorResult> {
  const spawner = deps.spawner ?? defaultSpawner;
  const logLine = deps.logLine ?? (() => {});
  const now = deps.now ?? (() => Date.now());
  const stallMs = deps.stallMs ?? 60_000;
  const tickMs = deps.tickMs ?? 5_000;
  const killGraceMs = deps.killGraceMs ?? 5_000;
  const forceResolveMs = deps.forceResolveMs ?? 5_000;
  const acc = makeStreamAccumulator(now);

  return new Promise<SpawnExecutorResult>((resolve) => {
    let lastEvent = now();
    let killedReason: "stall" | "timeout" | undefined;
    let done = false;
    let killing = false;
    const intervals: NodeJS.Timeout[] = [];
    const timeouts: NodeJS.Timeout[] = [];
    const clearAll = () => { intervals.forEach(clearInterval); timeouts.forEach(clearTimeout); };

    const settle = () => {
      if (done) return;
      done = true; clearAll();
      const snap = acc.snapshot();
      resolve({ envelope: snap.envelope, state: snap, killedReason });
    };

    let handle: SpawnHandle;
    // SIGTERM, then escalate to SIGKILL, then force-resolve if close never fires (hung child can't hang the run).
    const killEscalate = (reason: "stall" | "timeout") => {
      if (killing || done) return;
      killing = true; killedReason = reason;
      handle.kill("SIGTERM");
      timeouts.push(setTimeout(() => { if (!done) handle.kill("SIGKILL"); }, killGraceMs));
      timeouts.push(setTimeout(settle, killGraceMs + forceResolveMs));
    };

    handle = spawner("claude", buildExecutorArgs(opts), {
      onLine: (line) => { lastEvent = now(); acc.push(line); logLine(line); },
      onStderrLine: (line) => { logLine("[stderr] " + line); },
      onClose: () => settle(),
    });

    intervals.push(setInterval(() => {
      if (!done && !killing && now() - lastEvent > stallMs) killEscalate("stall");
    }, tickMs));

    if (deps.timeoutMs) {
      timeouts.push(setTimeout(() => { if (!done && !killing) killEscalate("timeout"); }, deps.timeoutMs));
    }
  });
}
