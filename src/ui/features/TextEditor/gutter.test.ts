import { describe, expect, it } from "vitest";
import { BAR_LEAST, GUTTER_PX, NUMBER_GAP, NUMBER_PAD, gutterFor, scrollOfThumb, thumbOf } from "./editor";

describe("the column of line numbers", () => {
  const digit = 8.4;
  it("keeps its least width for a short text", () => {
    expect(gutterFor(1, digit)).toBe(GUTTER_PX);
    expect(gutterFor(99, digit)).toBe(GUTTER_PX);
  });
  it("leaves room left and right of the longest number, however many digits it has", () => {
    for (const count of [999, 1000, 9999, 10000, 123456, 1000000]) {
      const g = gutterFor(count, digit);
      expect(g - NUMBER_PAD - String(count).length * digit).toBeGreaterThanOrEqual(NUMBER_GAP);
    }
  });
  it("widens by a digit's width as a digit is added", () => {
    expect(gutterFor(100000, digit)).toBeGreaterThan(gutterFor(10000, digit));
    expect(gutterFor(10000, digit)).toBeGreaterThan(gutterFor(1000, digit));
  });
});

describe("a scroll bar's thumb", () => {
  it("is none where the text fits", () => {
    expect(thumbOf(300, 300, 0, 300)).toBeNull();
    expect(thumbOf(200, 300, 0, 300)).toBeNull();
    expect(thumbOf(500, 0, 0, 0)).toBeNull();
  });
  it("is as long as the view is of the text, never shorter than its least", () => {
    expect(thumbOf(600, 300, 0, 300)).toEqual({ start: 0, len: 150 });
    expect(thumbOf(1_000_000, 300, 0, 300)!.len).toBe(BAR_LEAST);
  });
  it("starts at the track's start and ends at its end, at the text's two ends", () => {
    expect(thumbOf(600, 300, 0, 300)!.start).toBe(0);
    const end = thumbOf(600, 300, 300, 300)!;
    expect(end.start + end.len).toBe(300);
    // (a track that begins later, as one beside the numbers does)
    expect(thumbOf(600, 300, 0, 300, 50)!.start).toBe(50);
  });
  it("is dragged to the scroll it stands for, and back", () => {
    const most = 300;
    for (const scroll of [0, 75, 150, 300]) {
      const t = thumbOf(600, 300, scroll, 300)!;
      expect(scrollOfThumb(t.start, t.len, 300, most)).toBeCloseTo(scroll);
    }
    expect(scrollOfThumb(-20, 150, 300, most)).toBe(0);
    expect(scrollOfThumb(900, 150, 300, most)).toBe(most);
  });
});
