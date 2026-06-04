import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { renderConfigYaml, skillsDirFor, secretsExampleYaml } from "../src/init.js";
import { parse as parseYaml } from "yaml";

describe("renderConfigYaml", () => {
  it("frontend + model 만 있을 때 backend/project/language 없이 생성", () => {
    const yaml = renderConfigYaml({ frontend: "http://localhost:5173", model: "haiku" });
    const parsed = parseYaml(yaml) as any;
    expect(parsed).toEqual({
      targets: { frontend: "http://localhost:5173" },
      runner: { model: "haiku" },
    });
    expect(yaml).not.toMatch(/project:/);
    expect(yaml).not.toMatch(/language:/);
  });
  it("backend가 있으면 targets.backend 포함", () => {
    const yaml = renderConfigYaml({
      frontend: "http://localhost:5173",
      backend: "http://localhost:8081",
      model: "sonnet",
    });
    const parsed = parseYaml(yaml) as any;
    expect(parsed.targets.backend).toBe("http://localhost:8081");
    expect(parsed.runner.model).toBe("sonnet");
  });
});

describe("skillsDirFor", () => {
  it("global → <home>/.claude/skills", () => {
    expect(skillsDirFor("global", "/proj", "/home/u")).toBe(join("/home/u", ".claude", "skills"));
  });
  it("project → <projectPath>/.claude/skills", () => {
    expect(skillsDirFor("project", "/proj", "/home/u")).toBe(join("/proj", ".claude", "skills"));
  });
});

describe("secretsExampleYaml", () => {
  it("tester만 라이브 블록 (주석 계정은 파싱에 안 잡힘)", () => {
    const parsed = parseYaml(secretsExampleYaml()) as any;
    expect(parsed).toEqual({ tester: { username: "YOUR_ID", password: "YOUR_PASSWORD" } });
  });
  it("다중 계정 컨벤션을 주석으로 안내", () => {
    const raw = secretsExampleYaml();
    expect(raw).toMatch(/\$\{secrets\.<account>\.username\}/);
    expect(raw).toContain("# admin:");
  });
});
