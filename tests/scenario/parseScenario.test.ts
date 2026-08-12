import { describe, it, expect } from "vitest";
import { parseScenario, parseScenarioObject } from "../../src/scenario/parseScenario.js";

const YAML = `
id: login-success
title: login succeeds
locale: ru
login_as: tester
on_failure: stop
defaults: { timeout_ms: 8000 }
steps:
  - action: navigate
    url: /
  - action: fill
    target: { css: "#userId", placeholder: "ИНН" }
    value: "\${secrets.tester.username}"
  - action: click
    target: { text: "Sign In", role: button }
  - action: assert_visible
    target: { css: "#v_header" }
`;

describe("parseScenario", () => {
  it("parses YAML into a Scenario", () => {
    const s = parseScenario(YAML);
    expect(s.id).toBe("login-success");
    expect(s.locale).toBe("ru");
    expect(s.steps).toHaveLength(4);
    expect(s.steps[0]).toEqual({ action: "navigate", url: "/" });
    expect((s.steps[1] as any).target).toEqual({ css: "#userId", placeholder: "ИНН" });
  });
  it("throws when id/title/steps are missing", () => {
    expect(() => parseScenario("title: x")).toThrow(/id/);
  });
  it("throws on an unregistered action", () => {
    expect(() => parseScenario("id: a\ntitle: b\nsteps:\n  - action: assert_toast"))
      .toThrow(/assert_toast/);
  });
  it("rejects an id containing path characters (blocks path injection)", () => {
    expect(() => parseScenario("id: ../../etc/x\ntitle: t\nsteps: []")).toThrow(/id/);
    expect(() => parseScenario("id: a/b\ntitle: t\nsteps: []")).toThrow(/id/);
  });
  it("accepts assert_not_visible as a known action", () => {
    const y = "id: s\ntitle: t\nsteps:\n  - { action: assert_not_visible, target: { css: '.row' } }\n";
    expect(parseScenario(y).steps[0].action).toBe("assert_not_visible");
  });
  it("parses the ephemeral flag (defaults to false)", () => {
    const minStep = "steps:\n  - action: navigate\n    url: /";
    expect(parseScenario(`id: a\ntitle: t\n${minStep}`).ephemeral).toBe(false);
    expect(parseScenario(`id: a\ntitle: t\nephemeral: true\n${minStep}`).ephemeral).toBe(true);
  });
});

describe("parseScenarioObject + tags", () => {
  const base = { id: "t1", title: "t", steps: [{ action: "navigate", url: "/" }] };
  it("accepts an already-parsed object", () => {
    expect(parseScenarioObject(base).id).toBe("t1");
  });
  it("parses tags as a string list", () => {
    expect(parseScenarioObject({ ...base, tags: ["smoke", "letter"] }).tags).toEqual(["smoke", "letter"]);
  });
  it("leaves tags undefined when absent", () => {
    expect(parseScenarioObject(base).tags).toBeUndefined();
  });
  it("rejects non-string tag entries", () => {
    expect(() => parseScenarioObject({ ...base, tags: [1] })).toThrow(/tags/);
  });
});
