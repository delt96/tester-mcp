export function resolveSecrets(
  value: string,
  env: Record<string, string | undefined> = process.env
): string {
  return value.replace(/\$\{secrets\.([\w.]+)\}/g, (_m, path: string) => {
    const key = "BESTIAN_SECRET_" + path.replace(/\./g, "_").toUpperCase();
    const v = env[key];
    if (v === undefined) throw new Error(`시크릿 누락: ${key} (시나리오의 \${secrets.${path}})`);
    return v;
  });
}
