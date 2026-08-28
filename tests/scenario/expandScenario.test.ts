import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

describe("upload fixture resolution", () => {
  const withFixtures = (fn: (fixDir: string) => void) => {
    const root = mkdtempSync(join(tmpdir(), "upload-fix-"));
    try {
      const fixDir = join(root, "_fixtures");
      mkdirSync(fixDir);
      writeFileSync(join(fixDir, "doc.pdf"), "%PDF-1.5");
      fn(fixDir);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
  const uploadCtx = (fixturesDir?: string) => ({ assets: assets({ fixturesDir }), vars: {}, source: "s.yaml" });
  const uploadScenario = (file: string) => ({
    id: "s", title: "t",
    steps: [{ action: "upload", target: { css: "input[type=file]" }, file }],
  });

  it("resolves a bare filename against the nearest _fixtures/", () => {
    withFixtures((fixDir) => {
      const out = expandRawScenario(uploadScenario("doc.pdf"), uploadCtx(fixDir));
      expect(out.steps[0].file).toBe(join(fixDir, "doc.pdf"));
    });
  });

  it("rejects a path instead of a bare filename", () => {
    withFixtures((fixDir) => {
      expect(() => expandRawScenario(uploadScenario("sub/doc.pdf"), uploadCtx(fixDir))).toThrow(/bare filename/);
      expect(() => expandRawScenario(uploadScenario("C:\\abs\\doc.pdf"), uploadCtx(fixDir))).toThrow(/bare filename/);
    });
  });

  it("fails before the executor when the fixture does not exist", () => {
    withFixtures((fixDir) => {
      expect(() => expandRawScenario(uploadScenario("missing.pdf"), uploadCtx(fixDir))).toThrow(/fixture not found/);
    });
  });

  it("fails when there is no _fixtures/ directory at all", () => {
    expect(() => expandRawScenario(uploadScenario("doc.pdf"), uploadCtx(undefined))).toThrow(/no _fixtures\//);
  });
});

describe("var substitution scope", () => {
  it("substitutes ${vars.x} and the bare ${x} form from the same map", () => {
    const out = expandRawScenario(
      { id: "s", title: "t", steps: [{ action: "navigate", url: "${vars.doc}?m=${marker}" }] },
      ctx({ doc: "/d", marker: "M1" })
    );
    expect(out.steps[0].url).toBe("/d?m=M1");
  });
  it("substitutes inside target.text and target.description", () => {
    const out = expandRawScenario(
      { id: "s", title: "t", steps: [
        { action: "click", target: { css: "td", text: "E2E-SEED ${marker}", description: "row ${marker}" } },
      ] },
      ctx({ marker: "M1" })
    );
    expect(out.steps[0].target.text).toBe("E2E-SEED M1");
    expect(out.steps[0].target.description).toBe("row M1");
  });
  it("substitutes into a target merged from a selector ref", () => {
    const out = expandRawScenario(
      { id: "s", title: "t", steps: [{ action: "click", target: { ref: "toast", text: "${marker}" } }] },
      ctx({ marker: "M1" })
    );
    expect(out.steps[0].target).toEqual({ css: ".p-toast", description: "toast", text: "M1" });
  });
  it("leaves ${secrets.*} and other dotted forms alone", () => {
    const out = expandRawScenario(
      { id: "s", title: "t", steps: [{ action: "fill", target: { css: "#u" }, value: "${secrets.tester.username}" }] },
      ctx()
    );
    expect(out.steps[0].value).toBe("${secrets.tester.username}");
  });
  it("errors on an undefined bare var and names both sources", () => {
    expect(() => expandRawScenario(
      { id: "s", title: "t", steps: [{ action: "navigate", url: "/x?m=${nope}" }] },
      ctx()
    )).toThrow(/var 'nope' not defined.*--var/s);
  });
});
