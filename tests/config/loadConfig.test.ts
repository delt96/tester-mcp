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
});
