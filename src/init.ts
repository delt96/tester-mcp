import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";

// ── PURE testable helpers ────────────────────────────────────────────────

export function renderConfigYaml(o: { frontend: string; backend?: string; model: string }): string {
  const lines = ["targets:", `  frontend: ${o.frontend}`];
  if (o.backend) lines.push(`  backend: ${o.backend}`);
  lines.push("runner:", `  model: ${o.model}`);
  return lines.join("\n") + "\n";
}

export function skillsDirFor(
  scope: "global" | "project",
  projectPath: string,
  home: string
): string {
  return scope === "global"
    ? join(home, ".claude", "skills")
    : join(projectPath, ".claude", "skills");
}

export function secretsExampleYaml(): string {
  return ["tester:", '  username: "YOUR_ID"', '  password: "YOUR_PASSWORD"', ""].join("\n");
}

// ── thin glue (not unit-tested) ──────────────────────────────────────────

// Locate the bundled skill by walking up from the running file looking for a
// directory containing skills/tester-mcp/SKILL.md. Works for dist/ (pkgRoot two
// levels up) and src/ via tsx (pkgRoot one level up).
export function findBundledSkill(startDir: string): string | undefined {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "skills", "tester-mcp", "SKILL.md");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export interface InitOptions {
  global?: boolean;
  project?: string | boolean;
  frontend?: string;
  backend?: string;
  model?: string;
  yes?: boolean;
}

export async function runInit(opts: InitOptions): Promise<void> {
  const nonInteractive = !!opts.yes;

  let scope: "global" | "project";
  let projectPath = typeof opts.project === "string" ? opts.project : process.cwd();
  let frontend = opts.frontend;
  let backend = opts.backend;
  let model = opts.model;

  // Determine scope from flags.
  if (opts.global) scope = "global";
  else if (opts.project !== undefined) scope = "project";
  else scope = nonInteractive ? "project" : "project"; // default project; may be overridden interactively

  if (!nonInteractive) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!opts.global && opts.project === undefined) {
        const ans = (await rl.question("스킬 설치 범위 [project/global] (project): ")).trim();
        if (ans === "global") scope = "global";
      }
      if (scope === "project" && typeof opts.project !== "string") {
        const ans = (await rl.question(`프로젝트 경로 (${projectPath}): `)).trim();
        if (ans) projectPath = ans;
      }
      if (frontend === undefined) {
        const ans = (await rl.question("frontend URL (http://localhost:5173): ")).trim();
        frontend = ans || "http://localhost:5173";
      }
      if (backend === undefined) {
        const ans = (await rl.question("backend URL (선택, 비우면 생략): ")).trim();
        backend = ans || undefined;
      }
      if (model === undefined) {
        const ans = (await rl.question("model (haiku): ")).trim();
        model = ans || "haiku";
      }
    } finally {
      rl.close();
    }
  }

  // Apply defaults for non-interactive / unfilled values.
  frontend = frontend || "http://localhost:5173";
  model = model || "haiku";

  const home = homedir();
  const cwd = process.cwd();
  const configDir = scope === "project" ? projectPath : cwd;

  // 1) Copy bundled skill.
  const here = dirname(fileURLToPath(import.meta.url));
  const bundled = findBundledSkill(here);
  const skillsDir = skillsDirFor(scope, projectPath, home);
  const destSkill = join(skillsDir, "tester-mcp", "SKILL.md");
  if (bundled) {
    mkdirSync(dirname(destSkill), { recursive: true });
    writeFileSync(destSkill, readFileSync(bundled, "utf8"), "utf8");
    console.log(`스킬 복사: ${destSkill}`);
  } else {
    console.warn("경고: 번들 스킬(skills/tester-mcp/SKILL.md)을 찾지 못했습니다. 스킬 복사를 건너뜁니다.");
  }

  // 2) Write config.
  const configPath = join(configDir, "tester-mcp.config.yaml");
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, renderConfigYaml({ frontend, backend, model }), "utf8");
  console.log(`설정 작성: ${configPath}`);

  // 3) Scaffold secrets example + ensure .gitignore.
  const examplePath = join(cwd, "tester-mcp.secrets.example.yaml");
  writeFileSync(examplePath, secretsExampleYaml(), "utf8");
  console.log(`시크릿 예시 작성: ${examplePath}`);

  const gitignorePath = join(cwd, ".gitignore");
  const entry = "tester-mcp.secrets.yaml";
  let gi = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  if (!gi.split(/\r?\n/).some((l) => l.trim() === entry)) {
    if (gi.length && !gi.endsWith("\n")) gi += "\n";
    gi += entry + "\n";
    writeFileSync(gitignorePath, gi, "utf8");
    console.log(`.gitignore 갱신: ${entry} 추가`);
  }

  // 4) Next steps.
  console.log("\n다음 단계:");
  console.log(`  1) cp tester-mcp.secrets.example.yaml tester-mcp.secrets.yaml`);
  console.log(`     → 테스트 계정(username/password)을 채우세요. (이 파일은 gitignore됨)`);
  console.log(`  2) 시나리오 작성 후 실행:`);
  console.log(`     tester-mcp run scenarios/<area>/<id>.yaml -c ${join(configDir, "tester-mcp.config.yaml")}`);
}
