import { describe, it, expect } from "vitest";
import { runScenario } from "../../src/run/runScenario.js";
import type { Scenario } from "../../src/scenario/types.js";
import type { StreamSpawner } from "../../src/run/spawnExecutor.js";

const scenario: Scenario = { id: "s1", title: "t", locale: "ru", steps: [{ action: "navigate", url: "/" }] };
const base = {
  runId: "RID", targets: { frontend: "http://x" }, model: "haiku",
  env: { node_version: "v20", os: "win32", runner_model: "haiku" },
  resolveValue: (v: string) => v, now: () => new Date("2026-05-26T00:00:00Z"),
};
const okResult = JSON.stringify({ type: "result", result: '```json\n{"status":"PASS","evidence":["ok"]}\n```' });
const tool = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "navigate" }] } });

describe("runScenario (streaming)", () => {
  it("정상: PASS + last_tool/tool_count 기록", async () => {
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(tool); h.onLine(okResult); h.onClose(0, null); return { kill() {} }; };
    const r = await runScenario(scenario, { ...base, spawner, logLine: () => {} });
    expect(r.status).toBe("PASS");
    expect(r.last_tool).toBe("navigate");
    expect(r.tool_count).toBe(1);
  });
  it("무응답(envelope 없음): NOT_TESTED + 이유에 마지막 도구", async () => {
    const spawner: StreamSpawner = (_c, _a, h) => { h.onLine(tool); h.onClose(null, "SIGTERM"); return { kill() {} }; };
    const r = await runScenario(scenario, { ...base, spawner, logLine: () => {} });
    expect(r.status).toBe("NOT_TESTED");
    expect(r.not_tested_reason).toMatch(/navigate/);
    expect(r.last_tool).toBe("navigate");
  });
});
