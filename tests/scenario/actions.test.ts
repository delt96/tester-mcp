import { describe, it, expect } from "vitest";
import { KNOWN_ACTIONS, isKnownAction, describeTarget, renderStep } from "../../src/scenario/actions.js";

describe("describeTarget", () => {
  it("제공된 모든 전략을 우선순위 순서로 합친다", () => {
    expect(describeTarget({ css: "#userId", placeholder: "ИНН" }))
      .toBe('css #userId / placeholder "ИНН"');
    expect(describeTarget({ text: "Sign In", role: "button" }))
      .toBe('텍스트 "Sign In" / role button');
    expect(describeTarget({ description: "좌측 메뉴" })).toBe('설명 "좌측 메뉴"');
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
    expect(renderStep({ action: "navigate", url: "/" })).toBe("이동: /");
    expect(renderStep({ action: "fill", target: { css: "#userId" }, value: "u1" }))
      .toBe('입력: [css #userId] ← "u1"');
    expect(renderStep({ action: "assert_visible", target: { css: "#v_header" } }))
      .toBe("가시 검증: [css #v_header]");
  });
});
