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
  it("parses the config YAML", () => {
    const c = parseConfig(YAML);
    expect(c.targets.frontend).toBe("http://localhost:5173");
    expect(c.runner.model).toBe("haiku");
  });
  it("defaults to sonnet — haiku executors are denied chrome tools", () => {
    expect(parseConfig("project: x\ntargets:\n  frontend: http://x").runner.model).toBe("sonnet");
  });
  it("parses runner.effort", () => {
    expect(parseConfig("targets:\n  frontend: http://x\nrunner:\n  effort: low").runner.effort).toBe("low");
  });
  it("effort is undefined when unset (CLI default applies)", () => {
    expect(parseConfig(YAML).runner.effort).toBeUndefined();
  });
  it("rejects an unknown effort level", () => {
    expect(() => parseConfig("targets:\n  frontend: http://x\nrunner:\n  effort: turbo"))
      .toThrow(/effort/);
  });
  it("throws when frontend is missing", () => {
    expect(() => parseConfig("project: x")).toThrow(/frontend/);
  });
  it("defaults timeout_ms to 300000 (5 min)", () => {
    expect(parseConfig(YAML).runner.timeout_ms).toBe(300000);
  });
  it("uses the configured timeout_ms", () => {
    expect(parseConfig("targets:\n  frontend: http://x\nrunner:\n  timeout_ms: 60000").runner.timeout_ms).toBe(60000);
  });
});

describe("vars", () => {
  it("parses vars as a string map", () => {
    const c = parseConfig(`targets: { frontend: "http://x" }\nvars: { doc_url: "/main/a?id=1" }`);
    expect(c.vars).toEqual({ doc_url: "/main/a?id=1" });
  });
  it("defaults to empty map when absent", () => {
    const c = parseConfig(`targets: { frontend: "http://x" }`);
    expect(c.vars).toEqual({});
  });
  it("rejects non-string var values", () => {
    expect(() => parseConfig(`targets: { frontend: "http://x" }\nvars: { n: 3 }`))
      .toThrow(/var 'n' must be a string/);
  });
});
