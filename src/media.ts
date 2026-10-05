import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { globby } from "globby";

export const VIDEO_EXTENSIONS = new Set([".mp4", ".mov"]);
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

export function getMediaMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/mov";
    default:
      throw new Error(`Unsupported Gemini media format: ${filePath}`);
  }
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
