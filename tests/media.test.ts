import { describe, expect, it } from "vitest";
import {
  calculateFrameTimestamps,
  getMediaKind,
  isSupportedMediaFile,
  parseVideoHasAudioStream,
} from "../src/media.js";

describe("media helpers", () => {
  it("classifies supported video and image files", () => {
    expect(getMediaKind("clip.MP4")).toBe("video");
    expect(getMediaKind("clip.mkv")).toBe("video");
    expect(getMediaKind("image.jpeg")).toBe("image");
    expect(getMediaKind("image.webp")).toBe("image");
    expect(getMediaKind("document.pdf")).toBeUndefined();
  });

  it("filters unsupported media files", () => {
    expect(isSupportedMediaFile("asset.mov")).toBe(true);
    expect(isSupportedMediaFile("asset.gif")).toBe(false);
  });

  it("calculates 25, 50, and 75 percent frame timestamps", () => {
    expect(calculateFrameTimestamps(120)).toEqual([30, 60, 90]);
  });

  it("rejects invalid video durations", () => {
    expect(() => calculateFrameTimestamps(0)).toThrow("Invalid video duration");
    expect(() => calculateFrameTimestamps(Number.NaN)).toThrow(
      "Invalid video duration",
    );
  });

  it("detects audio streams from ffprobe JSON", () => {
    expect(parseVideoHasAudioStream('{"streams":[{"index":1}]}')).toBe(true);
    expect(parseVideoHasAudioStream('{"streams":[]}')).toBe(false);
  });
});
