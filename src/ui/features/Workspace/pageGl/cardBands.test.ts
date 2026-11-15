import { describe, expect, it } from "vitest";
import { bandAt, inReadingOrder, namesKept, NAME_PX, NAMED_LEAST, onPage, type Band } from "./cardBands";
import { WORDS_LEAST } from "../utils/pageScale";

describe("the band a card is drawn in as the page is zoomed out", () => {
  const at = (scale: number, was: Band) => bandAt(scale, was);
  it("is read from three quarters of a page pixel to a screen pixel, named from a quarter, marked below", () => {
    expect([WORDS_LEAST, NAMED_LEAST]).toEqual([0.75, 0.25]);
    expect([1, 2, 0.8].map((s) => at(s, "read"))).toEqual(["read", "read", "read"]);
    expect([0.5, 0.3].map((s) => at(s, "named"))).toEqual(["named", "named"]);
    expect([0.1, 0.01].map((s) => at(s, "marked"))).toEqual(["marked", "marked"]);
  });
  it("switches with a little hysteresis at 0.75: 0.75 and 0.74 stay what they were, a little past is the other", () => {
    expect([at(0.75, "read"), at(0.75, "named"), at(0.75, "marked")]).toEqual(["read", "named", "named"]);
    expect([at(0.74, "read"), at(0.74, "named")]).toEqual(["read", "named"]);
    // (5 % either way: read from 0.7875 up, no longer read below 0.7143)
    expect([at(0.79, "named"), at(0.78, "named"), at(0.72, "read"), at(0.71, "read")]).toEqual(["read", "named", "read", "named"]);
  });
  it("switches with a little hysteresis at 0.25: 0.25 and 0.24 stay what they were, a little past is the other", () => {
    expect([at(0.25, "named"), at(0.25, "marked")]).toEqual(["named", "marked"]);
    expect([at(0.24, "named"), at(0.24, "marked")]).toEqual(["named", "marked"]);
    // (named from 0.2625 up, no longer named below 0.2381)
    expect([at(0.27, "marked"), at(0.26, "marked"), at(0.24, "named"), at(0.23, "named")]).toEqual(["named", "marked", "named", "marked"]);
    // (a zoom from read straight down to marked goes through named)
    expect(at(0.1, "read")).toBe("marked");
  });
});

describe("a name's size", () => {
  it("is eleven screen pixels, whatever the scale: so many page pixels, more as the page is smaller", () => {
    expect(NAME_PX).toBe(11);
    for (const s of [0.7, 0.5, 0.3, 0.26]) expect(onPage(NAME_PX, s) * s).toBeCloseTo(11, 12);
    expect(onPage(NAME_PX, 0.25)).toBe(44);
    expect(onPage(NAME_PX, 0.5)).toBe(22);
  });
});

describe("the names that stay where two cards' names overlap", () => {
  const box = (key: string, x0: number, x1: number, y0 = 0, y1 = 1) => ({ key, x0, x1, y0, y1 });
  it("leaves out the later of two names that overlap, in the order given, and keeps the earlier", () => {
    expect([...namesKept([box("a", 0, 10), box("b", 5, 15)])]).toEqual(["a"]);
    expect([...namesKept([box("b", 5, 15), box("a", 0, 10)])]).toEqual(["b"]);
  });
  it("keeps names side by side, a gap between or touching, and one over another in a column", () => {
    expect([...namesKept([box("a", 0, 10), box("b", 10, 20), box("c", 25, 30)])]).toEqual(["a", "b", "c"]);
    expect([...namesKept([box("a", 0, 10, 0, 1), box("b", 0, 10, 1, 2), box("c", 0, 10, 0.5, 1.5)])]).toEqual(["a", "b"]);
  });
  it("is not kept from by a name left out: a third that overlaps only that one stays", () => {
    expect([...namesKept([box("a", 0, 10), box("b", 8, 18), box("c", 15, 25)])]).toEqual(["a", "c"]);
  });
});

describe("the order cards are read in", () => {
  const card = (key: string, x: number, y: number) => ({ key, x, y });
  it("is by their tops, the higher first, then from the left - cards in one row by their left", () => {
    expect(inReadingOrder([card("c", 0, 0), card("b", 9, 5), card("a", 1, 5.5), card("d", 5, 0.5)]).map((c) => c.key)).toEqual(["a", "b", "c", "d"]);
    // (the same top: the key says)
    expect(inReadingOrder([card("y", 1, 1), card("x", 1, 1)]).map((c) => c.key)).toEqual(["x", "y"]);
  });
});
