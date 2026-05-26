import { describe, it, expect } from "vitest";
import { captureEnv } from "../../src/env/captureEnv.js";

describe("captureEnv", () => {
  it("주입 gitSha로 commit, node/os 기록", () => {
    const env = captureEnv({ model: "haiku", frontendDir: "/front", gitSha: (d) => d === "/front" ? "abc" : undefined });
    expect(env.frontend_commit).toBe("abc");
    expect(env.runner_model).toBe("haiku");
    expect(env.node_version).toBe(process.version);
    expect(env.os).toBe(process.platform);
  });
  it("gitSha 실패해도 throw 안 함", () => {
    expect(captureEnv({ model: "haiku", gitSha: () => undefined }).frontend_commit).toBeUndefined();
  });
});
