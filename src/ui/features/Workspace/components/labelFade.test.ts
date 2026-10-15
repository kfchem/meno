import { describe, expect, it } from "vitest";
import { fadeLetters, fadedOpacity, fadingOut } from "./labelFade";

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

describe("a label that has gone, fading out", () => {
  it("fades to naught in the time given, frame by frame, and no further", () => {
    let level = 1;
    const frames: number[] = [];
    for (let i = 0; i < 12; i++) frames.push((level = fadingOut(level, 1 / 60, 0.12)));
    expect(frames[0]).toBeLessThan(1);
    expect(frames[6]).toBeGreaterThan(0);
    expect(frames[7]).toBe(0);
    expect(frames[frames.length - 1]).toBe(0);
  });

  it("is drawn whole as it goes and gone at the end, leaving gently at first", () => {
    expect(fadedOpacity(1)).toBe(1);
    expect(fadedOpacity(0)).toBe(0);
    // (a quarter of the way: still nearly whole)
    expect(fadedOpacity(0.75)).toBeGreaterThan(0.9);
  });
});
