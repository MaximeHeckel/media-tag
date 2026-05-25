import path from "node:path";
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "./media.js";
import { runCommand } from "./process.js";

export type EmbedMetadataOptions = {
  reindex?: boolean;
  verbose?: boolean;
};

export type CleanMetadataOptions = {
  reindex?: boolean;
  verbose?: boolean;
};

export function buildExiftoolArgs(filePath: string, keywords: string[]): string[] {
  const ext = path.extname(filePath).toLowerCase();
  const keywordString = keywords.join(", ");
  const args = ["-overwrite_original"];

  if (VIDEO_EXTENSIONS.has(ext)) {
    args.push(`-Keys:Description=${keywordString}`);
    args.push(`-XMP:Description=${keywordString}`);
  } else if (IMAGE_EXTENSIONS.has(ext)) {
    args.push("-sep", ", ");
    args.push(`-IPTC:Keywords=${keywordString}`);
    args.push(`-XMP:Subject=${keywordString}`);
  } else {
    throw new Error(`Unsupported file extension: ${ext}`);
  }

  args.push(filePath);
  return args;
}

export function buildCleanMetadataArgs(filePath: string): string[] {
  const ext = path.extname(filePath).toLowerCase();
  const args = ["-overwrite_original"];

  if (VIDEO_EXTENSIONS.has(ext)) {
    args.push("-Keys:Description=");
    args.push("-XMP:Description=");
  } else if (IMAGE_EXTENSIONS.has(ext)) {
    args.push("-IPTC:Keywords=");
    args.push("-XMP:Subject=");
  } else {
    throw new Error(`Unsupported file extension: ${ext}`);
  }

  args.push(filePath);
  return args;
}

export async function embedMetadata(
  filePath: string,
  keywords: string[],
  options: EmbedMetadataOptions = {},
): Promise<void> {
  await runCommand("exiftool", buildExiftoolArgs(filePath, keywords), {
    verbose: options.verbose,
  });

  if (options.reindex !== false && process.platform === "darwin") {
    await runCommand("mdimport", [filePath], { verbose: options.verbose });
  }
}

export async function cleanMetadata(
  filePath: string,
  options: CleanMetadataOptions = {},
): Promise<void> {
  await runCommand("exiftool", buildCleanMetadataArgs(filePath), {
    verbose: options.verbose,
  });

  if (options.reindex !== false && process.platform === "darwin") {
    await runCommand("mdimport", [filePath], { verbose: options.verbose });
  }
}
