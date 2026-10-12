import { describe, expect, it } from "vitest";
import { fadeLetters } from "./labelFade";

describe("labels fading in (Labels2D)", () => {
  it("brings a bold run's thickening up with its letters: words set bold, opened again, drawn bold", () => {
    // (as troika's Text holds them: drawn as the fade began, at nothing)
    const bold = { fillOpacity: 0, outlineWidth: "3.5%", outlineOpacity: 0 };
    const plain = { fillOpacity: 0, outlineWidth: 0, outlineOpacity: 1 };
    const shadow = { fillOpacity: 0, outlineWidth: 0, outlineBlur: 0.2, outlineOpacity: 0 };
    for (const level of [0.4, 1]) for (const o of [bold, plain, shadow]) fadeLetters(o, level);
    expect(bold).toMatchObject({ fillOpacity: 1, outlineOpacity: 1 });
    // (an outline that is not the letters' own is left as it is)
    expect(plain.outlineOpacity).toBe(1);
    expect(shadow.outlineOpacity).toBe(0);
    // (what has no letters, untouched)
    const group = { children: [] };
    fadeLetters(group, 1);
    expect(group).toEqual({ children: [] });
  });
});
