import { describe, expect, it } from "vitest";
import {
  InferKeywordsInputSchema,
  KeywordResponseSchema,
  sanitizeKeywords,
} from "../src/ai.js";

describe("sanitizeKeywords", () => {
  it("normalizes, dedupes, and preserves useful keyword phrases", () => {
    expect(
      sanitizeKeywords([
        " Neon Blue ",
        "neon   blue",
        "",
        "Cyberpunk",
        "  glass  reflections ",
      ]),
    ).toEqual(["neon blue", "cyberpunk", "glass reflections"]);
  });

  it("caps keywords to a practical metadata size", () => {
    const keywords = Array.from({ length: 40 }, (_, index) => `keyword ${index}`);
    expect(sanitizeKeywords(keywords)).toHaveLength(10);
  });

  it("rejects empty keyword payloads", () => {
    expect(() => sanitizeKeywords([" ", ""])).toThrow(
      "Inference returned no usable keywords",
    );
  });
});

describe("LLM validation schemas", () => {
  it("validates inference input and applies the default model", () => {
    expect(
      InferKeywordsInputSchema.parse({
        imagePaths: ["/tmp/frame.jpg"],
        apiKey: "test-key",
      }),
    ).toEqual({
      imagePaths: ["/tmp/frame.jpg"],
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });
  });

  it("rejects empty inference input", () => {
    expect(() => InferKeywordsInputSchema.parse({ imagePaths: [] })).toThrow();
  });

  it("validates the structured LLM output payload", () => {
    expect(
      KeywordResponseSchema.parse({ keywords: ["neon blue", "cyberpunk"] }),
    ).toEqual({ keywords: ["neon blue", "cyberpunk"] });
  });

  it("rejects malformed LLM output payloads", () => {
    expect(() => KeywordResponseSchema.parse({ tags: ["neon"] })).toThrow();
  });
});
