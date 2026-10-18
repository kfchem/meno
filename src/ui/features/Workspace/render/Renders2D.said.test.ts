import { describe, expect, it } from "vitest";
import type { Rendering } from "./renders";
import { said } from "./Renders2D";

const film = (done: number | undefined, total: number | undefined, over: Partial<Rendering> = {}) => ({ kind: "film", state: "running", done, total, ...over }) as unknown as Rendering;

describe("what a render says it is doing", () => {
  it("says a film's progress in hundredths of its length, not as frames of a count it was never given", () => {
    // (240 frames, told as hundredths: 9 of 100 is 9%, not "frame 10 of 100")
    expect(said(film(9, 100))).toBe("Rendering 9%…");
    expect(said(film(91, 100))).toBe("Rendering 91%…");
    expect(said(film(100, 100))).toBe("Rendering 100%…");
  });

  it("says a picture is rendering, and the stages before and after", () => {
    expect(said({ kind: "picture", state: "running", done: 40, total: 100 } as unknown as Rendering)).toBe("Rendering…");
    expect(said(film(undefined, undefined))).toBe("Rendering…");
    expect(said(film(0, 100, { state: "preparing" }))).toBe("Getting ready…");
    expect(said(film(5, 100, { state: "finishing" }))).toBe("Putting it on the page…");
  });
});
