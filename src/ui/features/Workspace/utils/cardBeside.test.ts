import { describe, expect, it } from "vitest";
import { CARD_CLEAR, cardBeside, type ScreenRect } from "./cardBeside";

const card = { width: 320, height: 196 };
const within = { width: 1280, height: 800 };
const over = (a: ScreenRect, at: { x: number; y: number }) =>
  at.x < a.left + a.width && at.x + card.width > a.left && at.y < a.top + a.height && at.y + card.height > a.top;

describe("a card put beside what it works on", () => {
  it("goes to its right, level with its top, clear of it", () => {
    const box = { left: 40, top: 300, width: 300, height: 100 };
    expect(cardBeside(box, card, within)).toEqual({ x: 340 + CARD_CLEAR, y: 300 });
  });

  it("goes below where there is no room to the right, above where there is none below either, and to the left before that", () => {
    const wide = { left: 100, top: 100, width: 1000, height: 100 };
    expect(cardBeside(wide, card, within)).toEqual({ x: 100, y: 200 + CARD_CLEAR });
    const right = { left: 1000, top: 300, width: 200, height: 450 };
    expect(cardBeside(right, card, within)).toEqual({ x: 1000 - CARD_CLEAR - 320, y: 300 });
    const tall = { left: 20, top: 260, width: 1240, height: 520 };
    expect(cardBeside(tall, card, within)).toEqual({ x: 20, y: 260 - CARD_CLEAR - 196 });
  });

  it("never lies over it where the canvas has room for it anywhere round it, and stays inside the canvas", () => {
    for (let left = 0; left < 1200; left += 97)
      for (let top = 0; top < 760; top += 61)
        for (const [w, h] of [[80, 40], [300, 120], [500, 300]]) {
          const box = { left, top, width: Math.min(w, 1280 - left), height: Math.min(h, 800 - top) };
          const at = cardBeside(box, card, within);
          expect(at.x).toBeGreaterThanOrEqual(0);
          expect(at.y).toBeGreaterThanOrEqual(0);
          expect(at.x + card.width).toBeLessThanOrEqual(within.width);
          expect(at.y + card.height).toBeLessThanOrEqual(within.height);
          const room = box.left + box.width + CARD_CLEAR + card.width <= within.width - 8 || box.top + box.height + CARD_CLEAR + card.height <= within.height - 8 || box.left - CARD_CLEAR - card.width >= 8 || box.top - CARD_CLEAR - card.height >= 8;
          if (room) expect(over(box, at)).toBe(false);
        }
  });
});
