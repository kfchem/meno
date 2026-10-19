import { describe, expect, it } from "vitest";
import { noTextSets, setDrawn, textsGiven } from "./textSets";

const same = (a: string, b: string) => a === b;

describe("whole texts' sets", () => {
  it("show the first at once, and each after it once it is set", () => {
    const s = noTextSets<string>();
    textsGiven(s, "a", same);
    expect(s.at[s.front]).toBe("a");
    expect(setDrawn(s, 0, "a")).toBe("told");
    textsGiven(s, "b", same);
    expect(s.at).toEqual(["a", "b"]);
    expect(setDrawn(s, 1, "b")).toBe("shown");
    expect(s.front).toBe(1);
    expect(s.at).toEqual([null, "b"]);
    // (told once only)
    expect(setDrawn(s, 1, "b")).toBeNull();
  });

  it("given faster than they are set: the one being set shown, then the latest, those between never", () => {
    const s = noTextSets<string>();
    textsGiven(s, "a", same);
    setDrawn(s, 0, "a");
    for (const t of ["b", "c", "d", "e"]) textsGiven(s, t, same);
    // (b, being set, kept - not given up for c, then d, then e)
    expect(s.at).toEqual(["a", "b"]);
    expect(s.next).toBe("e");
    expect(setDrawn(s, 1, "b")).toBe("shown");
    // (e set next, where a was)
    expect(s.at).toEqual(["e", "b"]);
    expect(s.next).toBeNull();
    textsGiven(s, "e", same);
    expect(s.at).toEqual(["e", "b"]);
    expect(setDrawn(s, 0, "e")).toBe("shown");
    expect(s.at).toEqual(["e", null]);
  });

  it("given the one shown again, or the one being set, nothing more is set", () => {
    const s = noTextSets<string>();
    textsGiven(s, "a", same);
    setDrawn(s, 0, "a");
    textsGiven(s, "b", same);
    textsGiven(s, "c", same);
    textsGiven(s, "b", same);
    expect(s.next).toBeNull();
    textsGiven(s, "a", same);
    expect(s.at).toEqual(["a", null]);
    // (b set after all: no longer the set there, nothing shown)
    expect(setDrawn(s, 1, "b")).toBeNull();
    expect(s.front).toBe(0);
  });
});
