import { describe, expect, it } from "vitest";
import { setSavedPathOf, tabHolding } from "./savers";

describe("the tab that holds a workspace's file", () => {
  it("is the one whose view says it is saved there, else the one opened from there - so that opening it again brings it forward", () => {
    let saved: string | null = "/w/a.meno";
    const away = setSavedPathOf("t1", () => saved);
    const tabs = [{ id: "t1", openedFrom: "/w/old.meno" }, { id: "t2", openedFrom: "/w/b.meno" }, { id: "t3" }];
    // (where it is saved now, not where it was opened from)
    expect(tabHolding("/w/a.meno", tabs)).toBe("t1");
    expect(tabHolding("/w/old.meno", tabs)).toBeUndefined();
    // (a tab whose view is not there yet: where it was opened from)
    expect(tabHolding("/w/b.meno", tabs)).toBe("t2");
    expect(tabHolding("/w/c.meno", tabs)).toBeUndefined();
    // (saved somewhere else, Save As: there)
    saved = "/w/c.meno";
    expect(tabHolding("/w/c.meno", tabs)).toBe("t1");
    // (its view gone: where it was opened from again)
    away();
    expect(tabHolding("/w/old.meno", tabs)).toBe("t1");
  });
});
