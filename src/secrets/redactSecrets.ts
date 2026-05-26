// Deterministic redaction of secret values from a result object before it is
// written/printed. The CLI knows the resolved secret values (from the secrets file
// and/or env SECRET_*), so we scrub them regardless of what the executor echoed.
// Defense-in-depth alongside the system-prompt instruction not to echo secrets.

function leafStrings(obj: unknown, out: string[]): void {
  if (typeof obj === "string") {
    out.push(obj);
  } else if (Array.isArray(obj)) {
    for (const v of obj) leafStrings(v, out);
  } else if (obj && typeof obj === "object") {
    for (const v of Object.values(obj as Record<string, unknown>)) leafStrings(v, out);
  }
}

export function collectSecretValues(
  opts: { secrets?: Record<string, unknown>; env?: Record<string, string | undefined> } = {}
): string[] {
  const env = opts.env ?? {};
  const values: string[] = [];
  // All string leaf values from the secrets object (recurse).
  leafStrings(opts.secrets, values);
  // Plus all env values whose key starts with SECRET_.
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith("SECRET_") && typeof v === "string") values.push(v);
  }
  // Guard against over-redaction: only scrub values long enough to be real secrets; dedupe.
  return [...new Set(values.filter((v) => v.length >= 4))];
}

export function redactSecrets<T>(obj: T, secretValues: string[]): T {
  if (secretValues.length === 0) return obj;
  let json = JSON.stringify(obj);
  for (const s of secretValues) {
    json = json.split(s).join("***");
  }
  return JSON.parse(json) as T;
}
