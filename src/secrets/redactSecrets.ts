// Deterministic redaction of secret values from a result object before it is
// written/printed. The CLI knows the resolved secret values (from BESTIAN_SECRET_*),
// so we scrub them regardless of what the executor echoed. Defense-in-depth alongside
// the system-prompt instruction not to echo secrets.

export function collectSecretValues(env: Record<string, string | undefined> = process.env): string[] {
  return Object.entries(env)
    .filter(([k, v]) => k.startsWith("BESTIAN_SECRET_") && typeof v === "string")
    .map(([, v]) => v as string)
    // Guard against over-redaction: only scrub values long enough to be real secrets.
    .filter((v) => v.length >= 4);
}

export function redactSecrets<T>(obj: T, secretValues: string[]): T {
  if (secretValues.length === 0) return obj;
  let json = JSON.stringify(obj);
  for (const s of secretValues) {
    json = json.split(s).join("***");
  }
  return JSON.parse(json) as T;
}
