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

describe("parseExecutorResult (salvage from unparseable JSON)", () => {
  // Measured executor bug (seed-02, seed-05): a step index written as a range is not valid JSON,
  // so the whole envelope failed to parse and two real PASS runs were filed as NOT_TESTED.
  const broken = [
    "```json",
    '{"status": "PASS",',
    ' "evidence": ["task 13876 status=C"],',
    ' "steps": [{ "index": 35-36, "action": "click", "status": "PASS" }],',
    ' "handoff_notes": "stopped at the approval modal"}',
    "```",
  ].join("\n");

  it("keeps the verdict when only part of the envelope is malformed", () => {
    expect(parseExecutorResult(broken).status).toBe("PASS");
  });
  it("flags the salvaged result so a broken run is never filed as a clean pass", () => {
    expect(parseExecutorResult(broken).parse_repaired).toBe(true);
  });
  it("salvages evidence and handoff_notes, the fuel for fixing the scenario", () => {
    const r = parseExecutorResult(broken);
    expect(r.evidence).toEqual(["task 13876 status=C"]);
    expect(r.handoff_notes).toBe("stopped at the approval modal");
  });
  it("drops the steps array it could not parse", () => {
    expect(parseExecutorResult(broken).steps).toBeUndefined();
  });
  it("keeps the raw text alongside the salvaged verdict", () => {
    expect(parseExecutorResult(broken).raw_executor_text).toContain("35-36");
  });
  it("never promotes a per-step status when the envelope carries none", () => {
    const noEnvelope = '{"steps": [{ "index": 1-2, "action": "click", "status": "PASS" }]}';
    expect(parseExecutorResult(noEnvelope).status).toBe("NOT_TESTED");
  });
  it("leaves an unsalvageable output as a plain NOT_TESTED", () => {
    const r = parseExecutorResult("prose only, no JSON");
    expect(r.status).toBe("NOT_TESTED");
    expect(r.parse_repaired).toBeUndefined();
  });
});
