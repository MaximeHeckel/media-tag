import { describe, expect, it } from "vitest";
import {
  getMediaMimeType,
  getMediaKind,
  isSupportedMediaFile,
} from "../src/media.js";

describe("media helpers", () => {
  it("classifies supported video and image files", () => {
    expect(getMediaKind("clip.MP4")).toBe("video");
    expect(getMediaKind("clip.mkv")).toBeUndefined();
    expect(getMediaKind("image.jpeg")).toBe("image");
    expect(getMediaKind("image.webp")).toBe("image");
    expect(getMediaKind("document.pdf")).toBeUndefined();
  });

  it("filters unsupported media files", () => {
    expect(isSupportedMediaFile("asset.mov")).toBe(true);
    expect(isSupportedMediaFile("asset.gif")).toBe(false);
  });

  it("maps upload formats and rejects unsupported MKV files", () => {
    expect(getMediaMimeType("clip.MP4")).toBe("video/mp4");
    expect(getMediaMimeType("clip.mov")).toBe("video/mov");
    expect(getMediaMimeType("image.jpeg")).toBe("image/jpeg");
    expect(getMediaMimeType("image.png")).toBe("image/png");
    expect(getMediaMimeType("image.webp")).toBe("image/webp");
    expect(() => getMediaMimeType("clip.mkv")).toThrow("Unsupported Gemini media format");
  });

});
