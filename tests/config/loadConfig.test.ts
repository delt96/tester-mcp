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

describe("parseConfig (preflight)", () => {
  const base = "targets:\n  frontend: http://localhost:5173\n  backend: http://localhost:8081\n";

  it("substitutes ${targets.*} so the port is declared once", () => {
    const c = parseConfig(base + 'preflight:\n  - { url: "${targets.frontend}", expect_title: eBill }\n  - { url: "${targets.backend}/v3/api-docs", expect_status: [200, 401] }\n');
    expect(c.preflight?.[0].url).toBe("http://localhost:5173");
    expect(c.preflight?.[1].url).toBe("http://localhost:8081/v3/api-docs");
    expect(c.preflight?.[0].expect_title).toBe("eBill");
    expect(c.preflight?.[1].expect_status).toEqual([200, 401]);
  });
  it("normalizes a single expect_status into a list", () => {
    const c = parseConfig(base + 'preflight:\n  - { url: "${targets.frontend}", expect_status: 200 }\n');
    expect(c.preflight?.[0].expect_status).toEqual([200]);
  });
  it("fails when preflight refers to a target that is not configured", () => {
    const noBackend = "targets:\n  frontend: http://x\n";
    expect(() => parseConfig(noBackend + 'preflight:\n  - { url: "${targets.backend}/h" }\n'))
      .toThrow(/targets\.backend/);
  });
  it("rejects a non-numeric expect_status", () => {
    expect(() => parseConfig(base + 'preflight:\n  - { url: "${targets.frontend}", expect_status: ok }\n'))
      .toThrow(/expect_status/);
  });
  it("requires a url on every entry", () => {
    expect(() => parseConfig(base + "preflight:\n  - { expect_title: eBill }\n")).toThrow(/url/);
  });
  it("leaves preflight undefined when the block is absent", () => {
    expect(parseConfig(base).preflight).toBeUndefined();
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
