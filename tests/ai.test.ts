import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InferKeywordsInputSchema,
  inferKeywordsFromMedia,
  KeywordResponseSchema,
  VideoKeywordResponseSchema,
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
        mediaPath: "/tmp/image.jpg",
        apiKey: "test-key",
      }),
    ).toEqual({
      mediaPath: "/tmp/image.jpg",
      apiKey: "test-key",
      model: "gemini-3.8-flash",
    });
  });

  it("rejects empty inference input", () => {
    expect(() => InferKeywordsInputSchema.parse({ mediaPath: "" })).toThrow();
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

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  generateContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    files = { upload: mocks.upload, get: mocks.get, delete: mocks.delete };
    models = { generateContent: mocks.generateContent };
  },
}));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));

describe("Gemini media inference", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.upload.mockResolvedValue({
      name: "files/test", uri: "https://example.com/file", state: "ACTIVE",
    });
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({ keywords: [" Neon Blue ", "neon blue", "camera orbit"],
        audio: { hasAudio: false, hasMusic: false, keywords: [] } }),
    });
    mocks.delete.mockResolvedValue(undefined);
  });

  it("sends the video file rather than extracted frames and normalizes its keywords", async () => {
    await expect(inferKeywordsFromMedia("/tmp/clip.mp4", { apiKey: "test-key" }))
      .resolves.toEqual(["neon blue", "camera orbit", "no-audio", "no-music"]);
    expect(mocks.upload).toHaveBeenCalledWith({
      file: "/tmp/clip.mp4", config: { mimeType: "video/mp4" },
    });
    expect(mocks.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: "gemini-3.8-flash",
      contents: [expect.objectContaining({ parts: expect.arrayContaining([
        { fileData: { fileUri: "https://example.com/file", mimeType: "video/mp4" } },
      ]) })],
      config: expect.objectContaining({ responseMimeType: "application/json" }),
    }));
    expect(mocks.delete).toHaveBeenCalledWith({ name: "files/test" });
  });

  it("preserves descriptive audio terms alongside the visual keyword budget", async () => {
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify({
      keywords: Array.from({ length: 10 }, (_, index) => `visual ${index}`),
      audio: { hasAudio: true, hasMusic: true, keywords: [" Soft Piano ", "soft piano", "slow instrumental music"] },
    }) });
    const keywords = await inferKeywordsFromMedia("/tmp/clip.mp4", { apiKey: "test-key" });
    expect(keywords).toContain("visual 9");
    expect(keywords.slice(10)).toEqual(["has-audio", "has-music", "soft piano", "slow instrumental music"]);
  });

  it("tags audible non-music content without inventing music", async () => {
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify({
      keywords: ["forest"],
      audio: { hasAudio: true, hasMusic: false, keywords: ["rustling leaves"] },
    }) });
    await expect(inferKeywordsFromMedia("/tmp/clip.mp4", { apiKey: "test-key" }))
      .resolves.toEqual(["forest", "has-audio", "no-music", "rustling leaves"]);
  });

  it("rejects missing or contradictory audio judgments for videos", async () => {
    expect(() => VideoKeywordResponseSchema.parse({ keywords: ["forest"] })).toThrow();
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify({
      keywords: ["forest"], audio: { hasAudio: false, hasMusic: true, keywords: [] },
    }) });
    await expect(inferKeywordsFromMedia("/tmp/clip.mp4", { apiKey: "test-key" }))
      .rejects.toThrow("inconsistent audio metadata");
    expect(mocks.delete).toHaveBeenCalledWith({ name: "files/test" });
  });

  it("uploads images with their MIME type and honors a model override", async () => {
    mocks.generateContent.mockResolvedValue({ text: '{"keywords":["neon blue"]}' });
    await inferKeywordsFromMedia("/tmp/image.webp", { apiKey: "test-key", model: "custom-model" });
    expect(mocks.upload).toHaveBeenCalledWith({
      file: "/tmp/image.webp", config: { mimeType: "image/webp" },
    });
    expect(mocks.generateContent).toHaveBeenCalledWith(expect.objectContaining({ model: "custom-model" }));
  });

  it("waits for an active upload before generating keywords", async () => {
    mocks.upload.mockResolvedValue({ name: "files/test", state: "PROCESSING" });
    mocks.get.mockResolvedValue({ name: "files/test", uri: "https://example.com/file", state: "ACTIVE" });
    await inferKeywordsFromMedia("/tmp/clip.mp4", { apiKey: "test-key" });
    expect(mocks.get).toHaveBeenCalledWith({ name: "files/test" });
    expect(mocks.generateContent).toHaveBeenCalledOnce();
  });

  it("cleans up failed processing without requesting inference", async () => {
    mocks.upload.mockResolvedValue({ name: "files/test", state: "FAILED" });
    await expect(inferKeywordsFromMedia("/tmp/clip.mp4", { apiKey: "test-key" }))
      .rejects.toThrow("Gemini media processing failed");
    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalledWith({ name: "files/test" });
  });

  it("cleans up and preserves the error when inference fails", async () => {
    mocks.generateContent.mockRejectedValue(new Error("Quota exceeded"));
    await expect(inferKeywordsFromMedia("/tmp/clip.mp4", { apiKey: "test-key" }))
      .rejects.toThrow("Quota exceeded");
    expect(mocks.delete).toHaveBeenCalledWith({ name: "files/test" });
  });

  it("times out and cleans up an upload that never becomes active", async () => {
    mocks.upload.mockResolvedValue({ name: "files/test", state: "PROCESSING" });
    const now = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(600_000);
    try {
      await expect(inferKeywordsFromMedia("/tmp/clip.mp4", { apiKey: "test-key" }))
        .rejects.toThrow("Timed out waiting for Gemini");
      expect(mocks.generateContent).not.toHaveBeenCalled();
      expect(mocks.delete).toHaveBeenCalledWith({ name: "files/test" });
    } finally {
      now.mockRestore();
    }
  });

  it("cleans up when Gemini returns invalid keyword JSON", async () => {
    mocks.generateContent.mockResolvedValue({ text: '{"tags":["neon"]}' });
    await expect(inferKeywordsFromMedia("/tmp/image.jpg", { apiKey: "test-key" })).rejects.toThrow();
    expect(mocks.delete).toHaveBeenCalledWith({ name: "files/test" });
  });

  it("preserves usable keywords if remote cleanup fails", async () => {
    mocks.generateContent.mockResolvedValue({ text: '{"keywords":["neon blue","camera orbit"]}' });
    mocks.delete.mockRejectedValue(new Error("Deletion failed"));
    const warning = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(inferKeywordsFromMedia("/tmp/image.jpg", { apiKey: "test-key" }))
        .resolves.toEqual(["neon blue", "camera orbit"]);
      expect(warning).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });
});
