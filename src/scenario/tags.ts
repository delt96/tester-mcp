export function parseTagFilter(csv?: string): string[] {
  return (csv ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// Empty filter matches everything; otherwise OR over the scenario's tags.
export function matchesTagFilter(tags: string[] | undefined, filter: string[]): boolean {
  if (filter.length === 0) return true;
  return (tags ?? []).some((t) => filter.includes(t));
}
