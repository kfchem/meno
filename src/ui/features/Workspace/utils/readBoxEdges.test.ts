/**
 * The edges held beside readFigure.ts, `readBox` - a figure of a PDF's page that is a picture, read by Meno: only a figure with a picture
 * is drawn and traced; its pixels lie from the box's top left on whole pixels of the resolution it was drawn at; the chosen plugin (never
 * one the catalogue only lists) is offered by name on a failure and run only when asked; a lone atom is no structure; a picture read,
 * drawn once, is not asked drawn again. (Found in review.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// (in the app: the PDF reader's figure, its box drawn as a picture, the picture's pixels - all given by the test)
const given = vi.hoisted(() => ({
  drawn: { paths: [], letters: [], pictures: [] as number[][], pixels: [] as ([number, number] | null)[] } as { paths: unknown[]; letters: unknown[]; pictures: number[][]; pixels?: ([number, number] | null)[] },
  pixels: null as ImageData | null,
  dpi: 300,
  shots: 0,
  plugin: { chosen: undefined as { name: string } | undefined, could: undefined as { name: string } | undefined, asked: 0 },
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: () => Promise.resolve(given.drawn) }));
vi.mock("../../../../lib/pdf/reader", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/pdf/reader")>()),
  boxPicture: () => {
    given.shots++;
    return Promise.resolve({ png: new Uint8Array([137, 80, 78, 71]), width: given.pixels!.width, height: given.pixels!.height, dpi: given.dpi });
  },
}));
vi.mock("./pictures", () => ({ picturePng: () => Promise.resolve(new Uint8Array([137])), pngPixels: () => Promise.resolve(given.pixels) }));
vi.mock("../../../../lib/roles/worker", () => ({
  chemWorker: () => {
    given.plugin.asked++;
    return Promise.reject(new Error("the plugin was run"));
  },
  rolePlugin: () => given.plugin.chosen ?? given.plugin.could,
  roleChosen: () => given.plugin.chosen,
}));

import { readBox } from "./readFigure";
import { pictureResult } from "./figures";
import { figureRead, type FigureJob } from "./structuresRead";

type Pt = [number, number];
function drawing(side: number, bond: number, w: number): ImageData {
  const c = side / 2;
  const h = Array.from({ length: 6 }, (_, k) => [c + bond * Math.sin((k * Math.PI) / 3), c - bond * Math.cos((k * Math.PI) / 3)] as Pt);
  const lines = h.map((p, k) => [p, h[(k + 1) % 6]] as [Pt, Pt]);
  const data = new Uint8ClampedArray(side * side * 4);
  const on = (x: number, y: number) =>
    lines.some(([p, q]) => {
      const d = [q[0] - p[0], q[1] - p[1]];
      const t = Math.min(Math.max(((x - p[0]) * d[0] + (y - p[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]), 0), 1);
      return Math.hypot(x - (p[0] + t * d[0]), y - (p[1] + t * d[1])) <= w / 2;
    });
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      let n = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (on(x + (i + 0.5) / 4, y + (j + 0.5) / 4)) n++;
      const v = Math.round(255 * (1 - n / 16));
      data.set([v, v, v, 255], 4 * (y * side + x));
    }
  return { width: side, height: side, data, colorSpace: "srgb" } as ImageData;
}

const SHA = "d".repeat(64);
// (a box whose left is not on the grid of 300-dpi pixels: 100.2 / 0.24 = 417.5)
const BOX: [number, number, number, number] = [100.2, 50.3, 148.2, 98.3];
beforeEach(() => {
  given.drawn = { paths: [], letters: [], pictures: [BOX], pixels: [[200, 200]] };
  given.pixels = drawing(200, 60, 2.5);
  given.dpi = 300;
  given.shots = 0;
  given.plugin = { chosen: undefined, could: undefined, asked: 0 };
});

describe("a figure of a PDF's page read by Meno", () => {
  it("is drawn and traced only where it holds a picture: a figure with none is said not to be a structure, nothing drawn", async () => {
    given.drawn = { paths: [], letters: [], pictures: [], pixels: [] };
    expect(await readBox(SHA, 0, BOX)).toEqual({ none: "No structure is drawn there." });
    expect(given.shots).toBe(0);
  });

  it("lies on the page from its box's top left on whole pixels of the resolution it was drawn at: a box moved within a pixel gives the same places", { timeout: 60_000 }, async () => {
    // (300 dpi: a pixel is 0.24 of a point; the grid's cell for the left is 100.08 to 100.32 and for the top 50.16 to 50.40)
    const on: [number, number, number, number] = [100.08, 50.16, 148.08, 98.16];
    const within: [number, number, number, number] = [100.296, 50.376, 148.296, 98.376];
    const places = async (box: [number, number, number, number]) => {
      const read = await readBox(SHA, 3, box);
      if ("none" in read) throw new Error(read.none);
      expect(read.model.atoms).toHaveLength(6);
      expect(read.model.atoms.every((a) => a.seen!.page === 3 && a.seen!.sha256 === SHA)).toBe(true);
      return read.model.atoms.map((a) => [a.seen!.x, a.seen!.y]);
    };
    const [p, q] = [await places(on), await places(within)];
    expect(given.shots).toBe(2);
    p.forEach(([x, y], i) => {
      expect(q[i][0]).toBeCloseTo(x, 6);
      expect(q[i][1]).toBeCloseTo(y, 6);
    });
    // (and the next cell, a pixel on, moves them a pixel)
    const next = await places([100.32 + 0.01, 50.16, 148.32, 98.16]);
    expect(next[0][0] - p[0][0]).toBeCloseTo(0.24, 6);
  });

  it("names the plugin chosen only where Meno reads nothing - and not one the catalogue only lists, though it would be used if asked", { timeout: 30_000 }, async () => {
    given.pixels = drawing(60, 18, 1.5);
    given.plugin.chosen = { name: "A chosen reader" };
    expect(await readBox(SHA, 0, BOX)).toEqual({ none: "The picture is drawn too small to read.", plugin: "A chosen reader" });
    given.plugin.chosen = undefined;
    given.plugin.could = { name: "A listed reader" };
    expect(await readBox(SHA, 0, BOX)).toEqual({ none: "The picture is drawn too small to read." });
    expect(given.plugin.asked).toBe(0);
  });

  it("does not name it on a structure read", { timeout: 30_000 }, async () => {
    given.plugin.chosen = { name: "A chosen reader" };
    const read = await readBox(SHA, 0, BOX);
    expect("none" in read).toBe(false);
    expect("plugin" in read).toBe(false);
  });

  it("runs the plugin when asked, `by`, and not before", { timeout: 30_000 }, async () => {
    given.plugin.chosen = { name: "A chosen reader" };
    await readBox(SHA, 0, BOX);
    expect(given.plugin.asked).toBe(0);
    await expect(readBox(SHA, 0, BOX, undefined, "plugin")).rejects.toThrow("the plugin was run");
    expect(given.plugin.asked).toBe(1);
  });
});

describe("a picture read, made a structure", () => {
  it("is none where all that is left is a lone atom", () => {
    const read = { atoms: [{ x: 0, y: 0, label: "O" }], bonds: [], bond: 30, left: { letters: [] } };
    expect("none" in pictureResult(read, (x, y) => ({ sha256: SHA, page: 0, x, y, bond: 30 }))).toBe(true);
  });
});

describe("a picture read ahead for the lens, drawn once", () => {
  it("is not asked drawn again once it has been - though it gave no structure", () => {
    const blank = new Uint8ClampedArray(60 * 60 * 4).fill(255);
    const job: FigureJob = {
      objects: [],
      text: null,
      figures: [BOX],
      k: 0,
      drawn: { paths: [], letters: [], pictures: [BOX], pixels: [[200, 200]] },
      sha256: SHA,
      page: 0,
      picture: { width: 60, height: 60, data: blank.buffer, at: { scale: 0.24, x: 100, y: 50 }, known: [] },
    };
    const read = figureRead(job);
    expect(read.structures).toEqual([]);
    expect(read.picture).toBeUndefined();
  });
});
