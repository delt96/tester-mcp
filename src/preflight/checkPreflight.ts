import type { PreflightCheck } from "../config/loadConfig.js";

export const PREFLIGHT_TIMEOUT_MS = 5_000;

export interface PreflightFailure { url: string; reason: string; }
export type PreflightFetch = (url: string) => Promise<{ status: number; text(): Promise<string> }>;

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;

// Node's global fetch throws a bare "fetch failed" and puts the real errno on .cause. Report both,
// or a dead port, a DNS miss and a TLS failure all read identically.
// Measured on Node 22: for a refused localhost connection the cause is an AggregateError whose OWN
// message is empty — the errno lives in .errors, one entry per resolved address. Keep every address:
// seeing ::1 and 127.0.0.1 side by side is what identifies an IPv6-only listener.
function causeText(cause: unknown): string {
  if (!(cause instanceof Error)) return cause ? String(cause) : "";
  const parts = (cause as AggregateError).errors;
  if (Array.isArray(parts) && parts.length)
    return parts.map((p: unknown) => (p instanceof Error ? p.message : String(p))).join("; ");
  return cause.message || (cause as { code?: string }).code || "";
}

function describeError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const detail = causeText((e as { cause?: unknown }).cause);
  return detail && detail !== e.message ? `${e.message} (${detail})` : e.message;
}

// One failure per check: a wrong status already explains the check, so the body is not read.
export async function checkPreflight(
  checks: PreflightCheck[],
  fetchFn: PreflightFetch
): Promise<PreflightFailure[]> {
  const failures: PreflightFailure[] = [];
  for (const c of checks) {
    let res: { status: number; text(): Promise<string> };
    try {
      res = await fetchFn(c.url);
    } catch (e) {
      failures.push({ url: c.url, reason: `request failed — ${describeError(e)}` });
      continue;
    }
    if (c.expect_status && !c.expect_status.includes(res.status)) {
      failures.push({ url: c.url, reason: `expected status ${c.expect_status.join("|")}, got ${res.status}` });
      continue;
    }
    if (c.expect_title !== undefined) {
      const title = (await res.text()).match(TITLE_RE)?.[1]?.trim() ?? "";
      if (!title.includes(c.expect_title))
        failures.push({ url: c.url, reason: `expected <title> to contain "${c.expect_title}", got "${title}"` });
    }
  }
  return failures;
}
