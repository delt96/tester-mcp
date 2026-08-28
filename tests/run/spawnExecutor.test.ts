import { describe, it, expect, vi } from "vitest";
import { spawnExecutor, parseEnvelope, killProcessTree, type StreamSpawner } from "../../src/run/spawnExecutor.js";

// Fake spawner: emits the given lines synchronously, then closes.
function fakeSpawner(lines: string[], opts: { close?: { code: number | null; signal: string | null }; hang?: boolean } = {}): StreamSpawner {
  return (_cmd, _args, h) => {
    for (const l of lines) h.onLine(l);
    if (!opts.hang) h.onClose(opts.close?.code ?? 0, opts.close?.signal ?? null);
    return { kill: vi.fn() };
  };
}

const resultLine = JSON.stringify({ type: "result", result: '{"status":"PASS"}', session_id: "S" });
const toolLine = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "navigate" }] } });

describe("parseEnvelope", () => {
  it("parses the JSON envelope, falling back to raw", () => {
    expect(parseEnvelope('{"result":"R"}').result).toBe("R");
    expect(parseEnvelope("plain").result).toBe("plain");
  });
});

describe("spawnExecutor (streaming)", () => {
  it("clean exit: returns envelope + state and logs every line", async () => {
    const logged: string[] = [];
    const r = await spawnExecutor(
      { prompt: "P", systemPrompt: "S", model: "haiku" },
      { spawner: fakeSpawner([toolLine, resultLine]), logLine: (l) => logged.push(l) }
    );
    expect(r.envelope?.result).toBe('{"status":"PASS"}');
    expect(r.state.lastTool).toBe("navigate");
    expect(r.state.toolCount).toBe(1);
    expect(logged.length).toBe(2);
  });

  it("stall: kills after stallMs with no events, sets killedReason='stall', keeps the trail", async () => {
    let killed: string | undefined;
    const spawner: StreamSpawner = (_c, _a, h) => {
      h.onLine(toolLine);                       // one line, then silence
      return { kill: (sig) => { killed = sig; h.onClose(null, sig); } };
    };
    const now = (() => { let t = 0; return () => (t += 1000); })(); // +1s per call
    const r = await spawnExecutor(
      { prompt: "P", systemPrompt: "S", model: "haiku" },
      { spawner, logLine: () => {}, now, stallMs: 1500, tickMs: 1 }
    );
    expect(killed).toBe("SIGTERM");
    expect(r.killedReason).toBe("stall");
    expect(r.state.lastTool).toBe("navigate");
    expect(r.envelope).toBeUndefined();
  });

  it("hung child ignoring SIGTERM: escalates to SIGKILL, force-resolves, keeps the trail", async () => {
    const sigs: string[] = [];
    const spawner: StreamSpawner = (_c, _a, h) => {
      h.onLine(toolLine);                       // one line, then silence forever (never closes)
      return { kill: (s) => { sigs.push(s); } }; // signals ignored -> close never fires
    };
    const now = (() => { let t = 0; return () => (t += 1000); })();
    const r = await spawnExecutor(
      { prompt: "P", systemPrompt: "S", model: "haiku" },
      { spawner, logLine: () => {}, now, stallMs: 1, tickMs: 1, killGraceMs: 5, forceResolveMs: 5 }
    );
    expect(sigs).toContain("SIGTERM");
    expect(sigs).toContain("SIGKILL");
    expect(r.killedReason).toBe("stall");
    expect(r.state.lastTool).toBe("navigate");   // the trail survives a forced resolve
    expect(r.envelope).toBeUndefined();
  });

  it("groping: kills after gropingLimit back-to-back calls of the same tool, even though events keep flowing so stall never fires", async () => {
    let killed: string | undefined;
    const findLine = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "find" }] } });
    const spawner: StreamSpawner = (_c, _a, h) => {
      for (let i = 0; i < 8; i++) h.onLine(findLine);   // the same find 8 times — events keep flowing
      return { kill: (sig) => { killed = sig; h.onClose(null, sig); } };
    };
    const r = await spawnExecutor(
      { prompt: "P", systemPrompt: "S", model: "haiku" },
      { spawner, logLine: () => {}, now: () => 0, stallMs: 999999, tickMs: 1, gropingLimit: 5 }
    );
    expect(killed).toBe("SIGTERM");
    expect(r.killedReason).toBe("groping");
    expect(r.state.lastTool).toBe("find");
    expect(r.envelope).toBeUndefined();
  });

  it("does not mistake normal alternating calls for groping", async () => {
    const a = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "find" }] } });
    const b = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "click" }] } });
    const r = await spawnExecutor(
      { prompt: "P", systemPrompt: "S", model: "haiku" },
      { spawner: fakeSpawner([a, b, a, b, a, b, resultLine]), logLine: () => {}, now: () => 0, tickMs: 1, gropingLimit: 3 }
    );
    expect(r.killedReason).toBeUndefined();
    expect(r.envelope?.result).toBe('{"status":"PASS"}');
  });

  it("hard timeout: exceeding timeoutMs sets killedReason='timeout'", async () => {
    const spawner: StreamSpawner = (_c, _a, h) => {
      h.onLine(toolLine);
      return { kill: () => h.onClose(null, "SIGTERM") }; // exits cleanly on SIGTERM
    };
    const r = await spawnExecutor(
      { prompt: "P", systemPrompt: "S", model: "haiku" },
      { spawner, logLine: () => {}, now: () => 0, stallMs: 999999, tickMs: 999999, timeoutMs: 5, killGraceMs: 5, forceResolveMs: 5 }
    );
    expect(r.killedReason).toBe("timeout");
  });
});

describe("killProcessTree", () => {
  it("on Windows, SIGKILL escalates to taskkill /T /F so the claude grandchild dies too", () => {
    const exec = vi.fn(); const kill = vi.fn();
    killProcessTree(4242, "SIGKILL", { platform: "win32", kill, exec });
    expect(exec).toHaveBeenCalledWith("taskkill", ["/pid", "4242", "/T", "/F"]);
    expect(kill).not.toHaveBeenCalled();
  });
  it("on Windows, SIGTERM still asks politely through the child handle first", () => {
    const exec = vi.fn(); const kill = vi.fn();
    killProcessTree(4242, "SIGTERM", { platform: "win32", kill, exec });
    expect(kill).toHaveBeenCalledWith("SIGTERM");
    expect(exec).not.toHaveBeenCalled();
  });
  it("on POSIX, signals go to the child handle (process groups are not used here)", () => {
    const exec = vi.fn(); const kill = vi.fn();
    killProcessTree(4242, "SIGKILL", { platform: "linux", kill, exec });
    expect(kill).toHaveBeenCalledWith("SIGKILL");
    expect(exec).not.toHaveBeenCalled();
  });
  it("falls back to the child handle when the pid is unknown", () => {
    const exec = vi.fn(); const kill = vi.fn();
    killProcessTree(undefined, "SIGKILL", { platform: "win32", kill, exec });
    expect(kill).toHaveBeenCalledWith("SIGKILL");
    expect(exec).not.toHaveBeenCalled();
  });
});
