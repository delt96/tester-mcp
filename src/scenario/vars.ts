// Run-scoped variables. Layered builtin < config `vars:` < `--var` so a chain of separate CLI
// invocations (one per scenario) can share one marker value that the config does not know about.
export const VAR_NAME_RE = /^[A-Za-z0-9_-]+$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function builtinVars(now: Date = new Date()): Record<string, string> {
  return { today: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` };
}

export function parseVarFlags(flags: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const flag of flags) {
    const eq = flag.indexOf("=");
    if (eq < 0) throw new Error(`--var ${flag}: expected key=value`);
    const name = flag.slice(0, eq);
    if (!name) throw new Error(`--var ${flag}: empty variable name`);
    if (!VAR_NAME_RE.test(name))
      throw new Error(`--var ${flag}: invalid variable name '${name}' (letters, digits, _ or - only)`);
    out[name] = flag.slice(eq + 1);
  }
  return out;
}

export function resolveRunVars(
  configVars: Record<string, string>,
  flags: string[],
  now: Date = new Date()
): Record<string, string> {
  return { ...builtinVars(now), ...configVars, ...parseVarFlags(flags) };
}
