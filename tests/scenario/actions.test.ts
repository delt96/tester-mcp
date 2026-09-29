import { describe, it, expect } from "vitest";
import { KNOWN_ACTIONS, isKnownAction, describeTarget, renderStep } from "../../src/scenario/actions.js";

describe("describeTarget", () => {
  it("joins every provided strategy in priority order", () => {
    expect(describeTarget({ css: "#userId", placeholder: "ИНН" }))
      .toBe('css #userId / placeholder "ИНН"');
    expect(describeTarget({ text: "Sign In", role: "button" }))
      .toBe('text "Sign In" / role button');
    expect(describeTarget({ description: "left menu" })).toBe('description "left menu"');
  });
});

describe("actions registry", () => {
  it("knows the ten screen actions", () => {
    expect([...KNOWN_ACTIONS].sort()).toEqual(
      ["assert_not_visible", "assert_value", "assert_visible", "click", "double_click", "fill", "navigate", "screenshot", "upload", "wait_for"]
    );
  });
  it("does not know an unregistered action", () => {
    expect(isKnownAction("assert_toast")).toBe(false);
    expect(isKnownAction("click")).toBe(true);
  });
  it("renders a step as an instruction line", () => {
    expect(renderStep({ action: "navigate", url: "/" })).toBe("Navigate: /");
    expect(renderStep({ action: "fill", target: { css: "#userId" }, value: "u1" }))
      .toBe('Fill: [css #userId] ← "u1"');
    expect(renderStep({ action: "assert_visible", target: { css: "#v_header" } }))
      .toBe("Assert visible: [css #v_header]");
    expect(renderStep({ action: "assert_value", target: { css: "#title" }, value: "Draft 1" }))
      .toBe('Assert value: [css #title] == "Draft 1"');
  });
  it("renders double_click as a distinct instruction from click", () => {
    expect(renderStep({ action: "double_click", target: { css: "tbody > tr" } }))
      .toBe("Double-click: [css tbody > tr]");
  });
  it("renders assert_not_visible as a negative assertion", () => {
    expect(renderStep({ action: "assert_not_visible", target: { css: ".board_list tr" } }))
      .toBe("Assert NOT visible: [css .board_list tr]");
  });
  it("renders upload with the parse-time resolved absolute path", () => {
    expect(renderStep({ action: "upload", target: { css: "input[type=file]" }, file: "C:\\fx\\doc.pdf" }))
      .toBe('Upload: [css input[type=file]] ← file "C:\\fx\\doc.pdf"');
  });
});

describe("renderStep suffixes", () => {
  it("marks optional steps and destructive clicks", () => {
    expect(renderStep({ action: "wait_for", target: { css: "#h" }, optional: true } as any)).toMatch(/ \(optional\)$/);
    expect(renderStep({ action: "click", target: { css: "#save" }, destructive: true })).toMatch(/\(destructive — never repeat\)$/);
    expect(renderStep({ action: "click", target: { css: "#save" } })).not.toMatch(/destructive|optional/);
  });
});
