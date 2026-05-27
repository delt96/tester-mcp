import { describe, it, expect } from "vitest";
import { buildUserPrompt, SYSTEM_CONTRACT, localeToLanguageType } from "../../src/run/buildPrompt.js";
import type { Scenario } from "../../src/scenario/types.js";

const scenario: Scenario = {
  id: "login-success", title: "로그인 성공", locale: "ru",
  steps: [
    { action: "navigate", url: "/" },
    { action: "fill", target: { css: "#userId" }, value: "${secrets.tester.username}" },
    { action: "assert_visible", target: { css: "#v_header" } },
  ],
};

describe("localeToLanguageType", () => {
  it("locale을 localStorage 값으로 매핑", () => {
    expect(localeToLanguageType("kg")).toBe("lng_type_1");
    expect(localeToLanguageType("ru")).toBe("lng_type_2");
    expect(localeToLanguageType("kr")).toBe("lng_type_3");
  });
});

describe("buildUserPrompt", () => {
  it("앱 URL + 로케일 고정 지시 + step 체크리스트 포함", () => {
    const p = buildUserPrompt(scenario, { frontend: "http://localhost:5173" }, (v) => v.replace("${secrets.tester.username}", "U"));
    expect(p).toContain("http://localhost:5173");
    expect(p).toContain("lng_type_2");          // 로케일 고정
    expect(p).toContain("이동: /");
    expect(p).toContain('입력: [css #userId] ← "U"');   // secrets 해석됨
    expect(p).toContain("가시 검증: [css #v_header]");
  });
  it("결과 JSON 방출 지시 포함", () => {
    const p = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    expect(p).toMatch(/JSON/);
    expect(p).toContain("PASS");
  });
  it("target 사전해석 사용 + 더듬기 유도 문구 제거", () => {
    const p = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    expect(p).toMatch(/사전 해석/);
    expect(p).not.toContain("요소를 찾아라");
  });
  it("ephemeral 시나리오면 즉시-단일-체크 지시 주입", () => {
    const eph = { ...scenario, ephemeral: true };
    const p = buildUserPrompt(eph, { frontend: "http://x" }, (v) => v);
    expect(p).toMatch(/ephemeral|즉시|소멸/);
    const p2 = buildUserPrompt(scenario, { frontend: "http://x" }, (v) => v);
    expect(p2).not.toMatch(/ephemeral 검증/);
  });
});

describe("SYSTEM_CONTRACT", () => {
  it("4종 라벨 + 안전규칙(시나리오 외 동작 금지)", () => {
    expect(SYSTEM_CONTRACT).toContain("NOT_TESTED");
    expect(SYSTEM_CONTRACT).toMatch(/시나리오에 없는 동작/);
  });
  it("셀렉터 우선 + 더듬기 금지", () => {
    expect(SYSTEM_CONTRACT).toContain("셀렉터");
    expect(SYSTEM_CONTRACT).toMatch(/더듬/);
  });
  it("전체 페이지 읽기 금지", () => {
    expect(SYSTEM_CONTRACT).toContain("read_page");
  });
  it("1회 시도 후 즉시 자가종료", () => {
    expect(SYSTEM_CONTRACT).toMatch(/1회/);
  });
  it("handoff_notes를 핑퐁 연료로 요구", () => {
    expect(SYSTEM_CONTRACT).toContain("handoff_notes");
  });
  it("per-tab 디스플린: 자기 tab_id만 조작 (병렬 안전)", () => {
    expect(SYSTEM_CONTRACT).toContain("tab_id");
    expect(SYSTEM_CONTRACT).toMatch(/탭 격리|전용 탭/);
    expect(SYSTEM_CONTRACT).toMatch(/탭 혼선/);
    expect(SYSTEM_CONTRACT).toContain("tabs_create_mcp");   // 기존 탭 재사용 말고 새 탭 강제
  });
  it("스크린샷 best-effort·비차단 + ephemeral 정책", () => {
    expect(SYSTEM_CONTRACT).toMatch(/best-effort|증거일 뿐/);
    expect(SYSTEM_CONTRACT).toMatch(/재촬영|루프/);
    expect(SYSTEM_CONTRACT).toMatch(/[Ee]phemeral|자동소멸/);
  });
});
