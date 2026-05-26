import { describe, it, expect } from "vitest";
import { clampConcurrency, runScenarios, MAX_CONCURRENCY } from "../../src/run/runScenarios.js";
import type { Scenario } from "../../src/scenario/types.js";
import type { RunScenarioOptions } from "../../src/run/runScenario.js";

describe("clampConcurrency", () => {
  it("미지정이면 min(시나리오 수, MAX)", () => {
    expect(clampConcurrency(undefined, 3)).toBe(3);
    expect(clampConcurrency(undefined, 50)).toBe(MAX_CONCURRENCY);
    expect(clampConcurrency(undefined, 0)).toBe(1);
  });
  it("요청값을 [1, MAX]로 클램프", () => {
    expect(clampConcurrency(5, 100)).toBe(5);
    expect(clampConcurrency(999, 100)).toBe(MAX_CONCURRENCY);
    expect(clampConcurrency(0, 100)).toBe(1);
    expect(clampConcurrency(-4, 100)).toBe(1);
    expect(clampConcurrency(3.9, 100)).toBe(3);
  });
});

const scn = (id: string): Scenario => ({
  id, title: id, locale: "ru", steps: [{ action: "navigate", url: "/" }],
});

function baseOpts(runner: RunScenarioOptions["runner"]): RunScenarioOptions {
  return {
    runId: "RID", targets: { frontend: "http://x" }, model: "haiku",
    env: { node_version: "v20", os: "win32", runner_model: "haiku" },
    resolveValue: (v) => v, runner, now: () => new Date("2026-05-26T00:00:00Z"),
  };
}

describe("runScenarios", () => {
  it("입력 순서대로 결과를 반환", async () => {
    const runner = async () => '{"result":"```json\\n{\\"status\\":\\"PASS\\"}\\n```"}';
    const out = await runScenarios([scn("a"), scn("b"), scn("c")], baseOpts(runner), 2);
    expect(out.map((r) => r.scenario_id)).toEqual(["a", "b", "c"]);
    expect(out.every((r) => r.status === "PASS")).toBe(true);
  });

  it("동시 실행 수가 concurrency를 넘지 않음", async () => {
    let inFlight = 0, peak = 0;
    const runner = async () => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return '{"result":"```json\\n{\\"status\\":\\"PASS\\"}\\n```"}';
    };
    await runScenarios([scn("1"), scn("2"), scn("3"), scn("4"), scn("5")], baseOpts(runner), 2);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
