import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { renderInspectionTable } from "../src/table.js";

describe("inspection table", () => {
  it("wraps long paths and tags without losing their content", () => {
    const table = stripVTControlCharacters(renderInspectionTable([{
      asset: "a".repeat(80),
      kind: "video",
      tags: "t".repeat(90),
    }], 60));
    expect(table).toContain("Metadata tags");
    expect((table.match(/a{2,}/g) ?? []).join(" ").replace(/ /g, "")).toBe("a".repeat(80));
    expect((table.match(/t{2,}/g) ?? []).join(" ").replace(/ /g, "")).toBe("t".repeat(90));
    expect(table.split("\n").every((line) => line.length === 60)).toBe(true);
  });

  it("includes untagged files and reading failures in the same table", () => {
    const table = renderInspectionTable([
      { asset: "image.jpg", kind: "image", tags: "No keyword metadata" },
      { asset: "clip.mov", kind: "video", tags: "Failed to read metadata" },
    ]);
    expect(table).toContain("image.jpg");
    expect(table).toContain("clip.mov");
    expect(table).toContain("No keyword metadata");
    expect(table).toContain("Failed to read metadata");
  });
});
