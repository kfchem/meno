import { describe, expect, it, vi } from "vitest";

// (in the app, a picture's bytes given by the test - a drawing, made here - and the plugin that reads pictures chosen or not)
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: () => Promise.reject(new Error("no app in tests")) }));
const pixels = vi.hoisted(() => ({ current: null as ImageData | null }));
vi.mock("./pictures", () => ({ picturePng: () => Promise.resolve(new Uint8Array([137, 80, 78, 71])), pngPixels: () => Promise.resolve(pixels.current) }));
const chosen = vi.hoisted(() => ({ current: undefined as { name: string } | undefined, asked: 0 }));
vi.mock("../../../../lib/roles/worker", () => ({
  chemWorker: () => {
    chosen.asked++;
    return Promise.reject(new Error("the plugin is never run unasked"));
  },
  rolePlugin: () => chosen.current,
  roleChosen: () => chosen.current,
}));

import { readPicture } from "./readFigure";

type Pt = [number, number];
/** A picture `side` square of lines `w` wide, black on white, each pixel as much ink as of it is covered (sixteen samples). */
function drawing(side: number, lines: [Pt, Pt][], w: number): ImageData {
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

/** A hexagon of bonds `bond` long round the picture's middle. */
function ring(side: number, bond: number): [Pt, Pt][] {
  const c = side / 2;
  const h = Array.from({ length: 6 }, (_, k) => [c + bond * Math.sin((k * Math.PI) / 3), c - bond * Math.cos((k * Math.PI) / 3)] as Pt);
  return h.map((p, k) => [p, h[(k + 1) % 6]]);
}

const PICTURE = { sha256: "c".repeat(64), media: "image/png" } as const;

describe("a picture read by Meno", () => {
  it("is traced and read by Meno's own reader, each atom tied to its place in the picture; the plugin is not asked", { timeout: 30_000 }, async () => {
    pixels.current = drawing(200, ring(200, 60), 2.5);
    chosen.current = { name: "A picture reader" };
    chosen.asked = 0;
    const read = await readPicture(PICTURE);
    expect("none" in read).toBe(false);
    if ("none" in read) return;
    expect(read.model.atoms).toHaveLength(6);
    expect(read.model.atoms.every((a) => a.el === "C")).toBe(true);
    expect(read.model.bonds).toHaveLength(6);
    expect(read.model.atoms.every((a) => a.seen?.sha256 === PICTURE.sha256)).toBe(true);
    expect(chosen.asked).toBe(0);
  });

  it("where Meno reads nothing - a picture drawn too small - says why, and offers the plugin chosen to read pictures by name, never running it", { timeout: 30_000 }, async () => {
    pixels.current = drawing(60, ring(60, 18), 1.5);
    chosen.current = { name: "A picture reader" };
    chosen.asked = 0;
    expect(await readPicture(PICTURE)).toEqual({ none: "The picture is drawn too small to read.", plugin: "A picture reader" });
    expect(chosen.asked).toBe(0);
  });

  it("offers no plugin where none is chosen", { timeout: 30_000 }, async () => {
    pixels.current = drawing(60, ring(60, 18), 1.5);
    chosen.current = undefined;
    expect(await readPicture(PICTURE)).toEqual({ none: "The picture is drawn too small to read." });
  });
});
