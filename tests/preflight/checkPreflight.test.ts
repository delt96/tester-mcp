import { describe, it, expect } from "vitest";
import { checkPreflight, type PreflightFetch } from "../../src/preflight/checkPreflight.js";

const ok = (status: number, body = ""): PreflightFetch =>
  async () => ({ status, text: async () => body });

describe("checkPreflight", () => {
  it("passes when the title matches and the status is allowed", async () => {
    const f = await checkPreflight(
      [{ url: "http://x", expect_title: "eBill", expect_status: [200] }],
      ok(200, "<html><head><title>eBill KG</title></head></html>")
    );
    expect(f).toEqual([]);
  });

  // The real failure: law_alarm's dev server held IPv6 [::1]:5173, so the port answered 200 with a
  // different app and the executor reported a bogus "login failed". A status check alone passes it.
  it("catches another app squatting the port, which a status check alone would pass", async () => {
    const f = await checkPreflight(
      [{ url: "http://localhost:5173", expect_title: "eBill" }],
      ok(200, "<title>건축법규 자동검토</title>")
    );
    expect(f).toHaveLength(1);
    expect(f[0].reason).toContain("eBill");
    expect(f[0].reason).toContain("건축법규 자동검토");
  });

  it("reports a status outside the allowed list", async () => {
    const f = await checkPreflight([{ url: "http://x", expect_status: [200, 401] }], ok(503));
    expect(f[0].reason).toMatch(/expected status 200\|401, got 503/);
  });

  it("treats a connection failure as a failure, not a crash", async () => {
    const boom: PreflightFetch = async () => { throw new Error("ECONNREFUSED"); };
    const f = await checkPreflight([{ url: "http://dead" }], boom);
    expect(f[0].reason).toContain("ECONNREFUSED");
  });

  it("checks only connectivity when no expectation is declared", async () => {
    expect(await checkPreflight([{ url: "http://x" }], ok(404))).toEqual([]);
  });

  it("does not report a title mismatch on top of a status failure", async () => {
    const f = await checkPreflight(
      [{ url: "http://x", expect_status: [200], expect_title: "eBill" }],
      ok(500, "<title>Error</title>")
    );
    expect(f).toHaveLength(1);
    expect(f[0].reason).toMatch(/status/);
  });

  it("reports every failing check, not just the first", async () => {
    const f = await checkPreflight(
      [{ url: "http://a", expect_status: [200] }, { url: "http://b", expect_status: [200] }],
      ok(500)
    );
    expect(f).toHaveLength(2);
  });

  it("reports an empty observed title when the page has no title tag", async () => {
    const f = await checkPreflight([{ url: "http://x", expect_title: "eBill" }], ok(200, "<html></html>"));
    expect(f[0].reason).toContain('got ""');
  });
});
