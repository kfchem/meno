import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeClipboard } from "../../../lib/clipboard";
import { withText } from "../../../lib/binary/png";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { ACS_1996, inPoints } from "../../../lib/chem/style";
import { structureInDrop, structureOnClipboard } from "./chem/fromClipboard";
import { pictureDpiFor, pictureItems, rasterFrame, structureInPicture } from "./picture";
import { ballSegmentsFor, tilesOf } from "./render3d";
import type { Model } from "./store/types";
import { readRecord, recordText } from "./utils/copyPaste";

const L = NOMINAL_BOND_LENGTH;
const model: Model = {
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 2, x: L, y: 0, r: 0.9, el: "N", charge: 1 },
  ],
  bonds: [{ id: 3, a: 1, b: 2, order: 1, stereo: "none" }],
};
/** What a picture of `model` carries back: the structure, and the bond as long as ACS 1996 prints it and its labels as large, so that it is converted where pasted into another style. */
const carried = { ...model, bondPt: ACS_1996.bondLengthPt, labelPt: inPoints(ACS_1996.fontSize, ACS_1996) };
const aromatic = { aromaticEnabled: false, aromaticRings: {} };
const PIXEL = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"),
  (c) => c.charCodeAt(0),
);

describe("pictures of a structure", () => {
  it("are Office's clip format and an EMF (and a PNG where there is a page to draw it in), each carrying the structure", async () => {
    const items = await pictureItems(model, aromatic, ACS_1996);
    expect(items.map((i) => i.flavor)).toEqual(["gvml", "emf", "embed"]);
    expect(await structureInPicture(items[0])).toEqual(carried);
    // the record, for the app to make an object for Office out of on Windows
    expect(readRecord(items[2].text!)).toEqual(carried);
  });

  it("of molecules in 3D alone show them, and give them back - turned as they were - when pasted", async () => {
    const solid = {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0 },
        { el: "H", x: 0.76, y: 0.59, z: 0 },
        { el: "H", x: -0.76, y: 0.59, z: 0.3 },
      ],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
      ],
      at: { x: 0, y: 0 },
      turn: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number],
    };
    const part = { atoms: [], bonds: [], molecules3d: [solid] };
    const items = await pictureItems(part, aromatic, ACS_1996);
    expect(items.map((i) => i.flavor)).toEqual(["gvml", "emf", "embed"]);
    expect((await structureInPicture(items[0]))?.molecules3d).toEqual([solid]);
  });

  it("are only those the platform's clipboard takes: no Windows bitmap or object on a Mac", async () => {
    const mac = new Set(["meno", "mol", "text", "gvml", "png"] as const);
    const items = await pictureItems(model, aromatic, ACS_1996, mac);
    expect(items.map((i) => i.flavor)).toEqual(["gvml"]);
  });

  it("give the structure back when pasted, as Office hands the clip format back", async () => {
    const items = await pictureItems(model, aromatic, ACS_1996);
    // only the picture: as Word or PowerPoint put it on the clipboard
    await writeClipboard([items[0]]);
    expect(await structureOnClipboard()).toEqual(carried);
  });

  it("read the structure out of a PNG that carries it, and nothing out of one that does not", async () => {
    const png = withText(PIXEL, "meno-structure", recordText(model));
    expect(await structureInPicture({ flavor: "png", bytes: png })).toEqual(model);
    expect(await structureInPicture({ flavor: "png", bytes: PIXEL })).toBeNull();
    expect(await structureInPicture({ flavor: "gvml", bytes: new Uint8Array(8) })).toBeNull();
  });
});

describe("an object Meno served for Office, as Word or PowerPoint for Mac hand it over", () => {
  // Word for Mac's copy of a structure a Windows Meno served (lib/binary/testdata)
  const storage = new Uint8Array(
    readFileSync(fileURLToPath(new URL("../../../lib/binary/testdata/word-mac-object.cfb", import.meta.url))),
  );

  it("gives the structure back: its record, from the object's storage", async () => {
    const found = (await structureInPicture({ flavor: "object", bytes: storage }))!;
    expect([found.atoms.length, found.bonds.length]).toEqual([8, 6]);
    expect(found.atoms.filter((a) => a.charge).map((a) => [a.el, a.charge])).toEqual([
      ["N", 1],
      ["O", -1],
    ]);
    expect(found.bonds.filter((b) => b.stereo === "up")).toHaveLength(1);
  });

  it("is read from the clipboard before any picture beside it", async () => {
    await writeClipboard([{ flavor: "object", bytes: storage }]);
    const found = (await structureOnClipboard())!;
    expect(found.atoms).toHaveLength(8);
  });

  it("gives nothing back out of storage that holds no structure", async () => {
    expect(await structureInPicture({ flavor: "object", bytes: new Uint8Array(1024) })).toBeNull();
  });
});

describe("a drop", () => {
  it("reads nothing outside the app, where nothing is dragged in", async () => {
    expect(await structureInDrop()).toBeNull();
  });
});

describe("the resolution a copied picture is made at", () => {
  it("is the one asked for, or lower for a picture so large it would come to more than 48 million pixels", () => {
    // (a structure two by one and a half inches: 600 dpi is 1200 by 900 pixels)
    expect(pictureDpiFor(192, 144, 600)).toBe(600);
    expect(pictureDpiFor(192, 144, 1200)).toBe(1200);
    // (a scheme twenty by ten inches at 1200 dpi would be 288 million: lowered, to fit)
    const dpi = pictureDpiFor(1920, 960, 1200);
    expect(dpi).toBeLessThan(1200);
    expect(1920 * 960 * (dpi / 96) ** 2).toBeLessThanOrEqual(48_000_000);
    expect(1920 * 960 * ((dpi + 1) / 96) ** 2).toBeGreaterThan(48_000_000);
  });

  it("is drawn at the drawing's own scale: its pixels whole, the view widened to them, not the drawing squeezed", () => {
    // (Wiley's size of a drawing 278.888 by 145.26 CSS pixels, as createSVG writes it)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.4 -2.2 17.4305 9.07875" width="278.888" height="145.26" fill="none"><line x1="0" y1="0" x2="1" y2="0" /></svg>`;
    const frame = rasterFrame(svg, 600);
    expect(frame).toMatchObject({ width: 1744, height: 908, dpi: 600 });
    const head = /<svg[^>]*>/.exec(frame.svg)![0];
    expect(head).toContain(' width="1744" height="908"');
    const view = / viewBox="([^"]+)"/.exec(head)![1].split(" ").map(Number);
    // (as many pixels to the unit as at 600 dpi, across and down alike, from the same corner)
    const perUnit = (278.888 / 17.4305) * (600 / 96);
    expect(view.slice(0, 2)).toEqual([-0.4, -2.2]);
    expect(1744 / view[2]).toBeCloseTo(perUnit, 9);
    expect(908 / view[3]).toBeCloseTo(perUnit, 9);
    // (what is left over, less than a pixel)
    expect((view[2] - 17.4305) * perUnit).toBeLessThan(1);
    expect((view[3] - 9.07875) * perUnit).toBeLessThan(1);
    expect(frame.svg.endsWith("<line x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\" /></svg>")).toBe(true);
    // (one so large it is made at a lower resolution, to fit)
    const big = rasterFrame(svg.replace('width="278.888" height="145.26"', 'width="1920" height="960"'), 1200);
    expect(big.dpi).toBe(pictureDpiFor(1920, 960, 1200));
    expect(big.width).toBe(Math.ceil(1920 * (big.dpi / 96)));
  });
});

describe("molecules in 3D drawn for a picture, in tiles", () => {
  it("cuts a picture into tiles that cover it once, none larger than asked", () => {
    const tiles = tilesOf(5000, 2100, 2048);
    expect(tiles).toEqual([
      { x: 0, y: 0, w: 2048, h: 2048 },
      { x: 2048, y: 0, w: 2048, h: 2048 },
      { x: 4096, y: 0, w: 904, h: 2048 },
      { x: 0, y: 2048, w: 2048, h: 52 },
      { x: 2048, y: 2048, w: 2048, h: 52 },
      { x: 4096, y: 2048, w: 904, h: 52 },
    ]);
    expect(tiles.reduce((a, t) => a + t.w * t.h, 0)).toBe(5000 * 2100);
    // (one that fits is one tile)
    expect(tilesOf(300, 200, 2048)).toEqual([{ x: 0, y: 0, w: 300, h: 200 }]);
  });
});

describe("a ball in a picture", () => {
  it("has as many sides as keep its outline a circle to the eye, within a budget", () => {
    // (small, as before)
    expect(ballSegmentsFor(20, 100)).toBe(48);
    // (hundreds of pixels across - a 1200 dpi picture - finer)
    const n = ballSegmentsFor(240, 100);
    expect(n).toBeGreaterThan(80);
    expect(240 * (1 - Math.cos(Math.PI / n))).toBeLessThanOrEqual(0.15);
    // (never past the most, and coarser for very many balls - but never coarser than before)
    expect(ballSegmentsFor(1e6, 1)).toBe(256);
    expect(ballSegmentsFor(240, 30_000)).toBe(48);
    expect(ballSegmentsFor(240, 2000) ** 2 * 2000).toBeLessThanOrEqual(20_000_000 + 2 * 2000 * 100);
  });
});
