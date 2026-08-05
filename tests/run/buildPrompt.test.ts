import { describe, it, expect } from "vitest";
import { buildUserPrompt, SYSTEM_CONTRACT, localeToLanguageType } from "../../src/run/buildPrompt.js";
import type { Scenario } from "../../src/scenario/types.js";

const scenario: Scenario = {
  id: "login-success", title: "login success", locale: "ru",
  steps: [
    { action: "navigate", url: "/" },
    { action: "fill", target: { css: "#userId" }, value: "${secrets.tester.username}" },
    { action: "assert_visible", target: { css: "#v_header" } },
  ],
};

describe("localeToLanguageType", () => {
  it("maps locale to a localStorage value", () => {
    expect(localeToLanguageType("kg")).toBe("lng_type_1");
    expect(localeToLanguageType("ru")).toBe("lng_type_2");
    expect(localeToLanguageType("kr")).toBe("lng_type_3");
  });
});

describe("buildUserPrompt", () => {
  it("includes the app URL, the locale pin and the step checklist", () => {
    const p = buildUserPrompt(scenario, { frontend: "http://localhost:5173" }, (v) => v.replace("${secrets.tester.username}", "U"));
    expect(p).toContain("http://localhost:5173");
    expect(p).toContain("lng_type_2");          // locale pin
    expect(p).toContain("Navigate: /");
    expect(p).toContain('Fill: [css #userId] ← "U"');   // secrets resolved
    expect(p).toContain("Assert visible: [css #v_header]");
  });
  it("instructs the executor to emit result JSON", () => {
    const p = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    expect(p).toMatch(/JSON/);
    expect(p).toContain("PASS");
  });
  it("uses pre-resolved targets and tells the executor not to grope", () => {
    const p = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    expect(p).toMatch(/pre-resolved/);
    expect(p).toMatch(/don't grope/);
  });
  it("resolves secrets in an assert_value expectation too, same as fill", () => {
    const sc: Scenario = {
      id: "x", title: "x", locale: "ru",
      steps: [{ action: "assert_value", target: { css: "#userId" }, value: "${secrets.tester.username}" }],
    };
    const p = buildUserPrompt(sc, { frontend: "http://x" }, (v) => v.replace("${secrets.tester.username}", "U"));
    expect(p).toContain('Assert value: [css #userId] == "U"');
  });
  it("injects the check-once-immediately rule for an ephemeral scenario", () => {
    const eph = { ...scenario, ephemeral: true };
    const p = buildUserPrompt(eph, { frontend: "http://x" }, (v) => v);
    expect(p).toMatch(/ephemeral/i);
    const p2 = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    expect(p2).not.toMatch(/ephemeral check/i);
  });
});

describe("SYSTEM_CONTRACT", () => {
  it("carries the four labels and the safety rule against acting outside the scenario", () => {
    expect(SYSTEM_CONTRACT).toContain("NOT_TESTED");
    expect(SYSTEM_CONTRACT).toMatch(/outside the scenario/i);
  });
  it("puts the selector first and forbids groping", () => {
    expect(SYSTEM_CONTRACT).toMatch(/selector/i);
    expect(SYSTEM_CONTRACT).toMatch(/grope/i);
  });
  it("forbids full-page reads", () => {
    expect(SYSTEM_CONTRACT).toContain("read_page");
  });
  it("self-bails immediately after one attempt", () => {
    expect(SYSTEM_CONTRACT).toMatch(/once|one attempt/i);
  });
  it("forbids repeating the same find (groping) and warns about the runtime kill", () => {
    expect(SYSTEM_CONTRACT).toMatch(/groping/i);
  });
  it("requires handoff_notes as fuel for the ping-pong", () => {
    expect(SYSTEM_CONTRACT).toContain("handoff_notes");
  });
  it("spells out how assert_value is evaluated: read the value, compare exactly", () => {
    expect(SYSTEM_CONTRACT).toMatch(/assert_value/);
    expect(SYSTEM_CONTRACT).toMatch(/\.value/);
  });
  it("per-tab discipline: act only on your own tab_id, so parallel runs are safe", () => {
    expect(SYSTEM_CONTRACT).toContain("tab_id");
    expect(SYSTEM_CONTRACT).toMatch(/tab isolation/i);
    expect(SYSTEM_CONTRACT).toMatch(/tab mix-up/i);
    expect(SYSTEM_CONTRACT).toContain("tabs_create_mcp");   // force a new tab, no reuse
  });
  it("screenshots are best-effort and non-blocking, plus the ephemeral policy", () => {
    expect(SYSTEM_CONTRACT).toMatch(/best-effort|evidence only/i);
    expect(SYSTEM_CONTRACT).toMatch(/re-capturing|loop/i);
    expect(SYSTEM_CONTRACT).toMatch(/ephemeral/i);
  });
});
