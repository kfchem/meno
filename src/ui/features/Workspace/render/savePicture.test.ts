import { describe, expect, it } from "vitest";
import { savedAs, savedName } from "./savePicture";
import { renderFileName } from "./renders";

const SHA = (c: string) => c.repeat(64);

describe("Saving a picture or a film", () => {
  it("writes a film on a transparent background as its film with transparency alone, and any other as it is", () => {
    expect(savedAs({ sha256: SHA("a"), media: "video/mp4", forSlides: SHA("b") })).toEqual({ sha256: SHA("b"), kind: { name: "Film with transparency (QuickTime)", extensions: ["mov"] } });
    expect(savedAs({ sha256: SHA("a"), media: "video/mp4" })).toEqual({ sha256: SHA("a"), kind: { name: "MP4 film", extensions: ["mp4"] } });
    expect(savedAs({ sha256: SHA("c"), media: "image/png" })).toEqual({ sha256: SHA("c"), kind: { name: "PNG picture", extensions: ["png"] } });
  });

  it("offers it under its own name as the kind it is saved as: the molecule's file's ending never kept before the new one", () => {
    // (a render of a molecule opened from "ethanol.mol")
    expect(renderFileName([{ name: "ethanol.mol" }], "png")).toBe("ethanol.png");
    expect(renderFileName([{ name: "ethanol.mol" }], "mp4")).toBe("ethanol.mp4");
    expect(renderFileName([{ name: "ethanol" }], "png")).toBe("ethanol.png");
    expect(renderFileName([{ name: "a.mol" }, { name: "b.mol" }], "png")).toBe("Render.png");
    expect(renderFileName([{}], "png")).toBe("Render.png");
    // (saved: a film with transparency as a QuickTime film, anything else under the name it has)
    expect(savedName({ name: "ethanol.mp4", media: "video/mp4", forSlides: SHA("b") })).toBe("ethanol.mov");
    expect(savedName({ name: "ethanol.mp4", media: "video/mp4" })).toBe("ethanol.mp4");
    expect(savedName({ name: "figure.png", media: "image/png" })).toBe("figure.png");
    expect(savedName({ name: "photo.jpeg", media: "image/jpeg" })).toBe("photo.jpeg");
    // (one named before as its molecule's file and the film both)
    expect(savedName({ name: "ethanol.mol.mp4", media: "video/mp4", forSlides: SHA("b") })).toBe("ethanol.mol.mov");
    expect(savedName({ name: "ethanol.mol", media: "image/png" })).toBe("ethanol.png");
  });
});
