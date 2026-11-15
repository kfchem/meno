import { describe, expect, it } from "vitest";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import { runMenoDrawn } from "./meno";
import { runMenoDrawnOff } from "./enumerateOff";

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
