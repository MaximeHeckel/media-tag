import { checkCancellation } from "./cancellation.js";
import path from "node:path";
import pLimit from "p-limit";
import { z } from "zod";
import { VIDEO_EXTENSIONS } from "./media.js";
import {
  buildInspectMetadataArgs,
  parseMetadataRecord,
  type InspectMetadataOptions,
  type MetadataRow,
} from "./metadata.js";
import { runCommand } from "./process.js";

export type InspectionResult = {
  path: string;
  rows?: MetadataRow[];
  error?: Error;
};

export async function inspectMetadataBatch(
  filePaths: string[],
  options: InspectMetadataOptions = {},
): Promise<InspectionResult[]> {
  const batches: string[][] = [];
  // Separate media kinds so each keyword query reads only its relevant fields.
  for (const video of [false, true]) {
    let batch: string[] = [];
    let argumentLength = 0;
    for (const filePath of filePaths) {
      if (VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase()) !== video) {
        continue;
      }
      const length = Buffer.byteLength(filePath) + 1;
      // Full metadata can be much larger than keyword metadata.
      if (batch.length && (batch.length >= (options.keywords ? 100 : 25)
        || argumentLength + length > 32_000)) {
        batches.push(batch);
        batch = [];
        argumentLength = 0;
      }
      batch.push(filePath);
      argumentLength += length;
    }
    if (batch.length) {
      batches.push(batch);
    }
  }

  const limit = pLimit(3);
  const results = await Promise.all(batches.map((batch) => limit(async () => {
    checkCancellation();
    try {
      const args = buildInspectMetadataArgs(batch[0], options);
      args.pop();
      args.push(...batch);
      const { stdout } = await runCommand("exiftool", args, {
        verbose: options.verbose,
        // A failed file sets exit code 1 even when other files returned valid JSON.
        acceptedExitCodes: [1],
      });
      checkCancellation();
      return parseInspectionResults(stdout, batch);
    } catch (error) {
      checkCancellation();
      return batch.map((filePath) => ({
        path: filePath,
        error: error instanceof Error ? error : new Error(String(error)),
      }));
    }
  })));

  const byPath = new Map(results.flat().map((result) => [result.path, result]));
  return filePaths.map((filePath) => byPath.get(filePath)!);
}

export function parseInspectionResults(
  exiftoolJson: string,
  filePaths: string[],
): InspectionResult[] {
  const records = z.array(z.record(z.string(), z.unknown())).parse(JSON.parse(exiftoolJson));
  const byPath = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    if (typeof record.SourceFile === "string") {
      byPath.set(path.resolve(record.SourceFile), record);
    }
  }
  return filePaths.map((filePath) => {
    try {
      const record = byPath.get(path.resolve(filePath));
      if (!record) {
        throw new Error("ExifTool returned no metadata result for this file.");
      }
      return { path: filePath, rows: parseMetadataRecord(record) };
    } catch (error) {
      return { path: filePath, error: error instanceof Error ? error : new Error(String(error)) };
    }
  });
}
