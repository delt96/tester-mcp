import { describe, it, expect } from "vitest";
import { parseEnvelope, spawnExecutor } from "../../src/run/spawnExecutor.js";

describe("parseEnvelope", () => {
  it("envelope에서 result/cost 추출", () => {
    const e = parseEnvelope('{"result":"안녕","total_cost_usd":0.02}');
    expect(e.result).toBe("안녕"); expect(e.total_cost_usd).toBe(0.02);
  });
  it("깨진 envelope이면 result=원문", () => {
    expect(parseEnvelope("not json").result).toBe("not json");
  });
});

describe("spawnExecutor (injected runner)", () => {
  it("주입 runner로 인자 전달 + envelope 파싱", async () => {
    let captured: string[] = [];
    const e = await spawnExecutor({ prompt: "P", systemPrompt: "S", model: "haiku" },
      async (_c, args) => { captured = args; return '{"result":"DONE","total_cost_usd":0.01}'; });
    expect(captured).toContain("--chrome");
    expect(e.result).toBe("DONE");
  });
});
