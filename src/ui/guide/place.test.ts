import { describe, expect, it } from "vitest";
import { EDGE, GAP, placeCard } from "./place";

const win = { width: 1280, height: 800 };
const page = { left: 0, top: 40, width: 1280, height: 760 };
const card = { width: 312, height: 160 };

describe("a guide's card", () => {
  it("sits low in the middle of the page where its step points at the page, or at a part not there", () => {
    const at = placeCard(null, page, card, win);
    expect(at.left).toBe((1280 - 312) / 2);
    expect(at.top).toBeGreaterThan(40 + 760 / 2);
    expect(at.top + card.height).toBeLessThanOrEqual(800 - EDGE);
    expect(at.notch).toBeUndefined();
  });

  it("sits under a part of the title bar, its notch under the part's middle", () => {
    const save = { left: 1190, top: 6, width: 28, height: 28 };
    const at = placeCard(save, page, card, win);
    expect(at.top).toBe(6 + 28 + GAP);
    expect(at.left + card.width).toBeLessThanOrEqual(1280 - EDGE);
    expect(at.notch?.side).toBe("top");
    expect(at.left + at.notch!.at).toBe(1190 + 14);
  });

  it("sits to the right of a part on the page, else to its left, its notch level with the part's middle", () => {
    const quickAdd = { left: 400, top: 300, width: 300, height: 44 };
    const right = placeCard(quickAdd, page, card, win);
    expect(right.left).toBe(700 + GAP);
    expect(right.notch).toEqual({ side: "left", at: 322 - right.top });
    const nearEdge = { left: 1000, top: 300, width: 200, height: 44 };
    const left = placeCard(nearEdge, page, card, win);
    expect(left.left).toBe(1000 - GAP - card.width);
    expect(left.notch?.side).toBe("right");
  });

  it("goes under or over a part with no room either side, and stays in the window", () => {
    const wide = { left: 100, top: 300, width: 1080, height: 100 };
    const at = placeCard(wide, page, card, win);
    expect(at.top).toBe(400 + GAP);
    expect(at.notch).toBeUndefined();
    const low = placeCard({ ...wide, top: 680 }, page, card, win);
    expect(low.top).toBe(680 - GAP - card.height);
  });
});
