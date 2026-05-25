import { readFile } from "node:fs/promises";
import path from "node:path";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_KEYWORDS = 10;

export const InferKeywordsInputSchema = z.object({
  imagePaths: z.array(z.string().min(1)).min(1),
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1).default(DEFAULT_MODEL),
});

export const KeywordResponseSchema = z
  .object({
    keywords: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type InferKeywordsOptions = {
  apiKey?: string;
  model?: string;
};

export async function inferKeywordsFromImages(
  imagePaths: string[],
  options: InferKeywordsOptions = {},
): Promise<string[]> {
  const input = InferKeywordsInputSchema.parse({
    imagePaths,
    apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
    model: options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
  });

  if (!input.apiKey) {
    throw new Error("OPENAI_API_KEY is required for OpenAI inference.");
  }

  const openai = createOpenAI({ apiKey: input.apiKey });
  const imageParts = await Promise.all(
    input.imagePaths.map(async (imagePath) => ({
      type: "image" as const,
      image: await readFile(imagePath),
      mediaType: getMimeType(imagePath),
    })),
  );

  const { object } = await generateObject({
    model: openai(input.model),
    schema: KeywordResponseSchema,
    system:
      "You tag stock footage and images. Return concise, searchable lowercase keywords describing style, objects, colors, mood, composition, medium, and notable visual attributes.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze these visual references and return 8 to 20 high-value metadata keywords.",
          },
          ...imageParts,
        ],
      },
    ],
  });

  const parsed = KeywordResponseSchema.parse(object);
  return sanitizeKeywords(parsed.keywords);
}

export function sanitizeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const keyword of keywords) {
    const normalized = keyword.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    sanitized.push(normalized);

    if (sanitized.length >= MAX_KEYWORDS) {
      break;
    }
  }

  if (sanitized.length === 0) {
    throw new Error("Inference returned no usable keywords.");
  }

  return sanitized;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}
