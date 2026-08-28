import { describe, it, expect } from "vitest";
import { builtinVars, parseVarFlags, resolveRunVars } from "../../src/scenario/vars.js";

describe("builtinVars", () => {
  it("provides today as YYYYMMDD, zero-padded", () => {
    expect(builtinVars(new Date(2026, 7, 3))).toEqual({ today: "20260803" });
  });
});

describe("parseVarFlags", () => {
  it("parses repeated key=value flags", () => {
    expect(parseVarFlags(["marker=20260828-2", "phase=lgreview"]))
      .toEqual({ marker: "20260828-2", phase: "lgreview" });
  });
  it("keeps '=' inside the value", () => {
    expect(parseVarFlags(["q=a=b"])).toEqual({ q: "a=b" });
  });
  it("accepts an empty value", () => {
    expect(parseVarFlags(["marker="])).toEqual({ marker: "" });
  });
  it("rejects a flag without '=' or with an empty/invalid name", () => {
    expect(() => parseVarFlags(["marker"])).toThrow(/--var marker: expected key=value/);
    expect(() => parseVarFlags(["=x"])).toThrow(/empty variable name/);
    expect(() => parseVarFlags(["a b=x"])).toThrow(/invalid variable name/);
  });
});

describe("resolveRunVars", () => {
  const now = new Date(2026, 7, 28);
  it("layers builtin < config < --var", () => {
    const vars = resolveRunVars({ doc_url: "/d", today: "cfg" }, ["today=cli", "marker=m"], now);
    expect(vars).toEqual({ today: "cli", doc_url: "/d", marker: "m" });
  });
  it("exposes builtin today when nothing overrides it", () => {
    expect(resolveRunVars({}, [], now).today).toBe("20260828");
  });
});
