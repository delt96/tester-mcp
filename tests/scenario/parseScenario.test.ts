import { describe, it, expect } from "vitest";
import { parseScenario } from "../../src/scenario/parseScenario.js";

const YAML = `
id: login-success
title: 로그인 성공
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
  it("YAML을 Scenario로 파싱한다", () => {
    const s = parseScenario(YAML);
    expect(s.id).toBe("login-success");
    expect(s.locale).toBe("ru");
    expect(s.steps).toHaveLength(4);
    expect(s.steps[0]).toEqual({ action: "navigate", url: "/" });
    expect((s.steps[1] as any).target).toEqual({ css: "#userId", placeholder: "ИНН" });
  });
  it("id/title/steps 누락 시 에러", () => {
    expect(() => parseScenario("title: x")).toThrow(/id/);
  });
  it("미등록 액션이면 에러", () => {
    expect(() => parseScenario("id: a\ntitle: b\nsteps:\n  - action: assert_toast"))
      .toThrow(/assert_toast/);
  });
  it("id에 경로 문자가 있으면 거부 (path injection 방지)", () => {
    expect(() => parseScenario("id: ../../etc/x\ntitle: t\nsteps: []")).toThrow(/id/);
    expect(() => parseScenario("id: a/b\ntitle: t\nsteps: []")).toThrow(/id/);
  });
});
