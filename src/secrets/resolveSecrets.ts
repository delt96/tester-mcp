export interface ResolveOpts {
  secrets?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
}

// ${secrets.a.b} → secrets file (nested) first, else env SECRET_A_B; throw if missing.
export function resolveSecrets(value: string, opts: ResolveOpts = {}): string {
  const env = opts.env ?? process.env;
  return value.replace(/\$\{secrets\.([\w.]+)\}/g, (_m, path: string) => {
    const fromFile = path
      .split(".")
      .reduce<any>((o, k) => (o == null ? undefined : o[k]), opts.secrets);
    if (typeof fromFile === "string") return fromFile;
    const key = "SECRET_" + path.replace(/\./g, "_").toUpperCase();
    const v = env[key];
    if (v === undefined)
      throw new Error(`missing secret: ${path} (set ${path} in tester-mcp.secrets.yaml, or env ${key})`);
    return String(v);
  });
}
