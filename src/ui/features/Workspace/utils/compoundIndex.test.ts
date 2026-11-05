import { beforeEach, describe, expect, it } from "vitest";
import { forgetIndex, hurryIndex, indexPdf, indexWhole, labelPlaces, labelsRead, type PageLabels } from "./compoundIndex";

type B = [number, number, number, number];
const fig = (y: number): B => [0, y, 100, y + 50];
const label = (l: string, key = "0:0") => ({ label: l, key, box: [10, 10, 20, 18] as B });
const now = (go: () => void) => go();

describe("a PDF's compounds by their numbers", () => {
  beforeEach(() => forgetIndex("pdf"));

  it("keeps each structure a number is set by, in the order of its pages - a figure read again adding nothing", () => {
    labelsRead("pdf", 3, fig(0), [label("12")]);
    labelsRead("pdf", 1, fig(200), [label("12", "0:1"), label("3")]);
    labelsRead("pdf", 1, fig(0), [label("12")]);
    labelsRead("pdf", 1, fig(0), [label("12")]);
    expect(labelPlaces("pdf", "12").map((p) => [p.page, p.figure[1], p.key])).toEqual([
      [1, 0, "0:0"],
      [1, 200, "0:1"],
      [3, 0, "0:0"],
    ]);
    expect(labelPlaces("pdf", "3")).toHaveLength(1);
    expect(labelPlaces("pdf", "4")).toEqual([]);
    expect(labelPlaces("other", "12")).toEqual([]);
  });

  it("goes through every page in idle time, one at a time, once - a page not read gone through again the next time", async () => {
    const asked: number[] = [];
    let fail = true;
    const read: PageLabels = async (p) => {
      asked.push(p);
      if (p === 1 && fail) return null;
      return [{ figure: fig(0), labels: [label(`${p + 1}`)] }];
    };
    const idles: (() => void)[] = [];
    const later = (go: () => void) => idles.push(go);
    const run = indexPdf("pdf", 3, read, later);
    // (asked again while it goes: the same going)
    expect(indexPdf("pdf", 3, read, later)).toBe(run);
    // (nothing read before the window is idle)
    expect(asked).toEqual([]);
    for (let i = 0; i < 3; i++) {
      await Promise.resolve();
      idles.shift()?.();
      await new Promise((r) => setTimeout(r, 0));
    }
    await run;
    expect(asked).toEqual([0, 1, 2]);
    expect(indexWhole("pdf")).toBe(false);
    expect(labelPlaces("pdf", "3")).toHaveLength(1);
    fail = false;
    await indexPdf("pdf", 3, read, now);
    expect(asked).toEqual([0, 1, 2, 1]);
    expect(indexWhole("pdf")).toBe(true);
    expect(labelPlaces("pdf", "2")).toHaveLength(1);
  });

  it("hurried - a number's card waiting on it - reads on without waiting for an idle moment, the one it waits for too, but yields between pages", async () => {
    const asked: number[] = [];
    const read: PageLabels = async (p) => {
      asked.push(p);
      return [{ figure: fig(0), labels: [label(`${p + 1}`)] }];
    };
    // (an idle moment that never comes - Windows' webview, the pointer moving - and the window's next turns, each kept to be given)
    const never = () => {};
    const turns: (() => void)[] = [];
    const next = (go: () => void) => turns.push(go);
    const run = indexPdf("pdf", 3, read, never, next);
    await Promise.resolve();
    expect(asked).toEqual([]);
    // (hurried: the wait for idle given up, its page read at the window's next turn - not before)
    hurryIndex("pdf");
    expect(turns).toHaveLength(1);
    expect(asked).toEqual([]);
    // (each page after its own turn: never two read in one)
    for (let page = 0; page < 3; page++) {
      turns.shift()!();
      await new Promise((r) => setTimeout(r, 0));
      expect(asked).toEqual([0, 1, 2].slice(0, page + 1));
    }
    await run;
    expect(indexWhole("pdf")).toBe(true);
    expect(labelPlaces("pdf", "3")).toHaveLength(1);
  });

  it("leaves nothing behind: a PDF hurried while none goes waits for idle when it does go, and a run after a hurried one is hurried only if asked again", async () => {
    const read: PageLabels = async (p) => [{ figure: fig(0), labels: [label(`${p + 1}`)] }];
    const idles: (() => void)[] = [];
    const idle = (go: () => void) => idles.push(go);
    const now = (go: () => void) => go();
    // (hurried before any reading: nothing kept, so its first page still waits for idle)
    hurryIndex("pdf");
    const first = indexPdf("pdf", 1, read, idle, now);
    await Promise.resolve();
    expect(idles).toHaveLength(1);
    // (hurried now: read at once, and the run ends)
    hurryIndex("pdf");
    await first;
    // (a later run of it - its pages to read again - waits for idle, as no one has hurried it)
    forgetIndex("pdf");
    idles.length = 0;
    const second = indexPdf("pdf", 1, read, idle, now);
    await Promise.resolve();
    expect(idles).toHaveLength(1);
    idles.shift()!();
    await second;
    expect(indexWhole("pdf")).toBe(true);
  });
});

