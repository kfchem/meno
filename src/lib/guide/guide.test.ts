import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeGuide, guideNotice, keyOnGuide, nextStep, NOTICED_MS, showGuide, shownStep, useGuide } from "./guide";
import { FIRST_STEPS } from "./steps";
import { MANIFESTS } from "../plugins/known";

describe("Meno's first steps", () => {
  beforeEach(() => useGuide.setState({ open: null }));
  afterEach(() => vi.useRealTimers());

  it("are Meno's own, pointing at what Meno names - and name no plugin", () => {
    expect(FIRST_STEPS.map((s) => [s.at, s.until])).toEqual([
      ["page", "quick-add"],
      ["quick-add", undefined],
      ["structure", "selected"],
      ["menu", undefined],
      ["save", undefined],
      [undefined, undefined],
    ]);
    const names = MANIFESTS.flatMap((m) => [m.id, m.name]).map((n) => n.toLowerCase());
    for (const s of FIRST_STEPS) for (const n of names) expect(`${s.title} ${s.text}`.toLowerCase(), n).not.toMatch(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
  });

  it("are never shown of themselves - only when asked (Settings, General, First steps)", () => {
    expect(useGuide.getState().open).toBeNull();
    showGuide();
    expect(useGuide.getState().open).toBe(0);
    expect(shownStep()?.step.title).toBe("Welcome to Meno");
  });

  it("go on a step at a time, and once closed - gone through or skipped - nothing opens after them", () => {
    showGuide();
    nextStep();
    expect(useGuide.getState().open).toBe(1);
    closeGuide();
    expect(useGuide.getState().open).toBeNull();
    showGuide();
    for (let i = 0; i < FIRST_STEPS.length; i++) nextStep();
    expect(useGuide.getState().open).toBeNull();
  });

  it("go on by themselves, a moment after the chemist does what a step waits for - nothing else", () => {
    vi.useFakeTimers();
    showGuide();
    guideNotice("menu");
    vi.advanceTimersByTime(NOTICED_MS + 1);
    expect(useGuide.getState().open).toBe(0);
    guideNotice("quick-add");
    expect(useGuide.getState().open).toBe(0);
    vi.advanceTimersByTime(NOTICED_MS + 1);
    expect(useGuide.getState().open).toBe(1);
    // (a step gone on from by hand meanwhile is not gone on from again)
    nextStep();
    guideNotice("selected");
    nextStep();
    vi.advanceTimersByTime(NOTICED_MS + 1);
    expect(useGuide.getState().open).toBe(3);
  });
});

// (the maintainer, 2026-10-13: Escape on the first steps does what Skip does)
describe("Escape on the first steps", () => {
  beforeEach(() => useGuide.setState({ open: null }));

  it("skips them, as Skip does: closed", () => {
    showGuide();
    expect(keyOnGuide("Escape", false)).toBe(true);
    expect(useGuide.getState().open).toBeNull();
  });

  it("leaves them open where something else took that Escape, or for another key", () => {
    showGuide();
    expect(keyOnGuide("Escape", true)).toBe(false);
    expect(keyOnGuide("Enter", false)).toBe(false);
    expect(useGuide.getState().open).not.toBeNull();
  });
});
