import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface PreviousRunFs { listDirs(dir: string): string[]; readSummary(path: string): string | undefined; }

const realFs: PreviousRunFs = {
  listDirs: (dir) => readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name),
  readSummary: (p) => { try { return readFileSync(p, "utf8"); } catch { return undefined; } },
};

// Run ids are ISO timestamps, so a lexical sort is chronological.
export function readPreviousClaudeCodeVersion(outDir: string, currentRunId: string, fs: PreviousRunFs = realFs): string | undefined {
  let dirs: string[];
  try { dirs = fs.listDirs(outDir); } catch { return undefined; }
  for (const d of dirs.filter((x) => x !== currentRunId).sort().reverse()) {
    const raw = fs.readSummary(join(outDir, d, "summary.json"));
    if (!raw) continue;
    try {
      const v = (JSON.parse(raw) as { claude_code_version?: unknown }).claude_code_version;
      if (typeof v === "string") return v;
    } catch { /* not a summary */ }
  }
  return undefined;
}
