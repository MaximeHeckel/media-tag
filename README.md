# media-tag

Generate searchable keywords for local images and videos with AI, and inspect their embedded metadata.

media-tag uses Gemini Flash to analyze visual content and video audio, then embeds searchable keywords in your files using ExifTool.

## Setup

Requires Node.js 20+, pnpm 11.19.0 (pinned in `package.json`), and ExifTool. If pnpm is not installed, run `npm install -g pnpm@11.19.0`. On macOS:

```bash
brew install exiftool
pnpm install
cp .env.example .env
```

Set your [Gemini API key](https://aistudio.google.com/api-keys) in `.env`:

```dotenv
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-3.8-flash
```

For an installed executable that works from any folder, save these settings in `~/.config/media-tag/.env`:

```bash
mkdir -p ~/.config/media-tag
cp .env ~/.config/media-tag/.env
chmod 600 ~/.config/media-tag/.env
```

Existing environment variables take priority, followed by `.env` in your current working directory, then `~/.config/media-tag/.env`. If `XDG_CONFIG_HOME` is set, the user config lives at `$XDG_CONFIG_HOME/media-tag/.env` instead. Keys are read at runtime and are not bundled into the executable. `GEMINI_MODEL` is optional; the default is `gemini-3.8-flash`. Only `index` requires an API key.

Supported formats: **PNG, JPG, JPEG, WebP, MP4, and MOV**. Commands accept files, directories (searched recursively), multiple inputs, and quoted globs.

## Commands

Generate keywords and write them to embedded metadata:

```bash
pnpm dev index ./downloads
pnpm dev index ./downloads --skip-existing
pnpm dev index ./image.jpg ./clip.mp4 --dry-run
pnpm dev index "./downloads/**/*.mp4"
```

`--skip-existing` skips assets with non-empty values in either keyword metadata field before contacting Gemini. Other metadata, such as camera settings, does not cause a skip. This also applies during dry runs and requires ExifTool.

Inspect keywords in one table, with each asset on its own row:

```bash
pnpm dev inspect ./downloads
pnpm dev inspect ./image.jpg ./clip.mp4
pnpm dev inspect ./clip.mp4 --all
```

`--all` shows every available metadata field in a separate table per asset.

Remove keyword metadata:

```bash
pnpm dev clean ./downloads --dry-run
pnpm dev clean ./downloads
```

| Option | Commands | Behavior |
| --- | --- | --- |
| `--dry-run` | `index`, `clean` | Preview without modifying files |
| `-c, --concurrency <n>` | `index`, `clean` | Concurrent workers; default: 3 |
| `--model <model>` | `index` | Override the Gemini model |
| `--skip-existing` | `index` | Skip assets that already have keyword metadata |
| `--no-reindex` | `index`, `clean` | Skip macOS Spotlight reindexing |
| `--all` | `inspect` | Show full metadata per file |
| `--keywords` | `inspect` | Show keyword metadata; the default |
| `--verbose` | All | Print external command details |
| `-h, --help` | All | Show command help |

Run `media-tag --version` to print the version. Help menus also display it.

## Metadata

Each asset receives up to 15 relevant visual keywords, with fewer returned when appropriate. Videos also receive `has-audio` / `no-audio`, `has-music` / `no-music`, and up to 5 free-form descriptions of audible content. These audio judgments come from Gemini; a silent track counts as no audio.

| Assets | Fields written and cleared |
| --- | --- |
| Images | `IPTC:Keywords`, `XMP:Subject` |
| Videos | `Keys:Description`, `XMP:Description` |

`index` replaces the contents of these fields; `clean` clears them. Both modify the original file in place and request Spotlight reindexing through `mdimport` on macOS unless `--no-reindex` is set.

Analysis uploads media to Gemini. media-tag attempts to delete the uploaded file afterward, including when inference fails.

## Development

```bash
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` compiles JavaScript to `dist/src/`. Run it with Node:

```bash
node dist/src/index.js inspect ./downloads
```

To build a standalone executable for your current operating system and architecture, install Bun and run:

```bash
pnpm compile
./media-tag inspect ./downloads
```

To compile and install it as `media-tag` in `/usr/local/bin` on macOS:

```bash
pnpm install:local
media-tag inspect ./downloads
```

The installation command uses `sudo` and may prompt for your password.

The executable bundles the runtime and JavaScript dependencies. ExifTool must still be installed; Spotlight integration uses the system's `mdimport` on macOS.
