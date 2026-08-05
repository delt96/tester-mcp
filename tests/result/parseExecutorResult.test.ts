import { describe, it, expect } from "vitest";
import { parseExecutorResult } from "../../src/result/parseExecutorResult.js";

describe("parseExecutorResult (lenient)", () => {
  it("extracts JSON from inside a code fence", () => {
    const t = 'prose\n```json\n{"status":"PASS","evidence":["#v_header visible"]}\n```';
    const r = parseExecutorResult(t);
    expect(r.status).toBe("PASS");
    expect(r.evidence).toEqual(["#v_header visible"]);
  });
  it("parses bare JSON too", () => {
    expect(parseExecutorResult('{"status":"FAIL"}').status).toBe("FAIL");
  });
  it("falls back to NOT_TESTED and keeps the raw text when parsing fails", () => {
    const r = parseExecutorResult("prose only, no JSON");
    expect(r.status).toBe("NOT_TESTED");
    expect(r.raw_executor_text).toContain("prose only");
  });
  it("demotes to NOT_TESTED when status is not one of the four labels", () => {
    expect(parseExecutorResult('{"status":"OK"}').status).toBe("NOT_TESTED");
  });
});
