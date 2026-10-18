import { describe, expect, it } from "vitest";
import type { Rendering } from "./renders";
import { FRAME_HOLDS, wordsPlace } from "./renders";
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

describe("where a render's frame has what it says", () => {
  it("inside a frame large enough for its longest words, in two lines clear of its button", () => {
    expect(wordsPlace(FRAME_HOLDS.w, FRAME_HOLDS.h)).toBe("inside");
    expect(wordsPlace(640, 360)).toBe("inside");
  });

  it("just below a smaller one - a small picture's - whether too narrow, too low or both", () => {
    expect(wordsPlace(FRAME_HOLDS.w - 1, FRAME_HOLDS.h)).toBe("below");
    expect(wordsPlace(FRAME_HOLDS.w, FRAME_HOLDS.h - 1)).toBe("below");
    expect(wordsPlace(110, 68)).toBe("below");
    expect(wordsPlace(24, 24)).toBe("below");
  });

  it("holds all it says in two lines inside, between margins clear of its button, at the 13 px it is set in", () => {
    // (words set one after another as a line holds them, each character at most 0.6 em wide - a wide estimate - in the
    // frame's width less its margins, 32 px a side)
    const lines = (s: string, room: number) => {
      let n = 1;
      let used = 0;
      for (const word of s.split(" ")) {
        const wide = word.length * 0.6 * 13;
        const need = used ? used + 0.3 * 13 + wide : wide;
        if (need <= room) used = need;
        else {
          n++;
          used = wide;
        }
      }
      return n;
    };
    for (const s of ["Waiting for other jobs to finish…", "Putting it on the page…", "Rendering 100%…", "Getting ready…", "Stopping…"]) {
      expect(lines(s, FRAME_HOLDS.w - 64)).toBeLessThanOrEqual(2);
    }
  });
});
