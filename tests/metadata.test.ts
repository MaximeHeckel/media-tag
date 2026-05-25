import { describe, expect, it } from "vitest";
import { buildCleanMetadataArgs, buildExiftoolArgs } from "../src/metadata.js";

describe("buildExiftoolArgs", () => {
  it("builds in-place video metadata args", () => {
    expect(buildExiftoolArgs("/tmp/clip.mp4", ["neon blue", "looping"])).toEqual([
      "-overwrite_original",
      "-Keys:Description=neon blue, looping",
      "-XMP:Description=neon blue, looping",
      "/tmp/clip.mp4",
    ]);
  });

  it("builds split keyword image metadata args", () => {
    expect(buildExiftoolArgs("/tmp/image.webp", ["glass", "3d render"])).toEqual([
      "-overwrite_original",
      "-sep",
      ", ",
      "-IPTC:Keywords=glass, 3d render",
      "-XMP:Subject=glass, 3d render",
      "/tmp/image.webp",
    ]);
  });

  it("rejects unsupported file extensions", () => {
    expect(() => buildExiftoolArgs("/tmp/file.txt", ["tag"])).toThrow(
      "Unsupported file extension",
    );
  });
});

describe("buildCleanMetadataArgs", () => {
  it("builds video metadata cleanup args", () => {
    expect(buildCleanMetadataArgs("/tmp/clip.mov")).toEqual([
      "-overwrite_original",
      "-Keys:Description=",
      "-XMP:Description=",
      "/tmp/clip.mov",
    ]);
  });

  it("builds image metadata cleanup args", () => {
    expect(buildCleanMetadataArgs("/tmp/image.jpg")).toEqual([
      "-overwrite_original",
      "-IPTC:Keywords=",
      "-XMP:Subject=",
      "/tmp/image.jpg",
    ]);
  });

  it("rejects unsupported cleanup file extensions", () => {
    expect(() => buildCleanMetadataArgs("/tmp/file.txt")).toThrow(
      "Unsupported file extension",
    );
  });
});
