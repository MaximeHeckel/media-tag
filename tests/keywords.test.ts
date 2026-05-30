import { describe, expect, it } from "vitest";
import { appendAudioKeywords } from "../src/keywords.js";

describe("appendAudioKeywords", () => {
  it("adds searchable sound keywords for videos with audio streams", () => {
    expect(appendAudioKeywords(["blue", "cyberpunk"], true)).toEqual([
      "blue",
      "cyberpunk",
      "has-audio",
    ]);
  });

  it("adds searchable no-sound keywords for videos without audio streams", () => {
    expect(appendAudioKeywords(["blue"], false)).toEqual([
      "blue",
      "no-audio",
    ]);
  });

  it("does not duplicate existing audio keywords", () => {
    expect(appendAudioKeywords(["blue", "has-audio"], true)).toEqual([
      "blue",
      "has-audio",
    ]);
  });
});
