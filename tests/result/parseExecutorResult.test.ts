import { describe, it, expect } from "vitest";
import { parseExecutorResult } from "../../src/result/parseExecutorResult.js";

describe("parseExecutorResult (lenient)", () => {
  it("코드펜스 안 JSON 추출", () => {
    const t = '설명\n```json\n{"status":"PASS","evidence":["#v_header 보임"]}\n```';
    const r = parseExecutorResult(t);
    expect(r.status).toBe("PASS");
    expect(r.evidence).toEqual(["#v_header 보임"]);
  });
  it("순수 JSON도 파싱", () => {
    expect(parseExecutorResult('{"status":"FAIL"}').status).toBe("FAIL");
  });
  it("파싱 불가 시 NOT_TESTED + 원문 보존", () => {
    const r = parseExecutorResult("자연어만 있음");
    expect(r.status).toBe("NOT_TESTED");
    expect(r.raw_executor_text).toContain("자연어");
  });
  it("status 4종 외면 NOT_TESTED 강등", () => {
    expect(parseExecutorResult('{"status":"OK"}').status).toBe("NOT_TESTED");
  });
});
