import { describe, it, expect } from "vitest";
import { runScenario } from "../../src/run/runScenario.js";
import type { Scenario } from "../../src/scenario/types.js";

const scenario: Scenario = {
  id: "login-success", title: "로그인 성공", locale: "ru",
  steps: [{ action: "navigate", url: "/" }],
};

describe("runScenario", () => {
  it("executor 호출 → PASS 결과 조립", async () => {
    const r = await runScenario(scenario, {
      runId: "RID", targets: { frontend: "http://localhost:5173" }, model: "haiku",
      env: { node_version: "v20", os: "win32", runner_model: "haiku" },
      resolveValue: (v) => v,
      runner: async () => '{"result":"```json\\n{\\"status\\":\\"PASS\\",\\"evidence\\":[\\"ok\\"]}\\n```"}',
      now: () => new Date("2026-05-26T00:00:00Z"),
    });
    expect(r.status).toBe("PASS");
    expect(r.evidence).toEqual(["ok"]);
    expect(r.environment.runner_model).toBe("haiku");
  });
  it("깨진 출력이면 NOT_TESTED", async () => {
    const r = await runScenario(scenario, {
      runId: "RID", targets: { frontend: "http://x" }, model: "haiku",
      env: { node_version: "v20", os: "win32" }, resolveValue: (v) => v,
      runner: async () => '{"result":"자연어만"}', now: () => new Date("2026-05-26T00:00:00Z"),
    });
    expect(r.status).toBe("NOT_TESTED");
  });
});
