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
  it("locale → localStorage value 매핑", () => {
    expect(localeToLanguageType("kg")).toBe("lng_type_1");
    expect(localeToLanguageType("ru")).toBe("lng_type_2");
    expect(localeToLanguageType("kr")).toBe("lng_type_3");
  });
});

describe("buildUserPrompt", () => {
  it("앱 URL + 로케일 고정 + step 체크리스트 포함", () => {
    const p = buildUserPrompt(scenario, { frontend: "http://localhost:5173" }, (v) => v.replace("${secrets.tester.username}", "U"));
    expect(p).toContain("http://localhost:5173");
    expect(p).toContain("lng_type_2");          // locale pin
    expect(p).toContain("Navigate: /");
    expect(p).toContain('Fill: [css #userId] ← "U"');   // secrets resolved
    expect(p).toContain("Assert visible: [css #v_header]");
  });
  it("결과 JSON 방출 지시 포함", () => {
    const p = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    expect(p).toMatch(/JSON/);
    expect(p).toContain("PASS");
  });
  it("사전해석 target 사용 + don't-grope 지시", () => {
    const p = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    expect(p).toMatch(/pre-resolved/);
    expect(p).toMatch(/don't grope/);
  });
  it("ephemeral 시나리오면 즉시-단일-체크 지시 주입", () => {
    const eph = { ...scenario, ephemeral: true };
    const p = buildUserPrompt(eph, { frontend: "http://x" }, (v) => v);
    expect(p).toMatch(/ephemeral/i);
    const p2 = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    expect(p2).not.toMatch(/ephemeral check/i);
  });
});

describe("SYSTEM_CONTRACT", () => {
  it("4종 라벨 + 안전규칙(시나리오 외 동작 금지)", () => {
    expect(SYSTEM_CONTRACT).toContain("NOT_TESTED");
    expect(SYSTEM_CONTRACT).toMatch(/outside the scenario/i);
  });
  it("셀렉터 우선 + 더듬기 금지", () => {
    expect(SYSTEM_CONTRACT).toMatch(/selector/i);
    expect(SYSTEM_CONTRACT).toMatch(/grope/i);
  });
  it("전체 페이지 읽기 금지", () => {
    expect(SYSTEM_CONTRACT).toContain("read_page");
  });
  it("1회 시도 후 즉시 자가종료", () => {
    expect(SYSTEM_CONTRACT).toMatch(/once|one attempt/i);
  });
  it("handoff_notes를 핑퐁 연료로 요구", () => {
    expect(SYSTEM_CONTRACT).toContain("handoff_notes");
  });
  it("per-tab 디스플린: 자기 tab_id만 조작 (병렬 안전)", () => {
    expect(SYSTEM_CONTRACT).toContain("tab_id");
    expect(SYSTEM_CONTRACT).toMatch(/tab isolation/i);
    expect(SYSTEM_CONTRACT).toMatch(/tab mix-up/i);
    expect(SYSTEM_CONTRACT).toContain("tabs_create_mcp");   // force a new tab, no reuse
  });
  it("스크린샷 best-effort·비차단 + ephemeral 정책", () => {
    expect(SYSTEM_CONTRACT).toMatch(/best-effort|evidence only/i);
    expect(SYSTEM_CONTRACT).toMatch(/re-capturing|loop/i);
    expect(SYSTEM_CONTRACT).toMatch(/ephemeral/i);
  });
});
