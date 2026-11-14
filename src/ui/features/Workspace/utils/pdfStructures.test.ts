import { describe, expect, it, vi } from "vitest";

// (the app's reader played here: a figure drawn - empty, unless a test sets one - or one that cannot be read)
const answers: ((ok: boolean) => void)[] = [];
let drawing: unknown = { paths: [], letters: [], pictures: [] };
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: () => new Promise((done, fail) => answers.push((ok) => (ok ? done(drawing) : fail(new Error("no"))))),
}));
vi.mock("../../../../lib/pdf/figures", async (real) => ({ ...(await real<object>()), objectsHad: () => [], figuresHad: () => null, figuresOn: async () => [] }));
vi.mock("../../../../lib/pdf/text", () => ({ textHad: () => null }));

const { figureStructuresHad, figureStructuresOn } = await import("./pdfStructures");
const { noteBusy, CALM_MS } = await import("../../../../lib/core/calm");
const { readFileSync } = await import("node:fs");
const { join } = await import("node:path");
/** The reader's answer to the next figure asked for - which, one read ahead, is asked for once the hands rest. */
const answer = async (ok: boolean) => {
  await vi.waitFor(() => expect(answers.length).toBeGreaterThan(0));
  answers.shift()!(ok);
};
const { labelPlaces } = await import("./compoundIndex");
const FIG: [number, number, number, number][] = [[0, 0, 100, 100]];

describe("a figure's structures, waited for", () => {
  it("come to each that waits - one asked for first by the pointer, then waited for - once read", async () => {
    let came = 0;
    expect(figureStructuresHad("a", 0, FIG, 0, () => came++)).toBeNull();
    const waited = figureStructuresOn("a", 0, FIG, 0);
    await answer(true);
    expect(await waited).toMatchObject({ structures: [], labels: [] });
    expect(came).toBe(1);
    // (read: at once, the next time)
    expect(await figureStructuresOn("a", 0, FIG, 0)).toMatchObject({ structures: [] });
  });

  it("come as none where the figure cannot be read, and it is asked for again the next time", async () => {
    const waited = figureStructuresOn("b", 0, FIG, 0);
    await answer(false);
    expect(await waited).toBeNull();
    const again = figureStructuresOn("b", 0, FIG, 0);
    await answer(true);
    expect(await again).toMatchObject({ structures: [] });
  });

  it("come to every one waiting before it is read, as one figure, or as none where it cannot be", async () => {
    const one = figureStructuresOn("c", 0, FIG, 0);
    const two = figureStructuresOn("c", 0, FIG, 0);
    await answer(true);
    const [a, b] = await Promise.all([one, two]);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    const three = figureStructuresOn("d", 0, FIG, 0);
    const four = figureStructuresOn("d", 0, FIG, 0);
    await answer(false);
    expect(await Promise.all([three, four])).toEqual([null, null]);
  });

  it("put the numbers of a figure the pointer read into its PDF's index", async () => {
    const L = 14.4;
    const pts = [0, 1, 2, 3, 4].map((i) => [10 + i * L * (Math.sqrt(3) / 2), 30 + (i % 2) * L * 0.5]);
    const zigzag = { fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i) => [i ? "L" : "M", x, y]) };
    const mid = 10 + 2 * L * (Math.sqrt(3) / 2);
    drawing = { paths: [zigzag], letters: [{ c: "7", box: [mid - 3.4, 30 + 1.4 * L - 3.6, mid + 3.4, 30 + 1.4 * L + 3.6], at: [mid - 3.4, 30 + 1.4 * L + 3.6], size: 10 }], pictures: [] };
    expect(labelPlaces("e", "7")).toEqual([]);
    const read = figureStructuresOn("e", 0, FIG, 0);
    expect(figureStructuresHad("e", 0, FIG, 0)).toBeNull();
    await answer(true);
    expect((await read)?.labels.map((l) => l.label)).toEqual(["7"]);
    expect(labelPlaces("e", "7").map((p) => [p.page, p.figure])).toEqual([[0, FIG[0]]]);
  });
});

describe("a figure read ahead, and the hands", () => {
  it("is not asked for while the hands are busy - a scroll, a pan - but after they rest", async () => {
    vi.useFakeTimers();
    try {
      noteBusy();
      const read = figureStructuresOn("f", 0, FIG, 0);
      await vi.advanceTimersByTimeAsync(CALM_MS - 10);
      expect(answers).toHaveLength(0);
      noteBusy();
      await vi.advanceTimersByTimeAsync(CALM_MS - 10);
      expect(answers).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(20);
      expect(answers).toHaveLength(1);
      answers.shift()!(true);
      vi.useRealTimers();
      expect(await read).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("is asked for at once where the pointer comes to it meanwhile, and the pointer is told when it is read", async () => {
    vi.useFakeTimers();
    try {
      noteBusy();
      const ahead = figureStructuresOn("g", 0, FIG, 0);
      await vi.advanceTimersByTimeAsync(10);
      expect(answers).toHaveLength(0);
      let came = 0;
      expect(figureStructuresHad("g", 0, FIG, 0, () => came++)).toBeNull();
      expect(answers).toHaveLength(1);
      // (and asked again at every move of the pointer: told once, and no second request)
      figureStructuresHad("g", 0, FIG, 0, () => came++);
      expect(answers).toHaveLength(1);
      answers.shift()!(true);
      vi.useRealTimers();
      await ahead;
      expect(came).toBeGreaterThanOrEqual(1);
      expect(answers).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("where a figure is read", () => {
  it("is never on the thread the drawing runs on: the reading is in a worker, and the figure's bytes are unpacked there", () => {
    const here = readFileSync(join(process.cwd(), "src/ui/features/Workspace/utils/pdfStructures.ts"), "utf8");
    expect(here).not.toMatch(/\bpageStructuresOf\b|JSON\.parse/);
    expect(here).toContain("figureReadOff");
    expect(here).toContain('"pdf_figure_raw"');
  });
});
