import { describe, expect, it } from "vitest";
import { COLORS } from "../../../theme/colors";
import { caretPx, FIELD, fieldParts, fieldWidthPx, indexAt, wordAt, type FieldOf } from "./field";
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
    const u = shape(field({ value: "名前へんかん", start: 6, end: 6, composing: [2, 6] }), "composing")!;
    expect(u.x0).toBeCloseTo(10 + pagePx(caretPx("名前へんかん", 2, 11, 500)), 9);
    expect(u.x1).toBeCloseTo(10 + pagePx(caretPx("名前へんかん", 6, 11, 500)), 9);
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
    const v = "a😀b";
    for (let px = 0; px < caretPx(v, v.length, 11); px += 0.5) expect([0, 1, 3, 4]).toContain(indexAt(v, px, 11));
  });

  it("selects a word with a double press: letters and digits together, a run of marks together, spaces alone", () => {
    expect(wordAt("Low energy 12", 6)).toEqual([4, 10]);
    expect(wordAt("Low energy 12", 12)).toEqual([11, 13]);
    // (just after a word's last letter: that word)
    expect(wordAt("Low energy", 3)).toEqual([0, 3]);
    expect(wordAt("a -> b", 3)).toEqual([2, 4]);
    expect(wordAt("a  b", 2)).toEqual([2, 2]);
    expect(wordAt("配座 二", 1)).toEqual([0, 2]);
  });
});
