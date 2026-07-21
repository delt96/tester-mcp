import { describe, it, expect } from "vitest";
import { expandRawScenario } from "../../src/scenario/expandScenario.js";
import type { ReuseAssets } from "../../src/scenario/reuseAssets.js";

function assets(over: Partial<ReuseAssets> = {}): ReuseAssets {
  return {
    fragments: new Map([["login", {
      id: "login",
      params: { account: "tester" },
      steps: [
        { action: "navigate", url: "/" },
        { action: "fill", target: { css: "#u" }, value: "${secrets.{{account}}.username}" },
      ],
    }]]),
    selectors: { toast: { css: ".p-toast", description: "toast" } },
    ...over,
  };
}
const ctx = (vars: Record<string, string> = {}) => ({ assets: assets(), vars, source: "t.yaml" });
const nav = { action: "navigate", url: "/x" };

describe("fragment expansion", () => {
  it("expands short-form use with param defaults", () => {
    const out = expandRawScenario({ id: "s", title: "t", steps: [{ use: "login" }, nav] }, ctx());
    expect(out.steps).toHaveLength(3);
    expect(out.steps[1].value).toBe("${secrets.tester.username}");
  });
  it("expands long-form use with `with` overriding defaults", () => {
    const out = expandRawScenario({ id: "s", title: "t", steps: [{ use: "login", with: { account: "gduser" } }] }, ctx());
    expect(out.steps[1].value).toBe("${secrets.gduser.username}");
  });
  it("login_as prepends a login fragment call", () => {
    const out = expandRawScenario({ id: "s", title: "t", login_as: "gduser", steps: [nav] }, ctx());
    expect(out.steps[0]).toEqual({ action: "navigate", url: "/" });
    expect(out.steps[1].value).toBe("${secrets.gduser.username}");
    expect(out.steps[2]).toEqual(nav);
  });
  it("errors on unknown fragment / undeclared with-param / missing required param", () => {
    expect(() => expandRawScenario({ id: "s", title: "t", steps: [{ use: "nope" }] }, ctx()))
      .toThrow(/fragment 'nope' not found/);
    expect(() => expandRawScenario({ id: "s", title: "t", steps: [{ use: "login", with: { bogus: "x" } }] }, ctx()))
      .toThrow(/no param 'bogus'/);
    const a = assets();
    a.fragments.get("login")!.params = { account: null };
    expect(() => expandRawScenario({ id: "s", title: "t", steps: [{ use: "login" }] }, { assets: a, vars: {}, source: "t.yaml" }))
      .toThrow(/requires param 'account'/);
  });
  it("errors on non-string with-param value", () => {
    expect(() => expandRawScenario({ id: "s", title: "t", steps: [{ use: "login", with: { account: 123 } }] }, ctx()))
      .toThrow(/param 'account' must be a string/);
  });
  it("errors on unknown {{param}} inside fragment steps", () => {
    const a = assets();
    a.fragments.get("login")!.steps = [
      { action: "navigate", url: "/" },
      { action: "fill", target: { css: "#u" }, value: "${secrets.{{undeclared}}.username}" },
    ];
    expect(() => expandRawScenario({ id: "s", title: "t", steps: [{ use: "login" }] }, { assets: a, vars: {}, source: "t.yaml" }))
      .toThrow(/t\.yaml: steps\[0\]: fragment 'login': unknown param/);
  });
});

describe("selector refs", () => {
  it("merges alias into target with local fields winning", () => {
    const out = expandRawScenario(
      { id: "s", title: "t", steps: [{ action: "click", target: { ref: "toast", description: "local" } }] }, ctx());
    expect(out.steps[0].target).toEqual({ css: ".p-toast", description: "local" });
  });
  it("errors on unknown ref", () => {
    expect(() => expandRawScenario({ id: "s", title: "t", steps: [{ action: "click", target: { ref: "nope" } }] }, ctx()))
      .toThrow(/selector ref 'nope' not found/);
  });
});

describe("vars", () => {
  it("substitutes ${vars.*} in url and value", () => {
    const out = expandRawScenario(
      { id: "s", title: "t", steps: [{ action: "navigate", url: "${vars.doc_url}" }] }, ctx({ doc_url: "/main/d?id=1" }));
    expect(out.steps[0].url).toBe("/main/d?id=1");
  });
  it("errors on undefined var", () => {
    expect(() => expandRawScenario({ id: "s", title: "t", steps: [{ action: "navigate", url: "${vars.nope}" }] }, ctx()))
      .toThrow(/var 'nope' not defined/);
  });
});

describe("stray {{...}}", () => {
  it("errors when {{param}} appears outside a fragment", () => {
    expect(() => expandRawScenario({ id: "s", title: "t", steps: [{ action: "fill", target: { css: "#u" }, value: "{{oops}}" }] }, ctx()))
      .toThrow(/only valid inside/);
  });
});
