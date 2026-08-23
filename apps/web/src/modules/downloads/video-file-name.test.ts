import { describe, expect, it } from "vitest";

import { buildVideoDownloadFileName } from "./index";

describe("video aria2 output filename", () => {
  it("uses the website title and keeps the resource video extension", () => {
    expect(buildVideoDownloadFileName("[Artist] Sample / Video", "https://cdn.example/407861-1080p.webm?token=fixture")).toBe("[Artist] Sample _ Video.webm");
  });

  it("defaults to mp4 when the resource URL has no usable extension", () => {
    expect(buildVideoDownloadFileName("Sample Video", "https://cdn.example/download?id=407861")).toBe("Sample Video.mp4");
  });

  it("does not append a second extension when the title already has one", () => {
    expect(buildVideoDownloadFileName("Sample Video.mkv", "https://cdn.example/407861-1080p.mp4")).toBe("Sample Video.mkv");
  });
});
