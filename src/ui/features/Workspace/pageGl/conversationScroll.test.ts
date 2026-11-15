import { describe, expect, it } from "vitest";
import { CARD } from "./conversationCard";
import { cardForKey, earlierOf, glideAt, gliding, latestOf, newBelow, offsetByKey, offsetByThumb, pagedByPress, SCROLL_MS, thumbOf, TRACK } from "./conversationScroll";

// (a history 1000 tall seen through a view 250 tall: scrolled at most 750; a track 500 long)
const H = 1000;
const V = 250;
const T = 500;

describe("a card's track", () => {
  it("has a thumb as long as the share of the history the view shows - 125 of 500 - and as far down as the history is: halfway, 187.5", () => {
    expect(thumbOf(T, H, V, 0)).toEqual({ top: 0, len: 125 });
    expect(thumbOf(T, H, V, 375)).toEqual({ top: 187.5, len: 125 });
    expect(thumbOf(T, H, V, 750)).toEqual({ top: 375, len: 125 });
    // (an offset past the end is the end)
    expect(thumbOf(T, H, V, Infinity)).toEqual({ top: 375, len: 125 });
  });

  it("has a thumb no shorter than 24 px however long the history, and none where it all fits", () => {
    expect(TRACK.least).toBe(24);
    expect(thumbOf(T, 100000, V, 0)?.len).toBe(24);
    expect(thumbOf(T, 250, V, 0)).toBeNull();
    expect(thumbOf(T, 200, V, 0)).toBeNull();
    expect(thumbOf(0, H, V, 0)).toBeNull();
  });

  it("maps a thumb dragged to an offset: 100 px of 375 of room is 200 of 750, from 375 to 575 - clamped at either end", () => {
    expect(offsetByThumb(T, H, V, 375, 100)).toBe(575);
    expect(offsetByThumb(T, H, V, 375, -100)).toBe(175);
    expect(offsetByThumb(T, H, V, 375, 1e6)).toBe(750);
    expect(offsetByThumb(T, H, V, 375, -1e6)).toBe(0);
    expect(offsetByThumb(T, 200, V, 0, 50)).toBe(0);
    // (dragged the whole of its room: the whole of the history)
    expect(offsetByThumb(T, H, V, 0, 375)).toBe(750);
  });

  it("pages by the view's height on a press off the thumb - up above it, down below - and by none on it", () => {
    // (the thumb at 187.5 to 312.5, offset 375)
    expect(pagedByPress(T, H, V, 375, 100)).toBe(125);
    expect(pagedByPress(T, H, V, 375, 400)).toBe(625);
    expect(pagedByPress(T, H, V, 375, 187.5)).toBeNull();
    expect(pagedByPress(T, H, V, 375, 312.5)).toBeNull();
    expect(pagedByPress(T, H, V, 375, 312.6)).toBe(625);
    // (clamped: a page up from 100 is the start; a page down from 700, the end)
    expect(pagedByPress(T, H, V, 100, 400)).toBe(350);
    expect(pagedByPress(T, H, V, 700, 499)).toBe(750);
    expect(pagedByPress(T, H, V, 200, 10)).toBe(0);
    expect(pagedByPress(T, 250, V, 0, 400)).toBeNull();
  });
});

describe("a card scrolled by keys", () => {
  it("pages by the view with Page Up and Page Down, goes to the start with Home and the end with End - each clamped", () => {
    expect([offsetByKey({ key: "PageDown" }, H, V, 100), offsetByKey({ key: "PageUp" }, H, V, 400), offsetByKey({ key: "PageDown" }, H, V, 700), offsetByKey({ key: "PageUp" }, H, V, 100)]).toEqual([350, 150, 750, 0]);
    expect([offsetByKey({ key: "Home" }, H, V, 400), offsetByKey({ key: "End" }, H, V, 400)]).toEqual([0, 750]);
    // (a card left at its end - the offset an Infinity - pages up from the end)
    expect(offsetByKey({ key: "PageUp" }, H, V, Infinity)).toBe(500);
  });

  it("goes a line - 19 - with Alt and the arrows; plain arrows, and any other key or chord, stay where they were", () => {
    expect(CARD.line).toBe(19);
    expect([offsetByKey({ key: "ArrowDown", altKey: true }, H, V, 100), offsetByKey({ key: "ArrowUp", altKey: true }, H, V, 100), offsetByKey({ key: "ArrowUp", altKey: true }, H, V, 10), offsetByKey({ key: "ArrowDown", altKey: true }, H, V, 745)]).toEqual([119, 81, 0, 750]);
    for (const e of [{ key: "ArrowDown" }, { key: "ArrowUp" }, { key: "a" }, { key: "PageDown", altKey: true }, { key: "PageDown", ctrlKey: true }, { key: "PageDown", metaKey: true }, { key: "End", shiftKey: true }, { key: "ArrowDown", altKey: true, metaKey: true }]) expect(offsetByKey(e, H, V, 100)).toBeNull();
  });

  it("takes Earlier a screen up and Latest to the end", () => {
    expect([earlierOf(H, V, 600), earlierOf(H, V, 100), earlierOf(H, V, Infinity)]).toEqual([350, 0, 500]);
    expect(latestOf(H, V)).toBe(750);
    expect(latestOf(100, V)).toBe(0);
  });
});

describe("what is new below a card scrolled up", () => {
  it("is so where it grew since it was scrolled up, and is not at its end: the dot on Latest", () => {
    expect([newBelow(100, 1000, 1000, V), newBelow(100, 1000, 1001, V), newBelow(100, 1000, 1200, V)]).toEqual([false, true, true]);
    // (not scrolled up, or scrolled to what is now the end)
    expect(newBelow(undefined, 1000, 1200, V)).toBe(false);
    // (the end of the grown history is 950: scrolled to it, nothing is below; 949, a pixel is)
    expect([newBelow(950, 1000, 1200, V), newBelow(949, 1000, 1200, V)]).toEqual([false, true]);
    expect(newBelow(Infinity, 1000, 1200, V)).toBe(false);
    expect(newBelow(100, undefined, 1200, V)).toBe(false);
  });
});

describe("a scroll glided", () => {
  it("starts where it was, ends where it goes once Meno's base time is up, and is eased between: quick out of the start", () => {
    const g = { from: 100, to: 600, start: 1000 };
    expect(glideAt(g, 1000)).toBe(100);
    expect(glideAt(g, 1000 + SCROLL_MS)).toBe(600);
    expect(glideAt(g, 1000 + SCROLL_MS * 5)).toBe(600);
    const half = glideAt(g, 1000 + SCROLL_MS / 2);
    expect(half).toBeGreaterThan(350);
    expect(half).toBeLessThan(600);
    // (up as well as down)
    expect(glideAt({ from: 600, to: 100, start: 0 }, SCROLL_MS / 2)).toBeLessThan(350);
  });

  it("is under way till its time is up, and not at all where it goes nowhere", () => {
    expect([gliding({ from: 0, to: 10, start: 0 }, SCROLL_MS - 1), gliding({ from: 0, to: 10, start: 0 }, SCROLL_MS), gliding({ from: 5, to: 5, start: 0 }, 1)]).toEqual([true, false, false]);
  });
});

describe("the card the keys scroll", () => {
  it("is the one the pointer is on, else the one read in the column - and, with a PDF under the pointer, whose pages the keys turn, only the pointer's", () => {
    expect(cardForKey(3, 7, false)).toBe(3);
    expect(cardForKey(3, 7, true)).toBe(3);
    expect(cardForKey(null, 7, false)).toBe(7);
    expect(cardForKey(null, 7, true)).toBeNull();
    expect(cardForKey(null, null, false)).toBeNull();
  });
});
