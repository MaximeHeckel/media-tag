import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export type RunCommandOptions = {
  verbose?: boolean;
  acceptedExitCodes?: number[];
};

export class CommandError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly args: string[],
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {},
): Promise<CommandResult> {
  if (options.verbose) {
    console.error([command, ...args.map((arg) => JSON.stringify(arg))].join(" "));
  }

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10,
    });

    return { stdout, stderr };
  } catch (error) {
    const err = error as Error & { code?: string | number; stdout?: string; stderr?: string };
    if (typeof err.code === "number" && options.acceptedExitCodes?.includes(err.code)) {
      return { stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
    }
    const stderr = typeof err.stderr === "string" ? err.stderr.trim() : undefined;
    throw new CommandError(
      stderr || err.message || `Command failed: ${command}`,
      command,
      args,
      stderr,
    );
  }
}

export async function assertCommandAvailable(command: string): Promise<void> {
  try {
    await runCommand("which", [command]);
  } catch {
    throw new Error(
      `Required command "${command}" was not found. Install it and ensure it is available on PATH.`,
    );
  }
}
