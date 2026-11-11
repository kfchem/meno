import { describe, expect, it } from "vitest";
import { LOW_DPI, NOT_ALLOWED, PRINT_CSS, PRINT_DPI, printDpi, printPdf, printed, type PrintDeps, type Printing } from "./print";

const A4: [number, number] = [595, 842];

/** A window that draws pages as pictures of the size asked, and says what was asked of it. */
function window_(printing: Printing, fail?: { draw?: number; show?: boolean }) {
  const said = { drawn: [] as { page: number; dpi: number; box: number[] }[], held: [] as string[], released: [] as string[], shown: [] as string[][] };
  const deps: PrintDeps = {
    allowed: async () => printing,
    draw: async (_sha, page, box, dpi) => {
      if (fail?.draw === page) throw new Error("a page could not be drawn");
      said.drawn.push({ page, dpi, box });
      return { png: new Uint8Array([page]), width: Math.ceil(((box[2] - box[0]) * dpi) / 72), height: Math.ceil(((box[3] - box[1]) * dpi) / 72), dpi };
    },
    hold: (png) => {
      const url = `blob:page-${png[0]}`;
      said.held.push(url);
      return url;
    },
    release: (url) => said.released.push(url),
    show: async (urls) => {
      said.shown.push([...urls]);
      if (fail?.show) throw new Error("the dialog failed");
    },
  };
  return { deps, said };
}

describe("a PDF printed", () => {
  it("draws every page at 300 dots an inch, whole, and shows one picture a page to the printer", async () => {
    const { deps, said } = window_("full");
    const done = await printPdf("a".repeat(64), [A4, A4, [842, 595]], deps);
    expect(said.drawn).toEqual([
      { page: 0, dpi: 300, box: [0, 0, 595, 842] },
      { page: 1, dpi: 300, box: [0, 0, 595, 842] },
      { page: 2, dpi: 300, box: [0, 0, 842, 595] },
    ]);
    expect(said.shown).toEqual([["blob:page-0", "blob:page-1", "blob:page-2"]]);
    expect(done).toEqual({ pages: 3, dpi: [300, 300, 300] });
    expect(PRINT_DPI).toBe(300);
  });

  it("lets go of every picture's address once it is printed", async () => {
    const { deps, said } = window_("full");
    await printPdf("a".repeat(64), [A4, A4], deps);
    expect(said.released).toEqual(said.held);
    expect(said.released).toHaveLength(2);
  });

  it("lets go of them too where the dialog fails, or a page cannot be drawn - and prints nothing then", async () => {
    const shown = window_("full", { show: true });
    await expect(printPdf("a".repeat(64), [A4, A4], shown.deps)).rejects.toThrow("the dialog failed");
    expect(shown.said.released).toEqual(shown.said.held);
    expect(shown.said.released).toHaveLength(2);
    const drawn = window_("full", { draw: 1 });
    await expect(printPdf("a".repeat(64), [A4, A4, A4], drawn.deps)).rejects.toThrow("a page could not be drawn");
    expect(drawn.said.shown).toEqual([]);
    expect(drawn.said.released).toEqual(drawn.said.held);
    expect(drawn.said.released).toHaveLength(1);
  });

  it("is refused, in words, where its author does not allow printing, before any page is drawn", async () => {
    const { deps, said } = window_("no");
    await expect(printPdf("a".repeat(64), [A4], deps)).rejects.toThrow(NOT_ALLOWED);
    expect(NOT_ALLOWED).toBe("Its author does not allow printing");
    expect(said.drawn).toEqual([]);
    expect(said.held).toEqual([]);
    expect(said.shown).toEqual([]);
  });

  it("is drawn at 150 dots an inch where its author allows only a low quality", async () => {
    const { deps, said } = window_("low");
    const done = await printPdf("a".repeat(64), [A4], deps);
    expect(said.drawn.map((d) => d.dpi)).toEqual([150]);
    expect(done.dpi).toEqual([150]);
    expect(LOW_DPI).toBe(150);
  });
});

describe("the dots an inch a page is printed at", () => {
  it("are the resolution asked for a page of an ordinary size, whichever way it lies", () => {
    expect(printDpi("full", A4)).toBe(300);
    expect(printDpi("full", [842, 595])).toBe(300);
    // (A3 at 300 dots an inch: 4961 dots, within what is drawn at once)
    expect(printDpi("full", [842, 1191])).toBe(300);
    expect(printDpi("low", A4)).toBe(150);
  });

  it("are lowered for a page so large that a side would be more than is drawn at once, and no more than that", () => {
    // (A0, 2384 by 3370 points: 300 dots would be 14042 along it)
    const a0 = printDpi("full", [2384, 3370]);
    expect(a0).toBeLessThan(300);
    expect(Math.ceil((3370 * a0) / 72)).toBeLessThanOrEqual(8192);
    expect(Math.ceil((3370 * a0) / 72)).toBeGreaterThan(8000);
    // (the side that is longer decides, whichever it is)
    expect(printDpi("full", [3370, 2384])).toBe(a0);
    // (the page of the largest size at 300 dots a side: 1966 points)
    expect(printDpi("full", [1966, 100])).toBeCloseTo(300, 0);
    expect(printDpi("full", [1967, 100])).toBeLessThan(300);
  });
});

describe("the print document", () => {
  it("is hidden but for the printer, and breaks each picture on to a page of its own", () => {
    expect(PRINT_CSS).toMatch(/#meno-print \{ display: none; \}/);
    expect(PRINT_CSS).toMatch(/@media print[\s\S]*body > \*:not\(#meno-print\) \{ display: none !important; \}/);
    expect(PRINT_CSS).toMatch(/#meno-print img \{[^}]*break-after: page;/);
  });
});

describe("Print, as the command says it", () => {
  it("says nothing where it printed, and its words where it could not", async () => {
    expect(await printed("a".repeat(64), [A4], window_("full").deps)).toBeNull();
    expect(await printed("b".repeat(64), [A4], window_("no").deps)).toBe("Its author does not allow printing.");
    expect(await printed("c".repeat(64), [A4, A4], window_("full", { draw: 1 }).deps)).toBe("Printing failed: a page could not be drawn");
  });

  it("is asked for a PDF once while it is being printed: a second press waits for nothing and prints nothing", async () => {
    const first = window_("full");
    let release: () => void = () => {};
    const slow: PrintDeps = { ...first.deps, show: () => new Promise<void>((done) => (release = done)) };
    const sha = "d".repeat(64);
    const pending = printed(sha, [A4], slow);
    // (let the first reach its dialog)
    await new Promise((r) => setTimeout(r, 0));
    const again = window_("full");
    expect(await printed(sha, [A4], again.deps)).toBeNull();
    expect(again.said.drawn).toEqual([]);
    release();
    expect(await pending).toBeNull();
    // (and once it is done, a PDF can be printed again)
    const later = window_("full");
    expect(await printed(sha, [A4], later.deps)).toBeNull();
    expect(later.said.drawn).toHaveLength(1);
  });
});
