import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const drawn: { sha: string; page: number; box: number[]; dpi: number }[] = [];
let fail = false;
vi.mock("../../../../lib/pdf/reader", () => ({
  boxPicture: (sha: string, page: number, box: number[], dpi: number) => {
    drawn.push({ sha, page, box, dpi });
    return fail ? Promise.reject(new Error("no")) : Promise.resolve({ png: new Uint8Array([1, 2, 3]), width: 10, height: 10, dpi });
  },
}));

import type { Box } from "../../../../lib/pdf/figures";
import { forgetPictures, KEPT, LENS_MOST, lensDpi, lensPictureOf, lensSize } from "./lensPicture";

const made: string[] = [];
const revoked: string[] = [];
beforeEach(() => {
  forgetPictures();
  drawn.length = 0;
  made.length = 0;
  revoked.length = 0;
  fail = false;
  let n = 0;
  vi.stubGlobal("URL", { createObjectURL: () => made[made.push(`blob:${n++}`) - 1], revokeObjectURL: (u: string) => revoked.push(u) });
});
afterEach(() => vi.unstubAllGlobals());

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("how large a compound's region is shown", () => {
  it("is its own size - a point a pixel - enlarged a little where small, reduced to fit the card's most, its shape kept", () => {
    expect(lensSize([0, 0, 100, 80])).toEqual({ width: 150, height: 120 });
    expect(lensSize([0, 0, 400, 100])).toEqual({ width: LENS_MOST.width, height: 55 });
    const tall = lensSize([10, 10, 60, 410]);
    expect(tall.height).toBe(LENS_MOST.height);
    expect(tall.width / tall.height).toBeCloseTo(50 / 400, 1);
    expect(lensSize([5, 5, 5, 5])).toEqual({ width: 2, height: 2 });
  });

  it("is drawn at the resolution its size on the screen asks - crisp at the card's size, never less than the page's own - in steps, so a little more or less reuses it", () => {
    const box: Box = [0, 0, 100, 80];
    expect(lensDpi(box, { width: 100 }, 1)).toBe(96);
    expect(lensDpi(box, { width: 100 }, 2)).toBe(144);
    expect(lensDpi(box, { width: 101 }, 1)).toBe(lensDpi(box, { width: 100 }, 1));
    expect(lensDpi(box, { width: 10 }, 1)).toBe(72);
    expect(lensDpi([0, 0, 1, 1], { width: 220 }, 3)).toBe(1200);
  });
});

describe("a compound's picture", () => {
  const box: Box = [10, 20, 110, 100];

  it("is asked for once, none until it has come, and then the same picture - the card is there at once", async () => {
    let came = 0;
    expect(lensPictureOf("a", 2, box, 144, () => came++)).toBeNull();
    expect(lensPictureOf("a", 2, box, 144, () => came++)).toBeNull();
    expect(drawn).toEqual([{ sha: "a", page: 2, box: [10, 20, 110, 100], dpi: 144 }]);
    await tick();
    expect(came).toBe(1);
    expect(lensPictureOf("a", 2, box, 144)).toBe("blob:0");
    expect(drawn).toHaveLength(1);
    // (another region, page or resolution is another picture)
    lensPictureOf("a", 3, box, 144);
    lensPictureOf("a", 2, box, 192);
    lensPictureOf("a", 2, [10, 20, 111, 100], 144);
    expect(drawn).toHaveLength(4);
  });

  it("is not kept where it comes after all pictures were let go", async () => {
    lensPictureOf("d", 0, box, 96);
    forgetPictures();
    await tick();
    expect(lensPictureOf("d", 0, box, 96)).toBeNull();
    expect(drawn).toHaveLength(2);
  });

  it("is asked for again where it could not be drawn", async () => {
    fail = true;
    expect(lensPictureOf("b", 0, box, 96)).toBeNull();
    await tick();
    fail = false;
    expect(lensPictureOf("b", 0, box, 96)).toBeNull();
    expect(drawn).toHaveLength(2);
    await tick();
    expect(lensPictureOf("b", 0, box, 96)).toBe("blob:0");
  });

  it("lets go of the oldest past what is kept, the one used last kept", async () => {
    for (let i = 0; i < KEPT; i++) lensPictureOf("c", i, box, 96);
    await tick();
    // (the first used again: the next oldest goes first)
    expect(lensPictureOf("c", 0, box, 96)).not.toBeNull();
    lensPictureOf("c", KEPT, box, 96);
    await tick();
    expect(revoked).toEqual(["blob:1"]);
    expect(lensPictureOf("c", 0, box, 96)).not.toBeNull();
    expect(lensPictureOf("c", 1, box, 96)).toBeNull();
  });
});
