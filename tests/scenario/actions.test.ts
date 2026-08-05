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
  it("knows the seven screen actions", () => {
    expect([...KNOWN_ACTIONS].sort()).toEqual(
      ["assert_value", "assert_visible", "click", "fill", "navigate", "screenshot", "wait_for"]
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
});
