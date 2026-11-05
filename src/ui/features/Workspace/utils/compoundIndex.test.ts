import { beforeEach, describe, expect, it } from "vitest";
import { forgetIndex, indexPdf, indexWhole, labelPlaces, labelsRead, type PageLabels } from "./compoundIndex";

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
});
