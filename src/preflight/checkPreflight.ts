import type { PreflightCheck } from "../config/loadConfig.js";

export const PREFLIGHT_TIMEOUT_MS = 5_000;

export interface PreflightFailure { url: string; reason: string; }
export type PreflightFetch = (url: string) => Promise<{ status: number; text(): Promise<string> }>;

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;

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
      failures.push({ url: c.url, reason: `request failed — ${e instanceof Error ? e.message : String(e)}` });
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
