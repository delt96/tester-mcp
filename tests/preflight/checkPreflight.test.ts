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

  // Node's global fetch throws a bare "fetch failed" and hides the real errno on .cause. Without
  // unwrapping it the operator cannot tell a dead port from a DNS miss or a TLS failure.
  it("unwraps the cause so the real errno is visible, not just 'fetch failed'", async () => {
    const wrapped: PreflightFetch = async () => {
      throw new Error("fetch failed", { cause: new Error("connect ECONNREFUSED ::1:59999") });
    };
    const f = await checkPreflight([{ url: "http://dead" }], wrapped);
    expect(f[0].reason).toContain("ECONNREFUSED");
  });

  // Measured shape on Node 22 for a refused localhost connection: cause is an AggregateError whose
  // own message is EMPTY — the per-address errors carry the errno, and they name both the IPv6 and
  // the IPv4 attempt. That address list is the evidence for a port-squatting diagnosis, so keep it.
  it("unwraps an AggregateError cause, whose own message is empty", async () => {
    const agg = new AggregateError(
      [new Error("connect ECONNREFUSED ::1:59999"), new Error("connect ECONNREFUSED 127.0.0.1:59999")],
      ""
    );
    const wrapped: PreflightFetch = async () => { throw new Error("fetch failed", { cause: agg }); };
    const f = await checkPreflight([{ url: "http://dead" }], wrapped);
    expect(f[0].reason).toContain("ECONNREFUSED");
    expect(f[0].reason).toContain("::1:59999");
    expect(f[0].reason).toContain("127.0.0.1:59999");
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
