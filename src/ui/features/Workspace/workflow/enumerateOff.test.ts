import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import { runMenoDrawn } from "./meno";
import { ENUMERATE_STOPPED, enumeratedOff, enumerateStopped, enumerateWorkerMade, runMenoDrawnOff } from "./enumerateOff";

// Enumerate's products made off the drawing thread (./enumerateOff): the same outcome as made in place - here, with no workers,
// made in place behind a promise, the step's caller waiting on it as it waits on the worker.

const XYLENE = "Cc1ccc(C)cc1";

describe("Enumerate off the drawing thread", () => {
  it("gives what Enumerate gives in place: by substituents, by lists, and why it cannot run", async () => {
    const template = [{ place: 0, drawn: drawnFromSmiles(XYLENE) }];
    const bySubstituents = { way: "substituents", positions: "3 8", groups: "Cl, Br", combine: "one" } as const;
    expect(await runMenoDrawnOff("enumerate", template, bySubstituents, undefined, ["checked"])).toEqual(runMenoDrawn("enumerate", template, bySubstituents, undefined, ["checked"]));
    const byLists = { way: "rgroups", lists: "R1: Me, Et" } as const;
    expect(await runMenoDrawnOff("enumerate", template, byLists)).toEqual(runMenoDrawn("enumerate", template, byLists));
    expect(await runMenoDrawnOff("enumerate", [...template, ...template], bySubstituents)).toEqual({ ok: false, said: "Enumerate takes one structure drawn, its template: 2 came in" });
  });

  it("leaves every other kind to runMenoDrawn, as it was", async () => {
    expect(await runMenoDrawnOff("duplicates", [])).toEqual({ ok: false, said: "Nothing came in" });
  });
});

describe("Enumerate stopped while its worker makes its products", () => {
  /** A worker that never answers: what it was sent, by message, and how many were made and ended. */
  const seen = { made: 0, ended: 0, sent: [] as number[] };
  class Silent {
    onmessage = null;
    onerror = null;
    constructor() {
      seen.made++;
    }
    postMessage(m: { id: number }) {
      seen.sent.push(m.id);
    }
    terminate() {
      seen.ended++;
    }
  }
  const ask = (run: number) => enumeratedOff({ way: "lists", template: drawnFromSmiles(XYLENE), text: "R1: Me" }, run);
  const outcome = (p: Promise<unknown>) => Promise.race([p.then(() => "answered", (e: Error) => e.message), new Promise<string>((r) => setTimeout(() => r("waiting"), 50))]);

  beforeEach(() => {
    Object.assign(seen, { made: 0, ended: 0, sent: [] });
    (globalThis as { Worker?: unknown }).Worker = Silent;
    enumerateWorkerMade(() => new Silent() as unknown as Worker);
  });
  afterEach(() => {
    delete (globalThis as { Worker?: unknown }).Worker;
  });

  it("ends the worker at once where it makes that run's products, and what the run asked fails, said stopped", async () => {
    const asked = ask(1);
    enumerateStopped(1);
    await expect(asked).rejects.toThrow(ENUMERATE_STOPPED);
    expect(seen.ended).toBe(1);
  });

  it("fails that run alone: another run waiting on the worker is asked again of a worker made anew, never said stopped", async () => {
    const first = ask(1);
    const second = ask(2);
    enumerateStopped(1);
    await expect(first).rejects.toThrow(ENUMERATE_STOPPED);
    expect(await outcome(second)).toBe("waiting");
    expect([seen.made, seen.ended, seen.sent.length]).toEqual([2, 1, 3]);
    enumerateStopped(2);
    await expect(second).rejects.toThrow(ENUMERATE_STOPPED);
  });

  it("takes a run only waiting its turn out of the queue, the worker left making the one before it", async () => {
    const first = ask(1);
    const second = ask(2);
    enumerateStopped(2);
    await expect(second).rejects.toThrow(ENUMERATE_STOPPED);
    expect(await outcome(first)).toBe("waiting");
    expect([seen.made, seen.ended]).toEqual([1, 0]);
    enumerateStopped(1);
    await expect(first).rejects.toThrow(ENUMERATE_STOPPED);
  });
});
