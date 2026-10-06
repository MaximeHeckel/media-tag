import { execFile } from "node:child_process";
import { cancellationSignal } from "./cancellation.js";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export type RunCommandOptions = {
  verbose?: boolean;
  signal?: AbortSignal;
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
  const signal = options.signal ?? cancellationSignal;
  signal.throwIfAborted();
  if (options.verbose) {
    console.error([command, ...args.map((arg) => JSON.stringify(arg))].join(" "));
  }

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      signal,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10,
    });

    signal.throwIfAborted();
    return { stdout, stderr };
  } catch (error) {
    signal.throwIfAborted();
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
    cancellationSignal.throwIfAborted();
    throw new Error(
      `Required command "${command}" was not found. Install it and ensure it is available on PATH.`,
    );
  }
}
