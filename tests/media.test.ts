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

  it("calculates four evenly spaced frame timestamps by default", () => {
    expect(calculateFrameTimestamps(120)).toEqual([24, 48, 72, 96]);
  });

  it("calculates evenly spaced timestamps for custom frame counts", () => {
    expect(calculateFrameTimestamps(120, 5)).toEqual([20, 40, 60, 80, 100]);
    expect(calculateFrameTimestamps(120, 1)).toEqual([60]);
  });

  it("rejects invalid video durations", () => {
    expect(() => calculateFrameTimestamps(0)).toThrow("Invalid video duration");
    expect(() => calculateFrameTimestamps(Number.NaN)).toThrow(
      "Invalid video duration",
    );
  });

  it("rejects invalid frame counts", () => {
    expect(() => calculateFrameTimestamps(120, 0)).toThrow("Invalid frame count");
    expect(() => calculateFrameTimestamps(120, 1.5)).toThrow(
      "Invalid frame count",
    );
  });

  it("detects audio streams from ffprobe JSON", () => {
    expect(parseVideoHasAudioStream('{"streams":[{"index":1}]}')).toBe(true);
    expect(parseVideoHasAudioStream('{"streams":[]}')).toBe(false);
  });
});
