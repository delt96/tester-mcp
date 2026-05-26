import { join, dirname } from "node:path";

export interface GuideFs {
  exists(p: string): boolean;
  read(p: string): string;
}

// Walk up from startDir looking for skills/tester-mcp/document-guide.md.
// Works for dist/ (pkg root two levels up) and src/ via tsx (one level up).
export function findGuidePath(
  startDir: string,
  exists: (p: string) => boolean
): string | undefined {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "skills", "tester-mcp", "document-guide.md");
    if (exists(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function loadGuide(startDir: string, fs: GuideFs): string {
  const path = findGuidePath(startDir, fs.exists);
  if (!path) {
    throw new Error(
      "document-guide.md not found. Reinstall the package or run from the project root."
    );
  }
  return fs.read(path);
}
