import { describe, it, expect } from "vitest";
import { parseConfig } from "../../src/config/loadConfig.js";

const YAML = `
project: kg_ebill
targets:
  frontend: http://localhost:5173
runner:
  model: haiku
`;

describe("parseConfig", () => {
  it("설정 YAML 파싱", () => {
    const c = parseConfig(YAML);
    expect(c.targets.frontend).toBe("http://localhost:5173");
    expect(c.runner.model).toBe("haiku");
  });
  it("model 미지정 시 기본 haiku", () => {
    expect(parseConfig("project: x\ntargets:\n  frontend: http://x").runner.model).toBe("haiku");
  });
  it("frontend 없으면 에러", () => {
    expect(() => parseConfig("project: x")).toThrow(/frontend/);
  });
  it("timeout_ms 미지정 시 기본 300000(5분)", () => {
    expect(parseConfig(YAML).runner.timeout_ms).toBe(300000);
  });
  it("timeout_ms 설정값 사용", () => {
    expect(parseConfig("targets:\n  frontend: http://x\nrunner:\n  timeout_ms: 60000").runner.timeout_ms).toBe(60000);
  });
});
