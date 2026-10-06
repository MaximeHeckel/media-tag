#!/usr/bin/env node

import { getUserConfigPath, loadConfiguration } from "./config.js";
import packageInfo from "../package.json" with { type: "json" };
import path from "node:path";
import { Command, InvalidArgumentError } from "commander";
import ora, { type Ora, type Options as SpinnerOptions } from "ora";
import { cancellation, checkCancellation } from "./cancellation.js";
import pLimit from "p-limit";
import pc from "picocolors";
import { inferKeywordsFromMedia } from "./ai.js";
import {
  type MediaAsset,
  resolveInputAssets,
} from "./media.js";
import { cleanMetadata, embedMetadata, inspectMetadata, hasKeywordMetadata, type InspectMetadataOptions } from "./metadata.js";
import { assertCommandAvailable } from "./process.js";
import { renderInspectionTable, type AssetInspectionRow } from "./table.js";
import { inspectMetadataBatch } from "./inspection.js";

loadConfiguration();

type IndexOptions = {
  concurrency: number;
  skipExisting: boolean;
  model?: string;
  dryRun: boolean;
  reindex: boolean;
  verbose: boolean;
};

type CleanOptions = {
  concurrency: number;
  dryRun: boolean;
  reindex: boolean;
  verbose: boolean;
};

type ProcessResult = {
  asset: MediaAsset;
  skipped?: boolean;
  keywords?: string[];
  error?: Error;
};

const program = new Command();

program
  .name(packageInfo.name)
  .description(packageInfo.description)
  .version(packageInfo.version)
  .addHelpText("beforeAll", `${packageInfo.name} v${packageInfo.version}\n`)
  .showHelpAfterError()
  .showSuggestionAfterError();

program
  .command("index")
  .description("Generate AI keywords and write them to media metadata.")
  .argument("<inputs...>", "files, directories, or glob patterns to process")
  .option("-c, --concurrency <n>", "maximum active workers", parseConcurrency, 3)
  .option("--model <model>", "Gemini model to use", process.env.GEMINI_MODEL)
  .option("--skip-existing", "skip assets with non-empty keyword metadata", false)
  .option("--dry-run", "print keywords without writing metadata", false)
  .option("--no-reindex", "skip macOS Spotlight reindexing")
  .option("--verbose", "print external command details", false)
  .action(async (inputs: string[], options: IndexOptions) => {
    try {
      await runIndex(inputs, options);
    } catch (error) {
      handleFatalError(error);
    }
  });

program
  .command("clean")
  .description("Remove metadata fields written by the index command.")
  .argument("<inputs...>", "files, directories, or glob patterns to clean")
  .option("-c, --concurrency <n>", "maximum active workers", parseConcurrency, 3)
  .option("--dry-run", "print files that would be cleaned without writing metadata", false)
  .option("--no-reindex", "skip macOS Spotlight reindexing")
  .option("--verbose", "print external command details", false)
  .action(async (inputs: string[], options: CleanOptions) => {
    try {
      await runClean(inputs, options);
    } catch (error) {
      handleFatalError(error);
    }
  });

program
  .command("inspect")
  .description("View image and video keyword metadata in an asset table.")
  .argument("<inputs...>", "files, directories, or glob patterns to inspect")
  .option("--keywords", "show generated keyword fields (the default)", false)
  .option("--all", "show all metadata in a separate table for each asset", false)
  .option("--verbose", "print external command details", false)
  .action(async (inputs: string[], options: InspectMetadataOptions & { all: boolean }) => {
    try {
      await runInspect(inputs, options);
    } catch (error) {
      handleFatalError(error);
    }
  });

const spinners = new Set<Ora>();
function createSpinner(options: string | SpinnerOptions): Ora {
  const spinner = ora({
    ...(typeof options === "string" ? { text: options } : options),
    // Keep normal terminal signal handling instead of consuming stdin in raw mode.
    discardStdin: false,
  });
  spinners.add(spinner);
  return spinner;
}

function cancel(): void {
  if (cancellation.signal.aborted) {
    process.exit(130);
  }
  cancellation.abort(new Error("Cancelled."));
  for (const spinner of spinners) spinner.stop();
  console.error(pc.yellow("Cancelled."));
  process.exitCode = 130;
  // Bound shutdown even if a dependency does not honor its abort signal.
  setTimeout(() => process.exit(130), 3000);
}

process.on("SIGINT", cancel);
try {
  await program.parseAsync();
} finally {
  for (const spinner of spinners) spinner.stop();
  if (cancellation.signal.aborted) {
    // SDK connections or stdin handles may survive aborted work. Exit explicitly
    // once the command has unwound so the terminal receives control again.
    process.exit(130);
  }
  process.off("SIGINT", cancel);
}

async function runIndex(inputs: string[], options: IndexOptions): Promise<void> {
  const discoverySpinner = createSpinner("Resolving media inputs").start();
  const assets = await resolveInputAssets(inputs);
  checkCancellation();
  discoverySpinner.succeed(`Resolved ${assets.length} supported asset(s)`);

  if (assets.length === 0) {
    console.log(pc.yellow("No supported media files found."));
    return;
  }

  await preflightIndex(options);

  const results = await processBatch(assets, options, "Indexing", (asset) =>
    indexAsset(asset, options),
  );

  reportResults(results);
}

async function runClean(inputs: string[], options: CleanOptions): Promise<void> {
  const discoverySpinner = createSpinner("Resolving media inputs").start();
  const assets = await resolveInputAssets(inputs);
  checkCancellation();
  discoverySpinner.succeed(`Resolved ${assets.length} supported asset(s)`);

  if (assets.length === 0) {
    console.log(pc.yellow("No supported media files found."));
    return;
  }

  await preflightClean(options);

  const results = await processBatch(assets, options, "Cleaning", (asset) =>
    cleanAsset(asset, options),
  );

  reportResults(results);
}

async function runInspect(
  inputs: string[],
  options: InspectMetadataOptions & { all: boolean },
): Promise<void> {
  const assets = await resolveInputAssets(inputs);
  checkCancellation();
  if (assets.length === 0) {
    console.log(pc.yellow("No supported media files found."));
    return;
  }

  await assertCommandAvailable("exiftool");
  const results = await inspectMetadataBatch(assets.map((asset) => asset.path), {
    keywords: !options.all || options.keywords,
    verbose: options.verbose,
  });
  const summary: AssetInspectionRow[] = [];
  for (const [index, asset] of assets.entries()) {
    try {
      const result = results[index];
      if (result.error) {
        throw result.error;
      }
      const rows = result.rows ?? [];
      if (options.all) {
        console.log(pc.bold(`\n${formatPath(asset.path)} (${asset.kind})`));
        if (rows.length === 0) {
          console.log(pc.dim("No metadata found."));
        } else {
          console.table(rows, ["Group", "Field", "Value"]);
        }
      } else {
        // The same keywords are stored in two fields. Display each tag once.
        const tags = [...new Set(rows
          .filter((row) => ["Keywords", "Subject", "Description"].includes(row.Field))
          .flatMap((row) => row.Value.split(",")
          .map((tag) => tag.trim()).filter(Boolean)))];
        summary.push({
          asset: formatPath(asset.path), kind: asset.kind,
          tags: tags.length ? tags.join(", ") : "No keyword metadata",
        });
      }
    } catch (error) {
      console.error(`${pc.red("Failed")} ${formatPath(asset.path)}: ${error instanceof Error ? error.message : String(error)}`);
      if (!options.all) {
        summary.push({ asset: formatPath(asset.path), kind: asset.kind, tags: "Failed to read metadata" });
      }
      process.exitCode = 1;
    }
  }
  if (!options.all) {
    console.log(renderInspectionTable(summary, process.stdout.columns ?? 120));
    console.log(pc.dim(`${assets.length} asset(s)`));
  }
}

async function processBatch(
  assets: MediaAsset[],
  options: { concurrency: number; dryRun: boolean; verbose: boolean },
  action: "Indexing" | "Cleaning",
  processAsset: (asset: MediaAsset) => Promise<ProcessResult>,
): Promise<ProcessResult[]> {
  const limit = pLimit(options.concurrency);
  let completed = 0;
  const spinner = createSpinner({
    text: `${action} media: 0/${assets.length} completed`,
    // Verbose command output should not compete with an animated terminal line.
    isEnabled: !options.verbose && Boolean(process.stderr.isTTY),
  }).start();

  try {
    return await Promise.all(
      assets.map((asset) => limit(async () => {
        checkCancellation();
        const result = await processAsset(asset);
        checkCancellation();
        completed += 1;
        const detail = result.error
          ? `Failed ${formatPath(asset.path)}`
          : result.skipped
            ? `${formatPath(asset.path)} ${pc.dim("skipped: keyword metadata already exists")}`
          : result.keywords
            ? `${formatPath(asset.path)} ${pc.dim(`=> ${result.keywords.join(", ")}`)}`
            : `${formatPath(asset.path)} ${pc.dim(options.dryRun
                ? "would clean generated metadata"
                : "cleaned generated metadata")}`;

        // Only this batch owns a spinner; workers return results without starting one.
        spinner.stopAndPersist({
          symbol: result.error ? pc.red("✖") : result.skipped ? pc.yellow("−") : pc.green("✔"),
          text: detail,
        });
        spinner.text = `${action} media: ${completed}/${assets.length} completed`;
        if (completed < assets.length) {
          spinner.start();
        }
        return result;
      })),
    );
  } finally {
    spinner.stop();
  }
}

async function indexAsset(
  asset: MediaAsset,
  options: IndexOptions,
): Promise<ProcessResult> {

  try {
    if (options.skipExisting) {
      const rows = await inspectMetadata(asset.path, {
        keywords: true,
        verbose: options.verbose,
      });
      if (hasKeywordMetadata(asset.path, rows)) {
        return { asset, skipped: true };
      }
    }

    const keywords = await inferKeywordsFromMedia(asset.path, {
      model: options.model,
    });

    if (!options.dryRun) {
      await embedMetadata(asset.path, keywords, {
        reindex: options.reindex,
        verbose: options.verbose,
      });
    }

    return { asset, keywords };
  } catch (error) {
    checkCancellation();
    return {
      asset,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

async function cleanAsset(
  asset: MediaAsset,
  options: CleanOptions,
): Promise<ProcessResult> {

  try {
    if (!options.dryRun) {
      await cleanMetadata(asset.path, {
        reindex: options.reindex,
        verbose: options.verbose,
      });
    }

    return { asset };
  } catch (error) {
    checkCancellation();
    return {
      asset,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

async function preflightIndex(options: IndexOptions): Promise<void> {
  const spinner = createSpinner("Checking required tools").start();
  await assertCommandAvailable("which");

  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error(`GEMINI_API_KEY is required. Set it in your environment, a local .env, or ${getUserConfigPath()}.`);
  }

  if (!options.dryRun || options.skipExisting) {
    await assertCommandAvailable("exiftool");
  }
  if (!options.dryRun && options.reindex && process.platform === "darwin") {
    await assertCommandAvailable("mdimport");
  }

  spinner.succeed("Required tools are available");
}

async function preflightClean(options: CleanOptions): Promise<void> {
  const spinner = createSpinner("Checking required tools").start();
  await assertCommandAvailable("which");

  if (!options.dryRun) {
    await assertCommandAvailable("exiftool");

    if (options.reindex && process.platform === "darwin") {
      await assertCommandAvailable("mdimport");
    }
  }

  spinner.succeed("Required tools are available");
}

function reportResults(results: ProcessResult[]): void {
  const failures = results.filter((result) => result.error);
  const skipped = results.filter((result) => result.skipped).length;
  const successes = results.length - failures.length - skipped;

  console.log(
    pc.bold(
      `\nDone. ${pc.green(`${successes} succeeded`)}${skipped ? `, ${pc.yellow(`${skipped} skipped`)}` : ""}, ${failures.length ? pc.red(`${failures.length} failed`) : pc.green("0 failed")}.`,
    ),
  );

  for (const result of failures) {
    console.error(
      `${pc.red("Failed")} ${formatPath(result.asset.path)}: ${result.error?.message ?? "Unknown error"}`,
    );
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

function handleFatalError(error: unknown): void {
  if (cancellation.signal.aborted) return;
  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red(`Error: ${message}`));
  process.exitCode = 1;
}

function parseConcurrency(value: string): number {
  return parsePositiveInteger(value);
}

function parsePositiveInteger(value: string): number {
  const concurrency = Number.parseInt(value, 10);

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new InvalidArgumentError("Value must be a positive integer.");
  }

  return concurrency;
}

function formatPath(filePath: string): string {
  return path.relative(process.cwd(), filePath) || filePath;
}
