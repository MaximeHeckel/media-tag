import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getUserConfigPath, loadConfiguration } from "../src/config.js";

describe("CLI configuration", () => {
  it("uses the user config when launched outside the project and preserves overrides", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "media-tag-config-test-"));
    const cwd = path.join(root, "working-directory");
    const userConfigPath = path.join(root, "user.env");
    try {
      await mkdir(cwd);
      await writeFile(userConfigPath, "GEMINI_API_KEY=user-key\nGEMINI_MODEL=user-model\n");
      const env: NodeJS.ProcessEnv = {};
      loadConfiguration({ cwd, userConfigPath, env });
      expect(env).toEqual({ GEMINI_API_KEY: "user-key", GEMINI_MODEL: "user-model" });

      await writeFile(path.join(cwd, ".env"), "GEMINI_API_KEY=local-key\n");
      const localEnv: NodeJS.ProcessEnv = {};
      loadConfiguration({ cwd, userConfigPath, env: localEnv });
      expect(localEnv).toEqual({ GEMINI_API_KEY: "local-key", GEMINI_MODEL: "user-model" });

      const shellEnv: NodeJS.ProcessEnv = { GEMINI_API_KEY: "shell-key" };
      loadConfiguration({ cwd, userConfigPath, env: shellEnv });
      expect(shellEnv.GEMINI_API_KEY).toBe("shell-key");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("supports XDG configuration directories", () => {
    expect(getUserConfigPath({ XDG_CONFIG_HOME: "/custom/config" }))
      .toBe("/custom/config/media-tag/.env");
  });
});
