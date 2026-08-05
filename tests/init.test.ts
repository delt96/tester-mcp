import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { renderConfigYaml, skillsDirFor, secretsExampleYaml, skillAssetNames } from "../src/init.js";
import { parse as parseYaml } from "yaml";

describe("renderConfigYaml", () => {
  it("emits only frontend + model when backend/project/language are absent", () => {
    const yaml = renderConfigYaml({ frontend: "http://localhost:5173", model: "haiku" });
    const parsed = parseYaml(yaml) as any;
    expect(parsed).toEqual({
      targets: { frontend: "http://localhost:5173" },
      runner: { model: "haiku" },
    });
    expect(yaml).not.toMatch(/project:/);
    expect(yaml).not.toMatch(/language:/);
  });
  it("includes targets.backend when a backend is given", () => {
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

describe("skillAssetNames", () => {
  it("installs every .md beside SKILL.md, not SKILL.md alone", () => {
    const got = skillAssetNames(["SKILL.md", "workflow.md", "document-guide.md"]);
    expect(got).toEqual(["SKILL.md", "document-guide.md", "workflow.md"]);
  });
  it("skips non-markdown entries", () => {
    expect(skillAssetNames(["SKILL.md", "notes.txt", "assets", ".DS_Store"])).toEqual(["SKILL.md"]);
  });
  it("is case-insensitive on the extension", () => {
    expect(skillAssetNames(["README.MD"])).toEqual(["README.MD"]);
  });
});

describe("secretsExampleYaml", () => {
  it("keeps only tester live — commented-out accounts do not parse", () => {
    const parsed = parseYaml(secretsExampleYaml()) as any;
    expect(parsed).toEqual({ tester: { username: "YOUR_ID", password: "YOUR_PASSWORD" } });
  });
  it("documents the multi-account convention in a comment", () => {
    const raw = secretsExampleYaml();
    expect(raw).toMatch(/\$\{secrets\.<account>\.username\}/);
    expect(raw).toContain("# admin:");
  });
});
