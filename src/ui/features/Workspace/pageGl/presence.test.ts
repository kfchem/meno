import { describe, expect, it } from "vitest";
import { FADE_MS, fading, presenceAt, presentAt } from "./presence";

const a = { key: "a" };
const b = { key: "b" };

describe("what WebGL draws, coming and going", () => {
  it("is there at once the first time - as a page opens - and fades in as it comes after", () => {
    const first = presentAt(new Map(), [a], 1000, true);
    expect(presenceAt(first.get("a")!, 1000)).toBe(1);
    const next = presentAt(first, [a, b], 2000);
    expect(presenceAt(next.get("b")!, 2000)).toBe(0);
    expect(presenceAt(next.get("b")!, 2000 + FADE_MS / 2)).toBeGreaterThan(0.5);
    expect(presenceAt(next.get("b")!, 2000 + FADE_MS)).toBe(1);
    expect(fading(next, 2000 + FADE_MS / 2)).toBe(true);
    expect(fading(next, 2000 + FADE_MS)).toBe(false);
  });

  it("fades out as it goes, drawn as it last was - then is dropped; one back before it has gone comes in again", () => {
    const shown = presentAt(new Map(), [a, b], 0, true);
    const going = presentAt(shown, [a], 1000);
    expect(going.get("b")).toMatchObject({ item: b, gone: 1000 });
    expect(presenceAt(going.get("b")!, 1000)).toBe(1);
    expect(presenceAt(going.get("b")!, 1000 + FADE_MS)).toBe(0);
    expect(presentAt(going, [a], 1000 + FADE_MS).has("b")).toBe(false);
    const back = presentAt(going, [a, b], 1050);
    expect(back.get("b")!.gone).toBeUndefined();
    expect(presenceAt(back.get("b")!, 1050)).toBe(0);
  });
});
