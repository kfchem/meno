import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceDocument } from "./document";
import { restyledDocument } from "./restyle";
import { easeStyle } from "./styleEase";

const ACS = { preset: "acs1996", changes: {} };
const RSC = { preset: "rsc", changes: {} };

afterEach(() => vi.restoreAllMocks());

/** A document in ACS 1996 with a slide and a picture on its page. */
function doc() {
  const d = createWorkspaceDocument();
  d.edit("page", (w) => ({
    ...w,
    style: ACS,
    slides: [{ id: 1, x: 10, y: 20, w: 160, h: 90 }],
    pictures: [{ id: 1, name: "p.png", sha256: "b".repeat(64), media: "image/png" as const, px: [64, 48] as [number, number], x: -10, y: 30, w: 16, h: 12 }],
  }));
  return d;
}

describe("a preset taken without a jump", () => {
  it("eases the bond in over frames, each from the page as it was, ending as the change made at once, one undo step", () => {
    const d = doc();
    const start = d.getState();
    const depth = d.history().undoDepth;
    let clock = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const frames: (() => void)[] = [];
    const widths: number[] = [];
    easeStyle(d, RSC, (go) => frames.push(go));
    while (frames.length) {
      clock += 16;
      widths.push(d.getState().slides![0].w);
      frames.shift()!();
    }
    // (on its way: the slide's width going from where it was to where it ends, never back)
    expect(widths.length).toBeGreaterThan(5);
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1]);
    expect(d.getState()).toEqual(restyledDocument(start, RSC));
    expect(d.history().undoDepth).toBe(depth + 1);
    d.undo();
    expect(d.getState()).toEqual(start);
  });

  it("gives way to an undo during it: the undo stands, the style back as it was", () => {
    const d = doc();
    const start = d.getState();
    const depth = d.history().undoDepth;
    let clock = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const frames: (() => void)[] = [];
    easeStyle(d, RSC, (go) => frames.push(go));
    clock += 48;
    frames.shift()!();
    d.undo();
    while (frames.length) {
      clock += 16;
      frames.shift()!();
    }
    expect(d.getState()).toEqual(start);
    expect(d.history().undoDepth).toBe(depth);
  });

  it("gives way to another edit during it: that edit kept, the style taken as chosen", () => {
    const d = doc();
    let clock = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const frames: (() => void)[] = [];
    easeStyle(d, RSC, (go) => frames.push(go));
    clock += 48;
    frames.shift()!();
    d.edit("add +", (w) => ({ ...w, pluses: [...w.pluses, { id: 9, x: 1, y: 1 }] }));
    while (frames.length) {
      clock += 16;
      frames.shift()!();
    }
    const now = d.getState();
    expect(now.style).toEqual(RSC);
    expect(now.pluses.some((p) => p.id === 9)).toBe(true);
    // (the page as the change at once leaves it: the slide as wide in print)
    expect(now.slides![0].w).toBeCloseTo(160 * (14.4 / 12.2), 9);
  });

  it("is taken at once where the bond prints as long, or the document had no style", () => {
    const d = doc();
    const frames: (() => void)[] = [];
    easeStyle(d, { preset: "acs1996", changes: { bondSpacing: 0.2 } as never }, (go) => frames.push(go));
    expect(frames).toHaveLength(0);
    expect(d.getState().style).toEqual({ preset: "acs1996", changes: { bondSpacing: 0.2 } });
  });
});
