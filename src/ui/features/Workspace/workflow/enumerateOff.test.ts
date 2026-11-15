import { describe, expect, it } from "vitest";
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
  it("ends the worker at once, and what was asked fails, said stopped", async () => {
    // (a worker that never answers, and says when it is ended)
    let ended = 0;
    class Silent {
      onmessage = null;
      onerror = null;
      postMessage() {}
      terminate() {
        ended++;
      }
    }
    (globalThis as { Worker?: unknown }).Worker = Silent;
    enumerateWorkerMade(() => new Silent() as unknown as Worker);
    try {
      const asked = enumeratedOff({ way: "lists", template: drawnFromSmiles(XYLENE), text: "R1: Me" });
      enumerateStopped();
      await expect(asked).rejects.toThrow(ENUMERATE_STOPPED);
      expect(ended).toBe(1);
    } finally {
      delete (globalThis as { Worker?: unknown }).Worker;
    }
  });
});

