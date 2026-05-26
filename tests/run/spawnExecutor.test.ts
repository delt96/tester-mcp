import { describe, it, expect, vi } from "vitest";
import { spawnExecutor, parseEnvelope, type StreamSpawner } from "../../src/run/spawnExecutor.js";

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
  it("JSON envelope 파싱, 실패 시 raw", () => {
    expect(parseEnvelope('{"result":"R"}').result).toBe("R");
    expect(parseEnvelope("plain").result).toBe("plain");
  });
});

describe("spawnExecutor (streaming)", () => {
  it("정상 종료: envelope + state 반환, 각 줄 로그", async () => {
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

  it("스톨: 무이벤트 stallMs 초과 시 kill + killedReason='stall', trail 보존", async () => {
    let killed: string | undefined;
    const spawner: StreamSpawner = (_c, _a, h) => {
      h.onLine(toolLine);                       // 하나만 오고 침묵
      return { kill: (sig) => { killed = sig; h.onClose(null, sig); } };
    };
    const now = (() => { let t = 0; return () => (t += 1000); })(); // 매 호출 +1s
    const r = await spawnExecutor(
      { prompt: "P", systemPrompt: "S", model: "haiku" },
      { spawner, logLine: () => {}, now, stallMs: 1500, tickMs: 1 }
    );
    expect(killed).toBe("SIGTERM");
    expect(r.killedReason).toBe("stall");
    expect(r.state.lastTool).toBe("navigate");
    expect(r.envelope).toBeUndefined();
  });

  it("hung child(SIGTERM 무시): SIGKILL 에스컬레이션 + 강제 resolve, trail 보존", async () => {
    const sigs: string[] = [];
    const spawner: StreamSpawner = (_c, _a, h) => {
      h.onLine(toolLine);                       // 한 줄 오고 영원히 침묵 (close 안 함)
      return { kill: (s) => { sigs.push(s); } }; // 시그널 무시 → close 안 일어남
    };
    const now = (() => { let t = 0; return () => (t += 1000); })();
    const r = await spawnExecutor(
      { prompt: "P", systemPrompt: "S", model: "haiku" },
      { spawner, logLine: () => {}, now, stallMs: 1, tickMs: 1, killGraceMs: 5, forceResolveMs: 5 }
    );
    expect(sigs).toContain("SIGTERM");
    expect(sigs).toContain("SIGKILL");
    expect(r.killedReason).toBe("stall");
    expect(r.state.lastTool).toBe("navigate");   // 강제 resolve여도 trail 남음
    expect(r.envelope).toBeUndefined();
  });

  it("하드 타임아웃: timeoutMs 초과 → killedReason='timeout'", async () => {
    const spawner: StreamSpawner = (_c, _a, h) => {
      h.onLine(toolLine);
      return { kill: () => h.onClose(null, "SIGTERM") }; // SIGTERM에 정상 종료
    };
    const r = await spawnExecutor(
      { prompt: "P", systemPrompt: "S", model: "haiku" },
      { spawner, logLine: () => {}, now: () => 0, stallMs: 999999, tickMs: 999999, timeoutMs: 5, killGraceMs: 5, forceResolveMs: 5 }
    );
    expect(r.killedReason).toBe("timeout");
  });
});
