import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { STYLE_PRESETS } from "../chem/style";
import { BALL_AND_STICK } from "../chem/style3d";
import { readStyleFileText, styleFileName, styleFileText } from "../chem/styleFile";
import { MENO_MEDIA_TYPE, menoFileBytes, menoKindOf, NewerMenoFile, readStyleFile, styleFileBytes } from "./menoFile";

const styles = {
  drawing: [{ name: "Group style", style: { ...STYLE_PRESETS[2].style, bondLengthPt: 12 } }],
  molecules3d: [{ name: "Lab figures", look: { ...BALL_AND_STICK, ballScale: 0.16 } }],
};

describe("what a .meno holds", () => {
  it("is a workspace where it does not say - every file written before kinds were", () => {
    expect(menoKindOf(menoFileBytes("{}", []))).toBe("workspace");
  });

  it("is styles, said by its meno.json - their names and the whole of each, and a picture of them", () => {
    const picture = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const bytes = styleFileBytes(styleFileText(styles), picture);
    expect(menoKindOf(bytes)).toBe("style");
    const read = readStyleFile(bytes);
    expect(readStyleFileText(read.styles)).toEqual(styles);
    expect([...read.picture!]).toEqual([...picture]);
    expect(styleFileName(styles)).toBe("Group style and Lab figures");
  });

  it("of a kind this Meno does not know: said to be made by a newer Meno, opened as nothing", () => {
    const bytes = zipSync({
      mimetype: [strToU8(MENO_MEDIA_TYPE), { level: 0 }],
      "meno.json": [strToU8(JSON.stringify({ kind: "template" })), { level: 0 }],
    });
    expect(() => menoKindOf(bytes)).toThrow(NewerMenoFile);
    expect(() => menoKindOf(bytes)).toThrow(/newer Meno/);
  });

  it("styles that do not read are left out - a file with none reads as none", () => {
    const text = JSON.stringify({ drawing: [{ name: "", style: {} }, { name: "Fine", style: { bondLengthPt: "long" } }], molecules3d: [{ look: {} }] });
    const read = readStyleFileText(text)!;
    expect(read.drawing.map((d) => d.name)).toEqual(["Fine"]);
    expect(read.drawing[0].style.bondLengthPt).toBe(STYLE_PRESETS[0].style.bondLengthPt);
    expect(read.molecules3d).toEqual([]);
    expect(readStyleFileText("{}")).toBeNull();
    expect(readStyleFileText("not json")).toBeNull();
  });
});
