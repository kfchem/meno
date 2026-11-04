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
const { labelPlaces } = await import("./compoundIndex");
const FIG: [number, number, number, number][] = [[0, 0, 100, 100]];

describe("a figure's structures, waited for", () => {
  it("come to each that waits - one asked for first by the pointer, then waited for - once read", async () => {
    let came = 0;
    expect(figureStructuresHad("a", 0, FIG, 0, () => came++)).toBeNull();
    const waited = figureStructuresOn("a", 0, FIG, 0);
    answers.shift()!(true);
    expect(await waited).toMatchObject({ structures: [], labels: [] });
    expect(came).toBe(1);
    // (read: at once, the next time)
    expect(await figureStructuresOn("a", 0, FIG, 0)).toMatchObject({ structures: [] });
  });

  it("come as none where the figure cannot be read, and it is asked for again the next time", async () => {
    const waited = figureStructuresOn("b", 0, FIG, 0);
    answers.shift()!(false);
    expect(await waited).toBeNull();
    const again = figureStructuresOn("b", 0, FIG, 0);
    expect(answers).toHaveLength(1);
    answers.shift()!(true);
    expect(await again).toMatchObject({ structures: [] });
  });

  it("come to every one waiting before it is read, as one figure, or as none where it cannot be", async () => {
    const one = figureStructuresOn("c", 0, FIG, 0);
    const two = figureStructuresOn("c", 0, FIG, 0);
    answers.shift()!(true);
    const [a, b] = await Promise.all([one, two]);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    const three = figureStructuresOn("d", 0, FIG, 0);
    const four = figureStructuresOn("d", 0, FIG, 0);
    answers.shift()!(false);
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
    answers.shift()!(true);
    expect((await read)?.labels.map((l) => l.label)).toEqual(["7"]);
    expect(labelPlaces("e", "7").map((p) => [p.page, p.figure])).toEqual([[0, FIG[0]]]);
  });
});
