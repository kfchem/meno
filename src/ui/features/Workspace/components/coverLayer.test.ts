import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pageHtmlLayerStyle, viewBesideColumn } from "./coverLayer";
import { COLUMN_NARROWEST, COLUMN_WIDTH, columnWidthFor, TABLE_COLUMN_WIDTH } from "../utils/texts";

const size = { width: 1280, height: 800 };

describe("the column's width", () => {
  it("is three quarters of the canvas for a PDF, a text's own for a text, as dragged once dragged - within its least and most", () => {
    expect(columnWidthFor(1280, true, null)).toBe(960);
    expect(columnWidthFor(1280, false, null)).toBe(COLUMN_WIDTH);
    expect(columnWidthFor(1280, true, 500)).toBe(500);
    expect(columnWidthFor(1280, true, 5000)).toBeCloseTo(1280 * 0.85);
    expect(columnWidthFor(1280, false, 10)).toBe(COLUMN_NARROWEST);
    // (a set's table: as wide as its columns, until dragged - and never wider than the canvas lets it)
    expect(columnWidthFor(1280, "table", null)).toBe(TABLE_COLUMN_WIDTH);
    expect(columnWidthFor(600, "table", null)).toBeCloseTo(600 * 0.85);
  });
});

describe("the view as the column opens on a PDF", () => {
  // (the view at zoom 2, its middle at the page's origin: 640 by 400 of the page seen)
  const view = { zoom: 2, x: 0, y: 0 };

  it("is left as it is where the PDF will be all in what is left in view", () => {
    // (the column covering 960 of 1280: 160 of the page left in view, once the view has followed by 240)
    const left = 960 / 2 / 2 - 320;
    expect(viewBesideColumn(view, size, { now: 0, final: 960 }, { x0: left + 30, x1: left + 100, y0: -50, y1: 50 })).toBeNull();
    // (one that will be under the column: brought out)
    expect(viewBesideColumn(view, size, { now: 0, final: 960 }, { x0: left + 200, x1: left + 260, y0: -50, y1: 50 })).not.toBeNull();
  });

  it("is made smaller, never larger, so that the PDF is all in what is left, in its middle once the view has followed", () => {
    const b = { x0: -150, x1: 150, y0: -210, y1: 210 };
    const to = viewBesideColumn(view, size, { now: 0, final: 960 }, b)!;
    expect(to.zoom).toBeLessThan(view.zoom);
    // (what the following adds: half of what the column comes to cover)
    const x = to.x + 960 / 2 / to.zoom;
    // (the middle of what is left in view: 160 pixels right of the canvas's left)
    const middle = x - size.width / 2 / to.zoom + (size.width - 960) / 2 / to.zoom;
    expect(middle).toBeCloseTo(0);
    expect((b.x1 - b.x0) * to.zoom).toBeLessThanOrEqual(size.width - 960);
    // (from a text's column already open, as far as is left to follow)
    const from = viewBesideColumn(view, size, { now: 440, final: 960 }, b)!;
    expect(from.x + (960 - 440) / 2 / from.zoom).toBeCloseTo(x);
    // (a tiny PDF out of view: brought in, not made larger)
    const far = viewBesideColumn(view, size, { now: 0, final: 960 }, { x0: 500, x1: 501, y0: 0, y1: 1 })!;
    expect(far.zoom).toBe(view.zoom);
  });
});

// What is drawn on the page in HTML - a stereo label, a measurement's value,
// a chip, a card - never stands over the panels, cards and menus beside or
// over the page, however high its zIndexRange: it is all in one layer, its
// own stacking context, clipped to the canvas.
describe("the page's HTML, under what is beside and over the page", () => {
  it("is laid in a layer of its own stacking context, clipped to the canvas, cut off at the column", () => {
    expect(pageHtmlLayerStyle(0)).toEqual({ isolation: "isolate", overflow: "hidden" });
    expect(pageHtmlLayerStyle(240)).toEqual({ isolation: "isolate", overflow: "hidden", clipPath: "inset(0 240px 0 0)" });
    const workspace = readFileSync(join(__dirname, "..", "Workspace.tsx"), "utf8");
    expect(workspace).toMatch(/ref=\{setHtmlLayer\}[^>]*style=\{pageHtmlLayerStyle\(cover\)\}/);
  });

  it("is put in that layer however it is drawn: drei's Html only through PageHtml, and PageHtml into the layer", () => {
    const ui = join(__dirname, "..", "..", "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(ui);
    const htmlUsers = files.filter((f) => /<Html[\s>]/.test(readFileSync(f, "utf8")));
    expect(htmlUsers.map((f) => f.slice(ui.length + 1))).toEqual([join("features", "Workspace", "components", "PageHtml.tsx")]);
    expect(readFileSync(join(__dirname, "PageHtml.tsx"), "utf8")).toMatch(/portal: layer/);
  });
});
