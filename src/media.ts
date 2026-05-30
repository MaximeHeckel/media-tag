import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { globby } from "globby";
import { z } from "zod";
import { runCommand } from "./process.js";

export const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv"]);
export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
export const SUPPORTED_EXTENSIONS = new Set([
  ...VIDEO_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
]);

export type MediaKind = "video" | "image";

export type MediaAsset = {
  path: string;
  kind: MediaKind;
};

export type ExtractedFrames = {
  framePaths: string[];
  tempDir: string;
};

const AudioStreamProbeSchema = z.object({
  streams: z.array(z.unknown()).default([]),
});

export function getMediaKind(filePath: string): MediaKind | undefined {
  const ext = path.extname(filePath).toLowerCase();

  if (VIDEO_EXTENSIONS.has(ext)) {
    return "video";
  }

  if (IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }

  return undefined;
}

export function isSupportedMediaFile(filePath: string): boolean {
  return getMediaKind(filePath) !== undefined;
}

export function calculateFrameTimestamps(durationSeconds: number): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`Invalid video duration: ${durationSeconds}`);
  }

  return [0.25, 0.5, 0.75].map((ratio) => durationSeconds * ratio);
}

export async function resolveInputAssets(inputs: string[]): Promise<MediaAsset[]> {
  const matches = new Set<string>();

  for (const rawInput of inputs) {
    const expandedInput = expandHome(rawInput);
    const absoluteInput = path.resolve(expandedInput);

    try {
      const inputStat = await stat(absoluteInput);

      if (inputStat.isDirectory()) {
        const files = await globby("**/*", {
          cwd: absoluteInput,
          absolute: true,
          onlyFiles: true,
        });

        for (const file of files) {
          if (isSupportedMediaFile(file)) {
            matches.add(path.resolve(file));
          }
        }
        continue;
      }

      if (inputStat.isFile() && isSupportedMediaFile(absoluteInput)) {
        matches.add(absoluteInput);
      }
      continue;
    } catch {
      // Non-existent paths may still be glob patterns; let globby resolve them below.
    }

    const globMatches = await globby(expandedInput, {
      absolute: true,
      expandDirectories: false,
      onlyFiles: true,
    });

    for (const file of globMatches) {
      if (isSupportedMediaFile(file)) {
        matches.add(path.resolve(file));
      }
    }
  }

  return [...matches].sort().map((filePath) => {
    const kind = getMediaKind(filePath);
    if (!kind) {
      throw new Error(`Unsupported file extension: ${filePath}`);
    }

    return { path: filePath, kind };
  });
}

export async function getVideoDurationSeconds(
  filePath: string,
  verbose = false,
): Promise<number> {
  const { stdout } = await runCommand(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { verbose },
  );

  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Unable to read video duration for ${filePath}`);
  }

  return duration;
}

export async function videoHasAudioStream(
  filePath: string,
  verbose = false,
): Promise<boolean> {
  const { stdout } = await runCommand(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=index",
      "-of",
      "json",
      filePath,
    ],
    { verbose },
  );

  return parseVideoHasAudioStream(stdout);
}

export function parseVideoHasAudioStream(ffprobeJson: string): boolean {
  const parsed = AudioStreamProbeSchema.parse(JSON.parse(ffprobeJson));
  return parsed.streams.length > 0;
}

export async function extractVideoFrames(
  filePath: string,
  verbose = false,
): Promise<ExtractedFrames> {
  const duration = await getVideoDurationSeconds(filePath, verbose);
  const timestamps = calculateFrameTimestamps(duration);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "media-tagger-"));
  await mkdir(tempDir, { recursive: true });

  try {
    const framePaths: string[] = [];
    for (const [index, timestamp] of timestamps.entries()) {
      const outputPath = path.join(tempDir, `frame-${index + 1}.jpg`);
      await runCommand(
        "ffmpeg",
        [
          "-ss",
          formatTimestamp(timestamp),
          "-i",
          filePath,
          "-vframes",
          "1",
          "-q:v",
          "2",
          outputPath,
          "-y",
        ],
        { verbose },
      );
      framePaths.push(outputPath);
    }

    return { framePaths, tempDir };
  } catch (error) {
    await removeExtractedFrames(tempDir);
    throw error;
  }
}

export async function removeExtractedFrames(tempDir: string): Promise<void> {
  await rm(tempDir, { recursive: true, force: true });
}

function expandHome(input: string): string {
  if (input === "~") {
    return os.homedir();
  }

  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }

  return input;
}

function formatTimestamp(seconds: number): string {
  return seconds.toFixed(3);
}
