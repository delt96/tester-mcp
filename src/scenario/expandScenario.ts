import type { ReuseAssets } from "./reuseAssets.js";

export interface ExpandContext { assets: ReuseAssets; vars: Record<string, string>; source: string; }

const PARAM_RE = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;
const VAR_RE = /\$\{vars\.([A-Za-z0-9_.-]+)\}/g;

function deepMapStrings(node: unknown, fn: (s: string) => string): unknown {
  if (typeof node === "string") return fn(node);
  if (Array.isArray(node)) return node.map((n) => deepMapStrings(n, fn));
  if (node && typeof node === "object")
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, deepMapStrings(v, fn)]));
  return node;
}

function expandUse(step: any, i: number, ctx: ExpandContext): unknown[] {
  if (typeof step.use !== "string")
    throw new Error(`${ctx.source}: steps[${i}]: 'use' must be a fragment name string`);
  const frag = ctx.assets.fragments.get(step.use);
  if (!frag)
    throw new Error(`${ctx.source}: steps[${i}]: fragment '${step.use}' not found (searched _fragments/ upward from the scenario)`);
  const withArgs = (step.with ?? {}) as Record<string, unknown>;
  if (typeof withArgs !== "object" || Array.isArray(withArgs))
    throw new Error(`${ctx.source}: steps[${i}]: 'with' must be a map`);
  for (const [k, v] of Object.entries(withArgs)) {
    if (!(k in frag.params))
      throw new Error(`${ctx.source}: steps[${i}]: fragment '${frag.id}' has no param '${k}'`);
    if (typeof v !== "string")
      throw new Error(`${ctx.source}: steps[${i}]: param '${k}' must be a string`);
  }
  const values: Record<string, string> = {};
  for (const [k, def] of Object.entries(frag.params)) {
    const v = (withArgs[k] as string | undefined) ?? def;
    if (v === null || v === undefined)
      throw new Error(`${ctx.source}: steps[${i}]: fragment '${frag.id}' requires param '${k}'`);
    values[k] = v;
  }
  return frag.steps.map((s) =>
    deepMapStrings(s, (str) =>
      str.replace(PARAM_RE, (_m, p: string) => {
        if (!(p in values))
          throw new Error(`fragment '${frag.id}': unknown param '{{${p}}}' — declare it under 'params'`);
        return values[p];
      })
    )
  );
}

function resolveRef(target: any, i: number, ctx: ExpandContext): any {
  if (!target || typeof target !== "object" || !("ref" in target)) return target;
  const { ref, ...local } = target;
  const alias = ctx.assets.selectors[ref];
  if (!alias)
    throw new Error(`${ctx.source}: steps[${i}]: selector ref '${ref}' not found in _selectors.yaml`);
  return { ...alias, ...local };
}

// Parse-time pipeline (spec §4): login_as → use/{{param}} → ref merge → ${vars.*} → stray {{}} check.
// Returns a raw object with fully expanded steps; schema validation stays in parseScenarioObject.
export function expandRawScenario(rawIn: unknown, ctx: ExpandContext): any {
  const raw = rawIn && typeof rawIn === "object" ? { ...(rawIn as any) } : rawIn;
  if (!raw || !Array.isArray(raw.steps)) return raw;
  let steps: any[] = raw.steps;
  if (typeof raw.login_as === "string")
    steps = [{ use: "login", with: { account: raw.login_as } }, ...steps];
  steps = steps.flatMap((st, i) =>
    st && typeof st === "object" && "use" in st ? expandUse(st, i, ctx) : [st]);
  steps = steps.map((st, i) =>
    st && typeof st === "object" && "target" in st ? { ...st, target: resolveRef(st.target, i, ctx) } : st);
  steps = steps.map((st, i) => {
    if (!st || typeof st !== "object") return st;
    const subst = (s: unknown) =>
      typeof s === "string"
        ? s.replace(VAR_RE, (_m, name: string) => {
            const v = ctx.vars[name];
            if (v === undefined)
              throw new Error(`${ctx.source}: steps[${i}]: var '${name}' not defined (add it to the config 'vars' section)`);
            return v;
          })
        : s;
    const out = { ...st };
    if (out.url !== undefined) out.url = subst(out.url);
    if (out.value !== undefined) out.value = subst(out.value);
    return out;
  });
  deepMapStrings(steps, (s) => {
    const m = s.match(PARAM_RE);
    if (m)
      throw new Error(`${ctx.source}: unresolved '${m[0]}' — {{param}} is only valid inside _fragments/ steps`);
    return s;
  });
  return { ...raw, steps };
}
