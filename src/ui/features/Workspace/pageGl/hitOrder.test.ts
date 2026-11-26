import { describe, expect, it } from "vitest";
import { drawingUnder } from "../components/drawingUnder";
import { NAME_DOWN, TAB_INSET } from "../workflow/look";
import { frameTabParts, type FrameTab } from "./frameParts";
import { PageRegions, type Beneath } from "./PageHits";

// A set's frame, its tab's band along its top (2 * NAME_DOWN high) - and a member in it whose top atom lies in the band, under the
// tab's words, with the selection's turn handle on the frame's top edge, as a member's handle lies (0.75 of a bond over its top).
const box = { x0: 0, y0: -8, x1: 12, y1: 0 };
const band = 2 * NAME_DOWN;
const set: FrameTab = { key: "set:1", box, tone: "rest", tab: { icon: "copies", name: "Input", status: "1 structure" }, nameOnly: true, edges: true };
const top = { id: 1, x: TAB_INSET + 0.4, y: -band + 0.2 };
const atoms = [top, { id: 2, x: top.x + 1.56, y: top.y - 0.15 }];
const bonds = [{ a: 1, b: 2 }];
const handle = { x: 4, y: 0, reach: 12 / 20 };
const zoom = 20;

/** The page's regions with the frame's laid as FrameTabs lays them - giving way to the drawing - and, where given, where the drawing takes a press. */
function regions(beneath?: Beneath): PageRegions {
  const all = new PageRegions();
  all.add({ regions: frameTabParts([set]).regions, on: {}, yields: true });
  if (beneath) all.under({ current: beneath });
  return all;
}

const page = regions((x, y) => drawingUnder(atoms, bonds, handle, { x, y }));
/** Which part takes a press at (x, y): the frame's (its key and part) or the drawing's - the canvas, `null`. */
const takes = (all: PageRegions, x: number, y: number) => {
  const hit = all.at(x, y, zoom);
  return hit ? `${hit.key} ${hit.part}` : null;
};

describe("which takes a press where a member lies over its set's tab or edge", () => {
  it("the selection's turn handle, lying on the frame's top edge, before the frame's tab and edge", () => {
    expect(takes(regions(), handle.x, handle.y)).toMatch(/^set:1 /);
    expect(takes(page, handle.x, handle.y)).toBeNull();
    expect(takes(page, handle.x + 0.3, handle.y - 0.2)).toBeNull();
  });

  it("an atom or a bond lying under the tab's words before the tab: a press and a double-click are the drawing's", () => {
    expect(takes(regions(), top.x, top.y)).toBe("set:1 tab");
    expect(takes(page, top.x, top.y)).toBeNull();
    // (on the bond, in the band, between its atoms' reach)
    const onBond = { x: top.x + 0.4 * 1.56, y: top.y - 0.4 * 0.15 };
    expect(onBond.y).toBeGreaterThan(-band);
    expect(drawingUnder(atoms, [], null, onBond)).toBe(false);
    expect(takes(page, onBond.x, onBond.y)).toBeNull();
  });

  it("the tab still takes a press - and drags the set - wherever nothing of a member lies on it", () => {
    expect(takes(page, 9, -band / 2)).toBe("set:1 tab");
    expect(takes(page, top.x, -0.1)).toBe("set:1 tab");
    expect(drawingUnder(atoms, bonds, handle, { x: 9, y: -band / 2 })).toBe(false);
    // (an edge away from the member is the frame's, to size it)
    expect(takes(page, box.x1, -4)).toMatch(/^set:1 edge:/);
  });
});
