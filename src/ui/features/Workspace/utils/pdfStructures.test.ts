import { describe, expect, it, vi } from "vitest";

// (the app's reader played here: a figure drawn empty, or one that cannot be read)
const answers: ((ok: boolean) => void)[] = [];
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: () => new Promise((done, fail) => answers.push((ok) => (ok ? done({ paths: [], letters: [], pictures: [] }) : fail(new Error("no"))))),
}));
vi.mock("../../../../lib/pdf/figures", async (real) => ({ ...(await real<object>()), objectsHad: () => [], figuresHad: () => null, figuresOn: async () => [] }));
vi.mock("../../../../lib/pdf/text", () => ({ textHad: () => null }));

const { figureStructuresHad, figureStructuresOn } = await import("./pdfStructures");
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
});
