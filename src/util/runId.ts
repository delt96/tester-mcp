export function makeRunId(now: Date = new Date()): string {
  return now.toISOString().replace(/\..+$/, "").replace(/:/g, "-");
}
