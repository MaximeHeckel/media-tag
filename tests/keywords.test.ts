import { describe, expect, it } from "vitest";
import { appendAudioKeywords } from "../src/keywords.js";

describe("appendAudioKeywords", () => {
  it("adds audio and music states with descriptive searchable terms", () => {
    expect(appendAudioKeywords(["blue"], {
      hasAudio: true, hasMusic: true, keywords: ["ambient electronic music"],
    })).toEqual(["blue", "has-audio", "has-music", "ambient electronic music"]);
  });

  it("tags silence without carrying over contradictory sound descriptions", () => {
    expect(appendAudioKeywords(["blue", "has-audio", "has-music"], {
      hasAudio: false, hasMusic: false, keywords: ["music"],
    })).toEqual(["blue", "no-audio", "no-music"]);
  });

  it("deduplicates audio terms while retaining audible non-music content", () => {
    expect(appendAudioKeywords(["rain", "no-audio"], {
      hasAudio: true, hasMusic: false, keywords: ["rain", "thunder"],
    })).toEqual(["rain", "has-audio", "no-music", "thunder"]);
  });
});
