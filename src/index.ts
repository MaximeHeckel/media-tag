#!/usr/bin/env node

import "dotenv/config";
import path from "node:path";
import { Command, InvalidArgumentError } from "commander";
import ora from "ora";
import pLimit from "p-limit";
import pc from "picocolors";
import { inferKeywordsFromImages } from "./ai.js";
import { appendAudioKeywords } from "./keywords.js";
import {
  type MediaAsset,
  extractVideoFrames,
  removeExtractedFrames,
  resolveInputAssets,
  videoHasAudioStream,
} from "./media.js";
import { cleanMetadata, embedMetadata } from "./metadata.js";
import { assertCommandAvailable } from "./process.js";

type TagOptions = {
  concurrency: number;
  frames: number;
  model?: string;
  dryRun: boolean;
  reindex: boolean;
  keepFrames: boolean;
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
  keywords?: string[];
  error?: Error;
};

const program = new Command();

program
  .name("media-tagger")
  .description("Generate and manage AI metadata keywords for local videos and images.")
  .showHelpAfterError()
  .showSuggestionAfterError();

program
  .command("tag")
  .description("Generate AI keywords and write them to media metadata.")
  .argument("<inputs...>", "files, directories, or glob patterns to process")
  .option("-c, --concurrency <n>", "maximum active workers", parseConcurrency, 3)
  .option("-f, --frames <n>", "number of video frames to extract for inference", parsePositiveInteger, 4)
  .option("--model <model>", "OpenAI model to use", process.env.OPENAI_MODEL)
  .option("--dry-run", "print keywords without writing metadata", false)
  .option("--no-reindex", "skip macOS Spotlight reindexing")
  .option("--keep-frames", "keep extracted video frames for debugging", false)
  .option("--verbose", "print external command details", false)
  .action(async (inputs: string[], options: TagOptions) => {
    try {
      await runTag(inputs, options);
    } catch (error) {
      handleFatalError(error);
    }
  });

program
  .command("clean")
  .description("Remove metadata fields written by the tag command.")
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

await program.parseAsync();

async function runTag(inputs: string[], options: TagOptions): Promise<void> {
  const discoverySpinner = ora("Resolving media inputs").start();
  const assets = await resolveInputAssets(inputs);
  discoverySpinner.succeed(`Resolved ${assets.length} supported asset(s)`);

  if (assets.length === 0) {
    console.log(pc.yellow("No supported media files found."));
    return;
  }

  await preflightTag(assets, options);

  const limit = pLimit(options.concurrency);
  const results = await Promise.all(
    assets.map((asset) => limit(() => tagAsset(asset, options))),
  );

  reportResults(results);
}

async function runClean(inputs: string[], options: CleanOptions): Promise<void> {
  const discoverySpinner = ora("Resolving media inputs").start();
  const assets = await resolveInputAssets(inputs);
  discoverySpinner.succeed(`Resolved ${assets.length} supported asset(s)`);

  if (assets.length === 0) {
    console.log(pc.yellow("No supported media files found."));
    return;
  }

  await preflightClean(options);

  const limit = pLimit(options.concurrency);
  const results = await Promise.all(
    assets.map((asset) => limit(() => cleanAsset(asset, options))),
  );

  reportResults(results);
}

async function tagAsset(
  asset: MediaAsset,
  options: TagOptions,
): Promise<ProcessResult> {
  const spinner = ora(`Processing ${formatPath(asset.path)}`).start();
  let tempDir: string | undefined;

  try {
    const imageReferences =
      asset.kind === "video"
        ? await extractFramesForAsset(asset, options)
        : [asset.path];

    if (asset.kind === "video") {
      tempDir = path.dirname(imageReferences[0]);
    }

    const inferredKeywords = await inferKeywordsFromImages(imageReferences, {
      model: options.model,
    });
    const keywords =
      asset.kind === "video"
        ? appendAudioKeywords(
            inferredKeywords,
            await videoHasAudioStream(asset.path, options.verbose),
          )
        : inferredKeywords;

    if (!options.dryRun) {
      await embedMetadata(asset.path, keywords, {
        reindex: options.reindex,
        verbose: options.verbose,
      });
    }

    spinner.succeed(
      `${formatPath(asset.path)} ${pc.dim(`=> ${keywords.join(", ")}`)}`,
    );

    return { asset, keywords };
  } catch (error) {
    spinner.fail(`Failed ${formatPath(asset.path)}`);
    return {
      asset,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  } finally {
    if (tempDir && !options.keepFrames) {
      await removeExtractedFrames(tempDir);
    }
  }
}

async function cleanAsset(
  asset: MediaAsset,
  options: CleanOptions,
): Promise<ProcessResult> {
  const spinner = ora(`Cleaning ${formatPath(asset.path)}`).start();

  try {
    if (!options.dryRun) {
      await cleanMetadata(asset.path, {
        reindex: options.reindex,
        verbose: options.verbose,
      });
    }

    spinner.succeed(
      options.dryRun
        ? `${formatPath(asset.path)} ${pc.dim("would clean generated metadata")}`
        : `${formatPath(asset.path)} ${pc.dim("cleaned generated metadata")}`,
    );

    return { asset };
  } catch (error) {
    spinner.fail(`Failed ${formatPath(asset.path)}`);
    return {
      asset,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

async function extractFramesForAsset(
  asset: MediaAsset,
  options: TagOptions,
): Promise<string[]> {
  const { framePaths, tempDir } = await extractVideoFrames(
    asset.path,
    options.verbose,
    options.frames,
  );

  if (options.keepFrames) {
    console.log(pc.dim(`Kept extracted frames in ${tempDir}`));
  }

  return framePaths;
}

async function preflightTag(assets: MediaAsset[], options: TagOptions): Promise<void> {
  const spinner = ora("Checking required tools").start();
  await assertCommandAvailable("which");

  if (assets.some((asset) => asset.kind === "video")) {
    await assertCommandAvailable("ffprobe");
    await assertCommandAvailable("ffmpeg");
  }

  if (!options.dryRun) {
    await assertCommandAvailable("exiftool");

    if (options.reindex && process.platform === "darwin") {
      await assertCommandAvailable("mdimport");
    }
  }

  spinner.succeed("Required tools are available");
}

async function preflightClean(options: CleanOptions): Promise<void> {
  const spinner = ora("Checking required tools").start();
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
  const successes = results.length - failures.length;

  console.log(
    pc.bold(
      `\nDone. ${pc.green(`${successes} succeeded`)}, ${failures.length ? pc.red(`${failures.length} failed`) : pc.green("0 failed")}.`,
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
