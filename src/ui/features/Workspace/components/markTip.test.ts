import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipFade, tipPlace, tipUnder, TIP_GAP_PX, TIP_MARGIN_PX, type ScreenBox, type TipAt } from "./markTip";

const box = (left: number, top: number, right: number, bottom: number): ScreenBox => ({ left, top, right, bottom });
/** The canvas as seen: 1280 wide, 820 tall, from 40 down - the column over its right 480 where it is open. */
const room = box(0, 40, 1280, 860);
/** Words 300 wide, 20 tall, under a mark 40 wide whose middle is at `x`, its top at `y`. */
function under(x: number, y: number) {
  const mark = box(x - 20, y, x + 20, y + 30);
  return { mark, tip: tipUnder(mark, 300, 20) };
}

describe("what a mark says", () => {
  it("stays under the mark's middle where it can be seen there", () => {
    const { mark, tip } = under(600, 400);
    expect(tip).toEqual(box(450, 430 + TIP_GAP_PX, 750, 450 + TIP_GAP_PX));
    expect(tipPlace(tip, mark, room)).toEqual({ dx: 0, above: false });
  });

  it("moves along to keep clear of the canvas's edge, or of the column's", () => {
    // (a mark by the window's right edge: its words cut off there before)
    const a = under(1250, 400);
    expect(tipPlace(a.tip, a.mark, room).dx).toBe(1280 - TIP_MARGIN_PX - (1250 + 150));
    const b = under(780, 400);
    const seen = { ...room, right: room.right - 480 };
    expect(b.tip.right + tipPlace(b.tip, b.mark, seen).dx).toBe(800 - TIP_MARGIN_PX);
    const c = under(30, 400);
    expect(c.tip.left + tipPlace(c.tip, c.mark, room).dx).toBe(TIP_MARGIN_PX);
  });

  it("goes over the mark where there is no room under it, and keeps its start in view where it is wider than the room", () => {
    const a = under(600, 820);
    expect(tipPlace(a.tip, a.mark, room).above).toBe(true);
    const b = under(600, 400);
    const narrow = box(500, 40, 700, 860);
    expect(b.tip.left + tipPlace(b.tip, b.mark, narrow).dx).toBe(500 + TIP_MARGIN_PX);
  });
});

describe("what a mark says, over it first", () => {
  it("goes over the mark where there is room over it, in the same gap and with the same middle", () => {
    const { mark, tip } = under(600, 400);
    expect(tipPlace(tip, mark, room, TIP_MARGIN_PX, true)).toEqual({ dx: 0, above: true });
    expect(mark.top - TIP_GAP_PX - 20).toBeGreaterThanOrEqual(room.top + TIP_MARGIN_PX);
  });

  it("goes under the mark where there is no room over it and there is under it", () => {
    const { mark, tip } = under(600, 50);
    expect(tipPlace(tip, mark, room, TIP_MARGIN_PX, true).above).toBe(false);
  });

  it("is moved along as before, and without the preference nothing changes", () => {
    const a = under(1250, 400);
    expect(tipPlace(a.tip, a.mark, room, TIP_MARGIN_PX, true).dx).toBe(tipPlace(a.tip, a.mark, room).dx);
    const b = under(600, 400);
    expect(tipPlace(b.tip, b.mark, room, TIP_MARGIN_PX, false)).toEqual(tipPlace(b.tip, b.mark, room));
    expect(tipPlace(b.tip, b.mark, room).above).toBe(false);
  });
});

describe("the page's tip going as it came (TipFade)", () => {
  const MS = 120;
  const a: TipAt = { key: "a", text: "Unusual valence", x: 0, y: 0, w: 1, h: 1 };
  const b: TipAt = { key: "b", text: "Charge", x: 2, y: 0, w: 1, h: 1 };
  /** A tip drawn as React would: what it shows read as it is drawn, its fade followed after. */
  function tip() {
    let woken = 0;
    const fade = new TipFade(MS, () => void woken++);
    const draw = (at: TipAt | null) => {
      const shown = fade.shown(at);
      fade.follow(at !== null);
      return shown;
    };
    return { fade, draw, woken: () => woken };
  }
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("shows nothing and runs no timer while nothing has been pointed at", () => {
    const t = tip();
    expect(t.draw(null)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("pointer leaves: stays with its last words at its last place while it fades, then is gone - nothing left behind", () => {
    const t = tip();
    expect(t.draw(a)).toEqual({ at: a, leaving: false });
    expect(vi.getTimerCount()).toBe(0);
    expect(t.draw(null)).toEqual({ at: a, leaving: true });
    vi.advanceTimersByTime(MS - 1);
    expect(t.fade.shown(null)).toEqual({ at: a, leaving: true });
    expect(t.woken()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(t.woken()).toBe(1);
    expect(t.draw(null)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("drawn again while fading (zoom, scroll, any render) does not start its time over", () => {
    const t = tip();
    t.draw(a);
    t.draw(null);
    vi.advanceTimersByTime(MS / 2);
    t.draw(null);
    t.draw(null);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(MS / 2);
    expect(t.draw(null)).toBeNull();
  });

  it("pointer back on the same thing while it fades: whole again, the same tip - no restart from nothing - and no timer left", () => {
    const t = tip();
    t.draw(a);
    t.draw(null);
    vi.advanceTimersByTime(MS / 2);
    expect(t.draw(a)).toEqual({ at: a, leaving: false });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(MS * 2);
    expect(t.woken()).toBe(0);
    expect(t.draw(a)).toEqual({ at: a, leaving: false });
  });

  it("pointer straight onto another thing: the new tip alone, never the old one fading beside it", () => {
    const t = tip();
    t.draw(a);
    expect(t.draw(b)).toEqual({ at: b, leaving: false });
    // (and so while the old one fades: the new one takes its place)
    t.draw(null);
    vi.advanceTimersByTime(MS / 2);
    expect(t.draw(a)).toEqual({ at: a, leaving: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("its owner gone while it fades: no timer left running", () => {
    const t = tip();
    t.draw(a);
    t.draw(null);
    t.fade.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(MS * 2);
    expect(t.woken()).toBe(0);
  });

  it("is drawn by PageTip from one place for all its callers, faded by CSS in Meno's leaving curve and time, never taking the pointer", () => {
    const dir = join(process.cwd(), "src/ui/features/Workspace");
    const page = readFileSync(join(dir, "components/PageTip.tsx"), "utf8");
    expect(page).toContain("new TipFade(LEAVE_MS");
    expect(page).toContain("const LEAVE_MS = DURATION.quick * 1000");
    expect(page).toContain("var(--ease-meno-leave)");
    expect(page).toContain('pointerEvents: "none"');
    // (each caller tells it what it is about or nothing, never unmounting it to hide it)
    for (const f of ["components/ChemMarks2D.tsx", "components/PositionTip.tsx", "components/NotesMark3D.tsx", "pageGl/PagePlaced.tsx", "pageGl/PageLayer.tsx"]) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).toMatch(/<PageTip\s+at=/);
      expect(src, f).not.toMatch(/&&\s*\(?\s*<PageTip/);
    }
  });
});
