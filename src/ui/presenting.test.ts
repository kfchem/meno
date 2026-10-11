import { afterEach, describe, expect, it } from "vitest";
import { setPresentingWindow, usePresentingWindow } from "./presenting";
import { useNotices } from "./notices";

afterEach(() => {
  setPresentingWindow(false);
  for (const n of useNotices.getState().notices) useNotices.getState().dismiss(n.id);
});

describe("a talk given in the window", () => {
  it("is told with when it began and when it ended", () => {
    setPresentingWindow(true);
    const s = usePresentingWindow.getState();
    expect(s.on).toBe(true);
    expect(s.since).toBeTypeOf("number");
    setPresentingWindow(false);
    const t = usePresentingWindow.getState();
    expect(t.on).toBe(false);
    expect(t.since).toBe(s.since);
    expect(t.ended).toBeGreaterThanOrEqual(s.since!);
  });

  it("holds notices given meanwhile, and shows them once it ends", () => {
    setPresentingWindow(true);
    useNotices.getState().show({ id: "a", title: "One", text: "said during the talk" });
    useNotices.getState().show({ id: "a", title: "One, again", text: "said again" });
    expect(useNotices.getState().notices).toEqual([]);
    setPresentingWindow(false);
    expect(useNotices.getState().notices.map((n) => n.title)).toEqual(["One, again"]);
    // (outside a talk, at once)
    useNotices.getState().show({ id: "b", title: "Two", text: "after" });
    expect(useNotices.getState().notices.map((n) => n.id)).toEqual(["a", "b"]);
  });
});
