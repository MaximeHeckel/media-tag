import os from "node:os";
import path from "node:path";
import { config } from "dotenv";

export function getUserConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const configHome = env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, "media-tag", ".env");
}

export function loadConfiguration(options: {
  cwd?: string;
  userConfigPath?: string;
  env?: NodeJS.ProcessEnv;
} = {}): void {
  const env = options.env ?? process.env;
  // Existing environment wins, followed by local overrides, then user defaults.
  config({
    path: [
      path.join(options.cwd ?? process.cwd(), ".env"),
      options.userConfigPath ?? getUserConfigPath(env),
    ],
    processEnv: env,
    override: false,
    quiet: true,
  });
}
