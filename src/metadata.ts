import path from "node:path";
import { z } from "zod";
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

export type InspectMetadataOptions = {
  keywords?: boolean;
  verbose?: boolean;
};

export type MetadataRow = {
  Group: string;
  Field: string;
  Value: string;
};

export function hasKeywordMetadata(filePath: string, rows: MetadataRow[]): boolean {
  const fields = VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase())
    ? new Set(["Keys:Description", "XMP-dc:Description"])
    : new Set(["IPTC:Keywords", "XMP-dc:Subject"]);

  return rows.some((row) => {
    // Family 4 adds instance identifiers for duplicate fields.
    const relevant = row.Group.split(":").some((group) => fields.has(`${group}:${row.Field}`));
    return relevant && row.Value !== "—" && row.Value.replace(/[,\s]/g, "").length > 0;
  });
}

export function buildInspectMetadataArgs(
  filePath: string,
  options: InspectMetadataOptions = {},
): string[] {
  const ext = path.extname(filePath).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext) && !IMAGE_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file extension: ${ext}`);
  }

  // Group and instance identifiers keep identically named tags distinct in JSON.
  const args = ["-json", "-G1:4", "-s"];
  if (options.keywords) {
    args.push(...(VIDEO_EXTENSIONS.has(ext)
      ? ["-Keys:Description", "-XMP:Description"]
      : ["-IPTC:Keywords", "-XMP:Subject"]));
  }
  args.push(filePath);
  return args;
}

export async function inspectMetadata(
  filePath: string,
  options: InspectMetadataOptions = {},
): Promise<MetadataRow[]> {
  const { stdout } = await runCommand(
    "exiftool", buildInspectMetadataArgs(filePath, options), { verbose: options.verbose },
  );
  return parseMetadataRows(stdout);
}

export function parseMetadataRows(exiftoolJson: string): MetadataRow[] {
  const [metadata] = z.array(z.record(z.string(), z.unknown())).length(1)
    .parse(JSON.parse(exiftoolJson));
  const rows: MetadataRow[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (key === "SourceFile") {
      continue;
    }
    const separator = key.lastIndexOf(":");
    const field = separator < 0 ? key : key.slice(separator + 1);
    if (field === "Error") {
      throw new Error(String(value));
    }
    rows.push({
      Group: separator < 0 ? "—" : key.slice(0, separator),
      Field: field,
      Value: formatMetadataValue(value),
    });
  }
  return rows.sort((a, b) => a.Group.localeCompare(b.Group) || a.Field.localeCompare(b.Field));
}

function formatMetadataValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(formatMetadataValue).join(", ");
  }
  if (value !== null && typeof value === "object") {
    return JSON.stringify(value);
  }
  return value === null ? "—" : String(value);
}
