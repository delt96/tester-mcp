import { describe, it, expect } from "vitest";
import { KNOWN_ACTIONS, isKnownAction, describeTarget, renderStep } from "../../src/scenario/actions.js";

describe("describeTarget", () => {
  it("제공된 모든 전략을 우선순위 순서로 합친다", () => {
    expect(describeTarget({ css: "#userId", placeholder: "ИНН" }))
      .toBe('css #userId / placeholder "ИНН"');
    expect(describeTarget({ text: "Sign In", role: "button" }))
      .toBe('text "Sign In" / role button');
    expect(describeTarget({ description: "left menu" })).toBe('description "left menu"');
  });
});

describe("actions registry", () => {
  it("화면 액션 6종을 안다", () => {
    expect([...KNOWN_ACTIONS].sort()).toEqual(
      ["assert_visible", "click", "fill", "navigate", "screenshot", "wait_for"]
    );
  });
  it("미등록 액션은 모른다", () => {
    expect(isKnownAction("assert_toast")).toBe(false);
    expect(isKnownAction("click")).toBe(true);
  });
  it("step을 지시문으로 렌더한다", () => {
    expect(renderStep({ action: "navigate", url: "/" })).toBe("Navigate: /");
    expect(renderStep({ action: "fill", target: { css: "#userId" }, value: "u1" }))
      .toBe('Fill: [css #userId] ← "u1"');
    expect(renderStep({ action: "assert_visible", target: { css: "#v_header" } }))
      .toBe("Assert visible: [css #v_header]");
  });
});
