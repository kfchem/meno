import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLORS } from "../../../theme/colors";
import { caretPx, DOUBLE_MS, FIELD, fieldParts, fieldWidthPx, indexAt, pressAt, wordAt, type FieldOf } from "./field";
import type { Box } from "./shapes";
import { textWidth } from "./texts";
import { pagePx } from "./units";

const field = (over: Partial<FieldOf> = {}): FieldOf => ({ key: "name:3", x: 10, y: 20, value: "Conformers", start: 4, end: 4, sizePx: 11, weight: 500, caret: 1, ...over });
const shape = (f: FieldOf, part: string) => fieldParts(f).shapes.find((s) => s.key === `name:3:${part}`) as Box | undefined;

describe("a field typed into on the page, drawn by WebGL", () => {
  it("says what it holds where the words it names stand, in their size and weight, in a white box with a hairline", () => {
    const d = fieldParts(field());
    expect(d.texts).toEqual([expect.objectContaining({ x: 10, y: 20, text: "Conformers", sizePx: 11, weight: 500, color: COLORS.ink, anchor: "start", baseline: "middle" })]);
    const box = shape(field(), "box")!;
    expect(box).toMatchObject({ fill: COLORS.background, line: { widthPx: 1, color: COLORS.hairline }, radiusPx: FIELD.radius });
    expect(box.x0).toBeCloseTo(10 - pagePx(FIELD.side), 9);
    expect(box.x1 - box.x0).toBeCloseTo(pagePx(fieldWidthPx("Conformers", 11, 500)), 9);
    // (it takes the pointer over its box, with the text cursor)
    expect(d.region).toMatchObject({ key: "name:3", part: "field", rect: { x0: box.x0, x1: box.x1 }, cursor: "text" });
  });

  it("is never narrower than six letters, and a letter wider than its words", () => {
    expect(fieldWidthPx("", 11)).toBe(FIELD.least + 2 * FIELD.side);
    const long = "A name a good way longer than six letters";
    expect(fieldWidthPx(long, 11)).toBeCloseTo(textWidth(long, 11) + 11 * 0.6 + 2 * FIELD.side, 9);
  });

  it("draws its caret a pixel wide where its letters part, as present as it blinks, and none while it is gone", () => {
    const c = shape(field(), "caret")!;
    const at = 10 + pagePx(textWidth("Conf", 11, 500));
    expect((c.x0 + c.x1) / 2).toBeCloseTo(at, 9);
    expect(c.x1 - c.x0).toBeCloseTo(pagePx(1), 9);
    expect(shape(field({ caret: 0.4 }), "caret")!.opacity).toBe(0.4);
    expect(shape(field({ caret: 0 }), "caret")).toBeUndefined();
  });

  it("washes what is selected in Meno's colour behind its words, either way round, with no caret", () => {
    const s = shape(field({ start: 7, end: 2 }), "selected")!;
    expect(s.x0).toBeCloseTo(10 + pagePx(caretPx("Conformers", 2, 11, 500)), 9);
    expect(s.x1).toBeCloseTo(10 + pagePx(caretPx("Conformers", 7, 11, 500)), 9);
    expect(s).toMatchObject({ fill: COLORS.base, fillAlpha: 0.2 });
    // (over its box; its words are drawn over every shape - PageLayer)
    expect(s.z!).toBeGreaterThan(shape(field(), "box")!.z!);
    expect(shape(field({ start: 7, end: 2 }), "caret")).toBeUndefined();
  });

  it("underlines what an input method is composing, under just those letters", () => {
    // (two kanji, then four kana being composed - "name" and "henkan" - as escapes)
    const v = "\u540D\u524D\u3078\u3093\u304B\u3093";
    const u = shape(field({ value: v, start: 6, end: 6, composing: [2, 6] }), "composing")!;
    expect(u.x0).toBeCloseTo(10 + pagePx(caretPx(v, 2, 11, 500)), 9);
    expect(u.x1).toBeCloseTo(10 + pagePx(caretPx(v, 6, 11, 500)), 9);
    // (a line a pixel thick along the foot of the caret's height, under the words' middle)
    expect(u.y1).toBeCloseTo(20 - pagePx(FIELD.caret / 2), 9);
    expect(u.y1 - u.y0).toBeCloseTo(pagePx(1), 9);
    expect(shape(field(), "composing")).toBeUndefined();
  });
});

describe("where a press in a field puts its caret", () => {
  it("is the place between letters nearest it: before the first, after the last, never past either", () => {
    const v = "Input";
    expect(indexAt(v, -5, 11)).toBe(0);
    expect(indexAt(v, 1e3, 11)).toBe(v.length);
    const mid = (caretPx(v, 2, 11) + caretPx(v, 3, 11)) / 2;
    expect(indexAt(v, mid - 0.1, 11)).toBe(2);
    expect(indexAt(v, mid + 0.1, 11)).toBe(3);
  });

  it("never parts the two halves of one letter", () => {
    // (a letter, a face - two UTF-16 units, one letter - and a letter)
    const v = "a\u{1F600}b";
    for (let px = 0; px < caretPx(v, v.length, 11); px += 0.5) expect([0, 1, 3, 4]).toContain(indexAt(v, px, 11));
  });

  it("selects a word with a double press: letters and digits together, a run of marks together, spaces alone", () => {
    expect(wordAt("Low energy 12", 6)).toEqual([4, 10]);
    expect(wordAt("Low energy 12", 12)).toEqual([11, 13]);
    // (just after a word's last letter: that word)
    expect(wordAt("Low energy", 3)).toEqual([0, 3]);
    expect(wordAt("a -> b", 3)).toEqual([2, 4]);
    expect(wordAt("a  b", 2)).toEqual([2, 2]);
    // (two kanji, a space, one kanji - "conformer" and "two" - as escapes)
    expect(wordAt("\u914D\u5EA7 \u4E8C", 1)).toEqual([0, 2]);
    // (an underscore is a letter's: "a_b" one word)
    expect(wordAt("a_b c", 1)).toEqual([0, 3]);
  });
});

describe("what a press in a field does", () => {
  const press = (over: Partial<Parameters<typeof pressAt>[0]> = {}) => pressAt({ value: "Low energy", i: 6, at: 1000, lastDown: -Infinity, shift: false, selected: [2, 2], ...over });

  it("puts the caret where it is, and a drag from it selects - the next press counted from it", () => {
    expect(press()).toEqual({ select: [6, 6], drag: true, lastDown: 1000 });
  });

  it("with shift, reaches what is selected there from where it began", () => {
    expect(press({ shift: true }).select).toEqual([2, 6]);
  });

  it("a second soon after selects the word there and drags nothing; a third is a single press again", () => {
    const second = press({ lastDown: 1000 - DOUBLE_MS + 1 });
    expect(second).toEqual({ select: [4, 10], drag: false, lastDown: -Infinity });
    expect(press({ at: 1001, lastDown: second.lastDown }).drag).toBe(true);
    // (no sooner than DOUBLE_MS: a single press)
    expect(press({ lastDown: 1000 - DOUBLE_MS }).drag).toBe(true);
  });

  it("is let go however it ends - a double press too - so that a press away from the field finishes it (PageField, read as written)", () => {
    const src = readFileSync(join(__dirname, "PageField.tsx"), "utf8");
    // (the press's own blur waits for its letting go; every press listens for that, a drag alone for the moves)
    expect(src).toMatch(/if \(press\.drag\) window\.addEventListener\("pointermove", move, true\);\s*window\.addEventListener\("pointerup", up, true\);\s*window\.addEventListener\("pointercancel", up, true\);/);
    expect(src).toMatch(/const up = \(\) => \{[\s\S]*?pressed\.current = false;/);
    expect(src).not.toMatch(/return;\s*\}\s*lastDown\.current = now;/);
  });
});
