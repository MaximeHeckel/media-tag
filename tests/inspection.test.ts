import { beforeEach, describe, expect, it, vi } from "vitest";
import { inspectMetadataBatch, parseInspectionResults } from "../src/inspection.js";

const mocks = vi.hoisted(() => ({ runCommand: vi.fn() }));
vi.mock("../src/process.js", () => ({ runCommand: mocks.runCommand }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.runCommand.mockImplementation(async (_command: string, args: string[]) => ({
    stdout: JSON.stringify(args.filter((arg) => arg.startsWith("/tmp/")).map((filePath) => ({
      SourceFile: filePath,
      ...(filePath.endsWith(".mp4")
        ? { "Keys:Description": "video keywords" }
        : { "XMP-dc:Subject": ["image keywords"] }),
    }))),
    stderr: "",
  }));
});

describe("bulk inspection", () => {
  it("uses bounded batches rather than a process per file, preserving mixed input order", async () => {
    const paths = ["/tmp/clip.mp4", ...Array.from({ length: 201 }, (_, i) => `/tmp/image-${i}.jpg`)];
    const results = await inspectMetadataBatch(paths, { keywords: true });
    expect(mocks.runCommand).toHaveBeenCalledTimes(4);
    expect(results.map((result) => result.path)).toEqual(paths);
    expect(results[0].rows?.[0].Value).toBe("video keywords");
    expect(results[1].rows?.[0].Value).toBe("image keywords");
    for (const call of mocks.runCommand.mock.calls) {
      const args = call[1] as string[];
      expect(args.filter((arg) => arg.startsWith("/tmp/")).length).toBeLessThanOrEqual(100);
      expect(call[2]).toEqual({ verbose: undefined, acceptedExitCodes: [1] });
    }
  });

  it("keeps failures isolated from valid and empty metadata records", () => {
    const results = parseInspectionResults(JSON.stringify([
      { SourceFile: "/tmp/bad.jpg", "ExifTool:Error": "Unreadable file" },
      { SourceFile: "/tmp/good.jpg", "IPTC:Keywords": ["glass"] },
      { SourceFile: "/tmp/empty.jpg" },
    ]), ["/tmp/good.jpg", "/tmp/bad.jpg", "/tmp/empty.jpg", "/tmp/missing.jpg"]);
    expect(results[0].rows?.[0].Value).toBe("glass");
    expect(results[1].error?.message).toBe("Unreadable file");
    expect(results[2].rows).toEqual([]);
    expect(results[3].error?.message).toContain("no metadata result");
  });

  it("marks a failed batch without discarding successful batches", async () => {
    mocks.runCommand.mockRejectedValueOnce(new Error("Unable to start ExifTool"));
    const paths = ["/tmp/image.jpg", "/tmp/clip.mp4"];
    const results = await inspectMetadataBatch(paths, { keywords: true });
    expect(results[0].error?.message).toBe("Unable to start ExifTool");
    expect(results[1].rows?.[0].Value).toBe("video keywords");
  });

  it("does not start ExifTool for an empty input", async () => {
    expect(await inspectMetadataBatch([], { keywords: true })).toEqual([]);
    expect(mocks.runCommand).not.toHaveBeenCalled();
  });
});
