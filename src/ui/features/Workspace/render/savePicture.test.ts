import { describe, expect, it } from "vitest";
import { savedAs } from "./savePicture";

const SHA = (c: string) => c.repeat(64);

describe("Saving a picture or a film", () => {
  it("writes a film on a transparent background as its film for slide programs alone, and any other as it is", () => {
    expect(savedAs({ sha256: SHA("a"), media: "video/mp4", forSlides: SHA("b") })).toEqual({ sha256: SHA("b"), kind: { name: "Film for slide programs, transparent (QuickTime)", extensions: ["mov"] } });
    expect(savedAs({ sha256: SHA("a"), media: "video/mp4" })).toEqual({ sha256: SHA("a"), kind: { name: "MP4 film", extensions: ["mp4"] } });
    expect(savedAs({ sha256: SHA("c"), media: "image/png" })).toEqual({ sha256: SHA("c"), kind: { name: "PNG picture", extensions: ["png"] } });
  });
});
