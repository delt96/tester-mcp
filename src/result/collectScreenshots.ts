import { basename, join } from "node:path";

export interface ScreenshotFs {
  mkdir(dir: string): void;
  copy(src: string, dest: string): void;
}

// The executor writes screenshots into its own session temp dir, whose lifetime we do not control.
// Copy them next to the run's results so "check the screenshot afterwards" actually works.
// Any copy failure keeps the original path: a path that may expire beats no evidence at all.
export function collectScreenshots(paths: string[], destDir: string, fs: ScreenshotFs): string[] {
  if (!paths.length) return [];
  try {
    fs.mkdir(destDir);
  } catch {
    return paths;
  }
  return paths.map((src) => {
    const dest = join(destDir, basename(src));
    try {
      fs.copy(src, dest);
      return dest;
    } catch {
      return src;
    }
  });
}
