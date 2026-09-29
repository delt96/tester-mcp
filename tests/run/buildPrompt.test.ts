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
  it("instructs the executor to report the verdict through the tester tools", () => {
    const p = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    expect(p).toContain("mcp__tester__report_final");
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
  it("puts screenshots in report_final, not inside the per-step reports", () => {
    const p = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    const finalAt = p.indexOf("mcp__tester__report_final");
    const shotAt = p.indexOf("screenshots[]");
    expect(finalAt).toBeGreaterThan(-1);
    expect(shotAt).toBeGreaterThan(finalAt);
    expect(p).not.toMatch(/steps: \[\{ index, status, note\?, screenshot/);
  });
  it("pins the step index to one integer, because a range breaks JSON parsing", () => {
    const p = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    expect(p).toMatch(/single integer/i);
    expect(p).toMatch(/range/i);
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
  it("pins a Double-click step to the computer tool's double_click action", () => {
    expect(SYSTEM_CONTRACT).toMatch(/Double-click/);
    expect(SYSTEM_CONTRACT).toContain("double_click");
  });
  it("screenshots are best-effort and non-blocking, plus the ephemeral policy", () => {
    expect(SYSTEM_CONTRACT).toMatch(/best-effort|evidence only/i);
    expect(SYSTEM_CONTRACT).toMatch(/re-capturing|loop/i);
    expect(SYSTEM_CONTRACT).toMatch(/ephemeral/i);
  });
  it("forbids inventing expectations the steps do not state", () => {
    expect(SYSTEM_CONTRACT).toMatch(/do not invent expectations/i);
    expect(SYSTEM_CONTRACT).toMatch(/disappearing from a list/i);
  });
  it("tells the executor to persist screenshots and report their paths", () => {
    expect(SYSTEM_CONTRACT).toContain("save_to_disk");
    expect(SYSTEM_CONTRACT).toContain("screenshots");
  });
  it("contracts assert_not_visible, including the settle rule that stops a free pass", () => {
    expect(SYSTEM_CONTRACT).toContain("assert_not_visible");
    expect(SYSTEM_CONTRACT).toMatch(/settled/i);
    expect(SYSTEM_CONTRACT).toMatch(/NOT_TESTED, not PASS/);
  });
  it("contracts upload: use file_upload, never click the input", () => {
    expect(SYSTEM_CONTRACT).toContain("[Upload]");
    expect(SYSTEM_CONTRACT).toContain("file_upload");
    expect(SYSTEM_CONTRACT).toContain("NEVER click a file input");
    expect(SYSTEM_CONTRACT).toContain("display:none");
  });
});

describe("warm-up screenshot", () => {
  it("attaches the mandatory warm-up to the FIRST navigate step, without renumbering", () => {
    const p = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    const nav = p.split("\n").find((l) => l.startsWith("1. Navigate:"))!;
    expect(nav).toMatch(/warm-up screenshot/i);
    expect(p).toContain("2. Fill:");
  });
  it("marks only the first navigate", () => {
    const s: Scenario = { ...scenario, steps: [
      { action: "navigate", url: "/" },
      { action: "navigate", url: "/second" },
    ] };
    const p = buildUserPrompt(s, { frontend: "http://x" }, (v) => v);
    const lines = p.split("\n");
    expect(lines.find((l) => l.startsWith("1. Navigate:"))).toMatch(/warm-up screenshot/i);
    expect(lines.find((l) => l.startsWith("2. Navigate:"))).not.toMatch(/warm-up/i);
  });
  it("says the warm-up is exempt from the best-effort screenshot rule", () => {
    expect(SYSTEM_CONTRACT).toMatch(/warm-up[\s\S]{0,200}never/i);
  });
});

describe("reporting contract", () => {
  it("tells the executor to report through the tester tools instead of a JSON message", () => {
    expect(SYSTEM_CONTRACT).toContain("[Reporting]");
    expect(SYSTEM_CONTRACT).toContain("mcp__tester__report_steps");
    expect(SYSTEM_CONTRACT).toContain("mcp__tester__report_final");
    expect(SYSTEM_CONTRACT).not.toContain("[Output]");
    const p = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    expect(p).toContain("# Reporting");
    expect(p).not.toContain("# Output format");
    expect(p).toMatch(/single integer/);
  });
  it("forbids re-clicking and explains optional steps", () => {
    expect(SYSTEM_CONTRACT).toContain("[One click per click step]");
    expect(SYSTEM_CONTRACT).toMatch(/never repeat/);
    expect(SYSTEM_CONTRACT).toContain("[Optional steps]");
    expect(SYSTEM_CONTRACT).toContain("SKIPPED");
  });
});

describe("SKIPPED is reserved for optional steps", () => {
  it("tells the executor a skipped mandatory step is FAIL or NOT_TESTED, never SKIPPED", () => {
    expect(SYSTEM_CONTRACT).toMatch(/Only \(optional\) steps may be SKIPPED/);
  });
});

describe("destructive-step outcome wording matches what the report tools accept", () => {
  it("never asks for a per-step PARTIAL (the server rejects it)", () => {
    expect(SYSTEM_CONTRACT).not.toMatch(/report it PARTIAL/);
    expect(SYSTEM_CONTRACT).toMatch(/report that step FAIL with a note/);
  });
});

describe("report calls ride in the same message as the next action", () => {
  it("tells the executor to batch report_steps with the next browser call and never send a report-only message", () => {
    expect(SYSTEM_CONTRACT).toMatch(/SAME message as your next browser tool call/);
    expect(SYSTEM_CONTRACT).toMatch(/never send a message that contains only a report/i);
  });
});

describe("report cadence keeps the kill-loss window small", () => {
  it("demands the report as a parallel tool_use block beside the next action and caps unreported steps", () => {
    expect(SYSTEM_CONTRACT).toMatch(/two tool_use blocks side by side/);
    expect(SYSTEM_CONTRACT).toMatch(/Never let more than 2 finished steps go unreported/);
  });
});
