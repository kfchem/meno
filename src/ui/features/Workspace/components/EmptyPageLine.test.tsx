import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import EmptyPageLine, { EMPTY_PAGE_LINE, EMPTY_PAGE_LINES } from "./EmptyPageLine";
import { comeInFor, EMPTY_PAGE_MARK, emptyPageMarkMotion, markUnderPointer, pointerInsideMark, pointerRippleMotion } from "../utils/emptyPage";

// The empty page's mark and its two lines (docs/WORKSPACE.md, *First steps*). Vitest runs in Node, with no page to mount on: the mark is
// drawn by the server's renderer, and what it is told to do is read from the elements it is made of.

const system = vi.hoisted(() => ({ lessMotion: false }));
vi.mock("motion/react", async (actual) => ({ ...(await actual<typeof import("motion/react")>()), useReducedMotion: () => system.lessMotion }));

/** How strongly a part is seen, at rest: its own opacity under its group's (the part is drawn at its brightest, held down by the group). */
function seen(html: string, part: string): number {
  const m = html.match(new RegExp(`<g style="opacity:([\\d.]+)"><circle data-mark="${part}"[^>]* opacity="([\\d.]+)"`));
  if (!m) throw new Error(`no ${part}`);
  return Number(m[1]) * Number(m[2]);
}

describe("the empty page's mark", () => {
  it("comes in only once the page has been empty, with nothing on its way, for a still while - and then fades in", () => {
    system.lessMotion = false;
    expect(renderToString(<EmptyPageLine show />)).not.toContain("data-empty-page-line");
    expect(EMPTY_PAGE_MARK.still).toBeGreaterThan(0);
    const html = renderToString(<EmptyPageLine show still={0} />);
    expect(html).toMatch(/data-empty-page-line[^>]*style="[^"]*opacity:0/);
    expect(comeInFor(false)).toBe(EMPTY_PAGE_MARK.comeIn);
    // (where the system asks for less motion: no fade - the same still while)
    expect(comeInFor(true)).toBe(0);
  });

  it("counts its rounds from when it has come in, so that the first round is seen", () => {
    const { ripples, dip } = emptyPageMarkMotion();
    expect(ripples[0].transition.scale.delay).toBeCloseTo(EMPTY_PAGE_MARK.comeIn + EMPTY_PAGE_MARK.first);
    expect(dip.transition.delay).toBeCloseTo(EMPTY_PAGE_MARK.comeIn + EMPTY_PAGE_MARK.first);
  });

  it("at rest is a small dot with one faint thin ring round it, in Meno's colour; the ripples are not seen", () => {
    system.lessMotion = false;
    const html = renderToString(<EmptyPageLine show still={0} />);
    expect(html).toContain('width="40"');
    expect(html).toContain("text-accel-base");
    expect(html).toMatch(/<circle data-mark="ring" cx="20" cy="20" r="9"/);
    expect(html).toMatch(/<circle data-mark="dot" cx="20" cy="20" r="2" fill="currentColor" stroke="none"/);
    expect(seen(html, "ring")).toBeCloseTo(0.25);
    expect(seen(html, "dot")).toBeCloseTo(0.5);
    expect(html).not.toContain("pointer-ripple");
    const ripples = html.match(/<circle data-mark="ripple"[^>]*>/g) ?? [];
    expect(ripples).toHaveLength(2);
    for (const r of ripples) expect(r).toMatch(/opacity:0/);
  });

  it("in a round, ripples twice: the second a double-click after the first, each born at the dot and spreading to the edge as it fades", () => {
    const { ripples, dip } = emptyPageMarkMotion();
    const [first, second] = ripples;
    expect(ripples).toHaveLength(2);
    expect(second.transition.scale.delay - first.transition.scale.delay).toBeCloseTo(EMPTY_PAGE_MARK.second);
    expect(second.transition.opacity.delay).toBeGreaterThan(first.transition.opacity.delay);
    for (const r of ripples) {
      expect(r.scale).toEqual([EMPTY_PAGE_MARK.ripple.from / EMPTY_PAGE_MARK.ripple.to, 1]);
      expect(Math.max(...r.opacity)).toBe(EMPTY_PAGE_MARK.ripple.opacity);
    }
    // (the dot dips at each click: twice, the second as far after the first)
    expect(dip.scale.filter((s) => s < 1)).toHaveLength(2);
    expect(dip.transition.times[3]! * dip.transition.duration).toBeCloseTo(EMPTY_PAGE_MARK.second);
  });

  it("begins and ends each round at rest, so nothing jumps", () => {
    const { ripples, dip, rest } = emptyPageMarkMotion();
    for (const r of ripples) {
      expect(r.opacity[0]).toBe(rest.ripple.opacity);
      expect(r.opacity[r.opacity.length - 1]).toBe(rest.ripple.opacity);
      expect(r.scale[0]).toBe(rest.ripple.scale);
    }
    expect(dip.scale[0]).toBe(rest.dot.scale);
    expect(dip.scale[dip.scale.length - 1]).toBe(rest.dot.scale);
  });

  it("plays three rounds a few seconds apart, then rests", () => {
    const { ripples, dip } = emptyPageMarkMotion();
    for (const t of [dip.transition, ...ripples.flatMap((r) => [r.transition.scale, r.transition.opacity])]) {
      expect(t.repeat).toBe(2);
      expect(t.duration + t.repeatDelay).toBe(EMPTY_PAGE_MARK.every);
      expect(t.repeatDelay).toBeGreaterThan(0);
    }
  });

  it("where the system asks for less motion, only rests: no ripples, the dot still", () => {
    system.lessMotion = true;
    try {
      const html = renderToString(<EmptyPageLine show still={0} />);
      expect(html).not.toContain('data-mark="ripple"');
      expect(html.match(/<circle data-mark="dot"[^>]*>/)?.[0]).not.toContain("scale(");
      expect(seen(html, "ring")).toBeCloseTo(0.25);
    } finally {
      system.lessMotion = false;
    }
  });

  it("says the same two lines under it, and the whole sentence to a screen reader", () => {
    const html = renderToString(<EmptyPageLine show still={0} />);
    expect(EMPTY_PAGE_LINES).toEqual(["Double-click to add", "or drop a file"]);
    expect(html).toContain(`>${EMPTY_PAGE_LINES[0]}</span>`);
    expect(html).toContain(`>${EMPTY_PAGE_LINES[1]}</span>`);
    expect(html).toContain(`aria-label="${EMPTY_PAGE_LINE}"`);
    expect(html).toContain("pointer-events-none");
  });
});

describe("the empty page's mark under a resting pointer", () => {
  const asleep = { awake: false, born: 0 };

  it("is inside within the ripples' edge and a little slack, and outside beyond it", () => {
    expect(pointerInsideMark(0, 0)).toBe(true);
    expect(pointerInsideMark(EMPTY_PAGE_MARK.ripple.to, 0)).toBe(true);
    expect(pointerInsideMark(12, 12)).toBe(true);
    expect(pointerInsideMark(0, -EMPTY_PAGE_MARK.awake.reach - 1)).toBe(false);
    expect(pointerInsideMark(30, 4)).toBe(false);
  });

  it("wakes as the pointer comes in, with one ripple born; stays awake and still while it rests there; sleeps as it leaves", () => {
    const woken = markUnderPointer(asleep, true, false);
    expect(woken).toEqual({ awake: true, born: 1 });
    expect(markUnderPointer(woken, true, false)).toBe(woken);
    const slept = markUnderPointer(woken, false, false);
    expect(slept).toEqual({ awake: false, born: 1 });
    expect(markUnderPointer(slept, false, false)).toBe(slept);
    expect(markUnderPointer(slept, true, false)).toEqual({ awake: true, born: 2 });
  });

  it("where the system asks for less motion, only brightens: no ripple is born", () => {
    expect(markUnderPointer(asleep, true, true)).toEqual({ awake: true, born: 0 });
  });

  it("bears its ripple as a click of a round does, once and at once - a ripple of its own beside a round that is playing", () => {
    const one = pointerRippleMotion();
    const [ofRound] = emptyPageMarkMotion().ripples;
    expect(one.scale).toEqual(ofRound!.scale);
    expect(one.opacity).toEqual(ofRound!.opacity);
    expect(one.transition.scale.ease).toEqual(ofRound!.transition.scale.ease);
    expect(one.transition.scale.duration).toBe(ofRound!.transition.scale.duration);
    expect(one.transition.scale).not.toHaveProperty("repeat");
    expect(one.transition.scale).not.toHaveProperty("delay");
  });

  it("brightens the dot and the ring past rest", () => {
    expect(EMPTY_PAGE_MARK.awake.dot).toBeGreaterThan(EMPTY_PAGE_MARK.dot.opacity);
    expect(EMPTY_PAGE_MARK.awake.ring).toBeGreaterThan(EMPTY_PAGE_MARK.ring.opacity);
  });
});
