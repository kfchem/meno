import { afterEach, describe, expect, it, vi } from "vitest";
import type { Conformers } from "../../../../lib/roles/client";
import { shownConformers } from "./shownConformers";

/** What the stand-in worker is to the test: its handlers, and whether it was ended. */
type StandInWorker = { onmessage: ((e: { data: unknown }) => void) | null; onerror: ((e: { message: string }) => void) | null; ended: boolean };

/** A stand-in for the page's worker: what it answers is the test's, and whether it was ended. */
function workerAnswering(answer: (w: StandInWorker) => void) {
  const made: StandInWorker[] = [];
  class StandIn implements StandInWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: { message: string }) => void) | null = null;
    ended = false;
    constructor() {
      made.push(this);
    }
    postMessage() {
      queueMicrotask(() => answer(this));
    }
    terminate() {
      this.ended = true;
    }
  }
  vi.stubGlobal("Worker", StandIn);
  return made;
}

const isomer = { atoms: [], bonds: [], frames: [], field: "MMFF94", cip: { atoms: {}, bonds: {} }, chosen: { atoms: {}, bonds: {} }, smiles: "" } as unknown as Conformers;

describe("the page's conformers, made the page's in a worker of their own", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("takes what the worker made, and ends it", async () => {
    const made = workerAnswering((w) => w.onmessage!({ data: { kind: "done", isomers: [isomer] } }));
    await expect(shownConformers([isomer])).resolves.toEqual([isomer]);
    expect(made.map((w) => w.ended)).toEqual([true]);
  });

  it("fails, saying why, where the worker could not make them - its own words, or that it failed - and ends it", async () => {
    let made = workerAnswering((w) => w.onmessage!({ data: { kind: "failed", error: "no atoms" } }));
    await expect(shownConformers([isomer])).rejects.toThrow("no atoms");
    expect(made[0].ended).toBe(true);
    made = workerAnswering((w) => w.onerror!({ message: "" }));
    await expect(shownConformers([isomer])).rejects.toThrow("the conformers could not be made the page's");
    expect(made[0].ended).toBe(true);
  });
});
