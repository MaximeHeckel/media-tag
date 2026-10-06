import { describe, expect, it } from "vitest";
import { buildCleanMetadataArgs, buildExiftoolArgs, buildInspectMetadataArgs, parseMetadataRows, hasKeywordMetadata } from "../src/metadata.js";

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

describe("metadata inspection", () => {
  it("recognizes either keyword field for images and videos", () => {
    expect(hasKeywordMetadata("/tmp/image.jpg", parseMetadataRows(
      '[{"IPTC:Keywords":["neon blue"]}]',
    ))).toBe(true);
    expect(hasKeywordMetadata("/tmp/image.webp", parseMetadataRows(
      '[{"XMP-dc:Subject":["glass"]}]',
    ))).toBe(true);
    expect(hasKeywordMetadata("/tmp/clip.mp4", parseMetadataRows(
      '[{"Keys:Description":"neon blue, camera orbit"}]',
    ))).toBe(true);
    expect(hasKeywordMetadata("/tmp/clip.MOV", parseMetadataRows(
      '[{"XMP-dc:Copy1:Description":"music"}]',
    ))).toBe(true);
  });

  it("ignores empty keyword fields and unrelated metadata", () => {
    expect(hasKeywordMetadata("/tmp/image.jpg", parseMetadataRows(
      '[{"IPTC:Keywords":[" ",""],"XMP-dc:Subject":null,"ExifIFD:ISO":100}]',
    ))).toBe(false);
    expect(hasKeywordMetadata("/tmp/clip.mp4", parseMetadataRows(
      '[{"Keys:Description":" ","XMP-dc:Description":"","ExifTool:Warning":"Example warning"}]',
    ))).toBe(false);
    expect(hasKeywordMetadata("/tmp/image.jpg", parseMetadataRows(
      '[{"XMP-dc:Description":"An unrelated caption"}]',
    ))).toBe(false);
    expect(hasKeywordMetadata("/tmp/clip.mp4", [])).toBe(false);
  });

  it("reads all grouped metadata without write arguments", () => {
    expect(buildInspectMetadataArgs("/tmp/clip.mov")).toEqual([
      "-json", "-G1:4", "-s", "/tmp/clip.mov",
    ]);
  });

  it("selects the correct keyword fields for images and videos", () => {
    expect(buildInspectMetadataArgs("/tmp/image.webp", { keywords: true })).toEqual([
      "-json", "-G1:4", "-s", "-IPTC:Keywords", "-XMP:Subject", "/tmp/image.webp",
    ]);
    expect(buildInspectMetadataArgs("/tmp/clip.mp4", { keywords: true })).toEqual([
      "-json", "-G1:4", "-s", "-Keys:Description", "-XMP:Description", "/tmp/clip.mp4",
    ]);
  });

  it("keeps same-name fields distinct and displays keyword lists", () => {
    expect(parseMetadataRows(JSON.stringify([{
      SourceFile: "/tmp/image.jpg",
      "XMP-dc:Subject": ["neon blue", "camera orbit"],
      "Keys:Description": "neon blue, camera orbit",
      "XMP-dc:Description": "a rotating sphere",
    }]))).toEqual([
      { Group: "Keys", Field: "Description", Value: "neon blue, camera orbit" },
      { Group: "XMP-dc", Field: "Description", Value: "a rotating sphere" },
      { Group: "XMP-dc", Field: "Subject", Value: "neon blue, camera orbit" },
    ]);
  });

  it("handles absent metadata and reports ExifTool errors", () => {
    expect(parseMetadataRows('[{"SourceFile":"/tmp/image.jpg"}]')).toEqual([]);
    expect(() => parseMetadataRows('[{"ExifTool:Error":"File not found"}]'))
      .toThrow("File not found");
    expect(() => parseMetadataRows("[]")).toThrow();
  });
});
