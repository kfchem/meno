import { describe, expect, it } from "vitest";
import { LIVE_AT_PX, LIVE_FROM_PX, PICTURE_MOST_PX, STILL_MS, liveShare, makesNow, pictureKey, pictureQueue, pictureSize, sheetDrawing } from "./sheetPicture";

describe("a text's sheet far off", () => {
  it("is its picture of its own words, not strokes: the picture whole, no live words, at any far zoom", () => {
    // (type 0.2, 1 and 4.5 screen px large: all under where the live words begin)
    for (const px of [0.2, 1, LIVE_FROM_PX]) expect(sheetDrawing(px, false, true)).toEqual({ picture: 1, live: false });
  });

  it("near, is its live words alone; between, the picture fades over them as they take over", () => {
    expect(sheetDrawing(LIVE_AT_PX, false, true)).toEqual({ picture: 0, live: true });
    expect(sheetDrawing(40, false, true)).toEqual({ picture: 0, live: true });
    // (half way between 4.5 and 6 px: the picture at a half over the live words)
    expect(sheetDrawing(5.25, false, true)).toEqual({ picture: 0.5, live: true });
  });

  it("hands over with no step: the picture's share moves by no more than the zoom's step does", () => {
    // (zoomed by 1 % a step from 2 px to 8 px, the share changes at most 6 / 1.5 x 1 % = 4 % a step)
    let was = sheetDrawing(2, false, true).picture;
    for (let px = 2; px < 8; px *= 1.01) {
      const now = sheetDrawing(px, false, true).picture;
      expect(Math.abs(now - was)).toBeLessThanOrEqual(0.041);
      was = now;
    }
    expect(liveShare(0)).toBe(0);
    expect(liveShare(100)).toBe(1);
  });

  it("comes in eased, never at once, once made", () => {
    expect(sheetDrawing(1, false, true, 0.25)).toEqual({ picture: 0.25, live: true });
  });

  it("is its live words while edited, or while it has no picture of its words as they are", () => {
    expect(sheetDrawing(1, true, true)).toEqual({ picture: 0, live: true });
    expect(sheetDrawing(1, false, false)).toEqual({ picture: 0, live: true });
  });
});

describe("a sheet's picture", () => {
  it("is made again as its words, type or width change - never as the zoom does", () => {
    const k = pictureKey("# Notes\nfirst line", 400, 300, 1, true);
    // (the key holds no zoom: the same words at any zoom are the same picture)
    expect(pictureKey("# Notes\nfirst line", 400, 300, 1, true)).toBe(k);
    expect(pictureKey("# Notes\nfirst line!", 400, 300, 1, true)).not.toBe(k);
    expect(pictureKey("# Notes\nfirst line", 420, 300, 1, true)).not.toBe(k);
    expect(pictureKey("# Notes\nfirst line", 400, 300, 1.5, true)).not.toBe(k);
    expect(pictureKey("# Notes\nfirst line", 400, 300, 1, false)).not.toBe(k);
  });

  it("is as large as the sheet is on the screen where its live words take over, in device pixels", () => {
    // (the largest plain sheet at a point a page unit: 80 letters of 0.6 x 9 = 432 wide, 40 lines of 12 = 480 tall;
    // live from 6 px type = 6/9 screen px a unit, x 2 device px = 4/3: 576 x 640 px, x 4 bytes x 4/3 for its smaller copies = 1 966 080)
    expect(pictureSize(432, 480, 9, 2)).toEqual({ width: 576, height: 640, bytes: 1966080 });
    expect(pictureSize(432, 480, 9, 1)).toEqual({ width: 288, height: 320, bytes: 491520 });
  });

  it("is never more than 2048 device pixels a side, however large the sheet", () => {
    // (10000 x 100 at 4/3 a unit is 13334 x 134: made 2048 / 13333.3 as large, 2048 x 21)
    const p = pictureSize(10000, 100, 9, 2);
    expect(p).toEqual({ width: PICTURE_MOST_PX, height: 21, bytes: Math.round((2048 * 21 * 16) / 3) });
    expect(pictureSize(5000, 5000, 9, 3).bytes).toBeLessThanOrEqual(Math.round((2048 * 2048 * 16) / 3));
  });
});

describe("pictures made", () => {
  it("only while the view is still and no press is held", () => {
    expect(makesNow(1000, 1000 - STILL_MS, false)).toBe(true);
    expect(makesNow(1000, 1000 - STILL_MS + 1, false)).toBe(false);
    expect(makesNow(1000, 0, true)).toBe(false);
  });

  it("one a slot, in turn; one not ready waits its turn again; one asked again replaces the first", () => {
    let still = false;
    const slots: Array<() => void> = [];
    const q = pictureQueue(
      () => still,
      (work) => void slots.push(work),
    );
    const made: string[] = [];
    let ready = false;
    q.ask(1, () => (made.push("1 old"), true));
    q.ask(2, () => (ready ? (made.push("2"), true) : false));
    q.ask(1, () => (made.push("1 new"), true));
    expect(q.size()).toBe(2);
    // (moving: nothing made)
    slots.shift()!();
    expect(made).toEqual([]);
    still = true;
    slots.shift()!();
    expect(made).toEqual([]); // (2 first: not ready, back in the queue)
    slots.shift()!();
    expect(made).toEqual(["1 new"]);
    ready = true;
    slots.shift()!();
    expect(made).toEqual(["1 new", "2"]);
    expect(q.size()).toBe(0);
    slots.shift()!();
    expect(slots).toEqual([]);
  });
});
