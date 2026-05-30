# media-tagger-cli

A minimalist CLI for tagging local stock footage, video clips, and images with AI-generated metadata keywords.

The tool extracts visual context from media, asks a multimodal model for semantic keywords, and writes those keywords into file metadata with ExifTool so they can be discovered by tools like macOS Spotlight, creative apps, and media indexers.

## Features

- Tags images: `.png`, `.jpg`, `.jpeg`, `.webp`
- Tags videos: `.mp4`, `.mov`, `.mkv`
- Accepts files, directories, and glob patterns
- Extracts 4 evenly spaced video frames by default using fast ffmpeg input seeking
- Adds searchable video audio tokens based on audio-track detection
- Uses Vercel AI SDK with OpenAI by default
- Validates LLM input and output with Zod
- Writes metadata in place with ExifTool using `-overwrite_original`
- Supports bounded concurrency, defaulting to 3 workers
- Can clean only the metadata fields written by this CLI
- Can compile to a portable Bun executable

## Requirements

- Node.js 20+
- pnpm
- Bun, only if compiling the portable executable
- OpenAI API key
- System binaries:
  - `ffmpeg`
  - `ffprobe`
  - `exiftool`
  - `mdimport` on macOS, already available by default

On macOS:

```bash
brew install ffmpeg exiftool
```

## Setup

Install dependencies:

```bash
pnpm install
```

Create a local env file:

```bash
cp .env.example .env
```

Then set:

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4o-mini
```

The CLI automatically loads `.env` at startup.

## Development Usage

Preview generated tags without writing metadata:

```bash
pnpm dev tag ./path/to/image.jpg --dry-run
```

Tag a file:

```bash
pnpm dev tag ./path/to/image.jpg
```

Tag a directory or glob:

```bash
pnpm dev tag ./downloads
pnpm dev tag "./downloads/**/*.mp4"
```

Use more video frames for inference:

```bash
pnpm dev tag ./path/to/video.mp4 --frames 8
pnpm dev tag ./path/to/video.mp4 -f 8
```

Clean metadata fields written by this CLI:

```bash
pnpm dev clean ./path/to/image.jpg --dry-run
pnpm dev clean ./path/to/image.jpg
```

## CLI Options

`tag` options:

```bash
--concurrency <n>  Maximum active workers, defaults to 3
--frames <n>       Number of video frames to extract, defaults to 4
--model <model>    OpenAI model, defaults to OPENAI_MODEL or gpt-4o-mini
--dry-run          Print keywords without writing metadata
--no-reindex       Skip macOS Spotlight reindexing
--keep-frames      Keep extracted video frames for debugging
--verbose          Print external command details
```

`clean` options:

```bash
--concurrency <n>  Maximum active workers, defaults to 3
--dry-run          Print files that would be cleaned without writing metadata
--no-reindex       Skip macOS Spotlight reindexing
--verbose          Print external command details
```

## Metadata Fields

Videos:

- `Keys:Description`
- `XMP:Description`

Video tags also include one audio state pair:

- `has sound`, `has-audio` when ffprobe detects any audio stream
- `no sound`, `no-audio` when no audio stream is detected

Images:

- `IPTC:Keywords`
- `XMP:Subject`

`clean` only clears those fields. It does not wipe all EXIF, IPTC, or XMP metadata.

## Inspect Metadata

Show all metadata:

```bash
pnpm exif -- ./path/to/file
```

Show image tags written by this CLI:

```bash
pnpm exif:image -- ./path/to/image.jpg
```

Show video tags written by this CLI:

```bash
pnpm exif:video -- ./path/to/video.mp4
```

Check macOS Spotlight fields:

```bash
pnpm spotlight -- ./path/to/file
```

## Build

Compile TypeScript to `dist`:

```bash
pnpm build
```

This is useful for checking the Node build, but it is not a standalone executable.

## Portable Executable

Compile a Bun executable:

```bash
pnpm compile
```

Run it locally:

```bash
./media-tagger tag ./path/to/image.jpg --dry-run
./media-tagger clean ./path/to/image.jpg
```

Install it globally:

```bash
pnpm install:local
```

This installs:

```bash
/usr/local/bin/media-tagger
```

Then run:

```bash
media-tagger tag ./path/to/image.jpg --dry-run
```

The compiled binary includes the JavaScript runtime and bundled dependencies. It does not bundle `ffmpeg`, `ffprobe`, `exiftool`, or `mdimport`; those still need to be installed on the target machine.

## Verification

Run checks:

```bash
pnpm typecheck
pnpm test
```
