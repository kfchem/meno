import { describe, expect, it } from "vitest";
import type { ReaderOutput } from "../../../../lib/calc/output";
import type { Molecule3D } from "../store/types";
import { setEntries, startedFrame, type SetEntry } from "./entries";
import { isFailure, workedOf } from "./programs";
import { resultsOf, type Worked } from "./run";
import { takeFrames } from "./takeFrames";

/** H2, as a step's entry, its bond `d` A long - found at `method` (a saddle point's frequencies, say). */
const h2 = (d = 0.97, method = "GFN2-xTB", basis?: string): SetEntry =>
  ({ compound: 0, number: 1, atoms: [{ el: "H" }, { el: "H" }], bonds: [{ a1: 0, a2: 1, order: 1 }], xyz: [0, 0, 0, d, 0, 0], calc: { readers: ["orca"], program: "ORCA", method, ...(basis ? { basis } : {}) } }) as unknown as SetEntry;

/** What ORCA's IRC read back, one end to the other, its start marked; a side stopped at its cap where `stopped`. */
const irc = (stopped?: string): ReaderOutput =>
  ({
    schema: 1,
    program: "ORCA",
    method: "GFN2-xTB",
    atoms: ["H", "H"],
    frames: [0.74, 0.9, 0.97, 1.1].map((d) => [0, 0, 0, d, 0, 0]),
    energies: [-1.17, -1.1, -1.09, -1.12],
    converged: [false, false, true, false],
    ...(stopped ? { optimised: false, warnings: [{ kind: "other", text: stopped }] } : {}),
    results: [{ id: "path.frame", on: "frames", group: "Path", label: "What it is", values: ["backward, step 2 of 2", "backward, step 1 of 2", "the point it started from", "forward, step 1 of 1"] }],
  }) as unknown as ReaderOutput;

const molecule = (w: Worked): Molecule3D => ({ ...resultsOf({ ok: true, holds: "molecules", kept: [w], aside: [], said: "" }, "reaction-path").molecules[0], id: 1, at: { x: 0, y: 0 } });

describe("Follow the reaction path", () => {
  it("gives each point its path, one end to the other, its entry the point it started from - its calculation on it", () => {
    const w = workedOf("reaction-path", h2(), irc(), ["orca"]) as Worked;
    expect(isFailure(w)).toBe(false);
    const m = molecule(w);
    expect([m.frames?.length, m.entryFrames, m.energies]).toEqual([3, [2], [-1.17, -1.1, -1.09, -1.12]]);
    expect(startedFrame(m)).toBe(2);
    const [entry] = setEntries([m], "molecules");
    expect([entry.frame, entry.energy, entry.calc?.method]).toEqual([2, -1.09, "GFN2-xTB"]);
    // (its ends taken as they are: the first, the last)
    const ends = takeFrames([m], "first");
    expect(ends.ok && ends.kept.map((e) => e.xyz[3])).toEqual([0.74]);
  });

  it("puts a path one of whose sides stopped before its end out of Failed, the path as far as it came, in its program's words", () => {
    const w = workedOf("reaction-path", h2(), irc("The forward side stopped at ORCA's iteration cap before reaching an end"), ["orca"]) as Worked;
    expect([w.failed?.kind, w.failed?.why, w.after?.length]).toEqual(["not-converged", "The forward side stopped at ORCA's iteration cap before reaching an end", 1]);
  });

  it("is a path only at the level its start was found at: else it fails, naming both", () => {
    expect(isFailure(workedOf("reaction-path", h2(0.97, "GFN2-xTB"), irc(), ["orca"]))).toBe(false);
    const other = workedOf("reaction-path", h2(0.97, "B3LYP", "def2-SVP"), irc(), ["orca"]);
    expect(isFailure(other) && [other.kind, other.why]).toEqual(["failed", "The path is at GFN2-xTB, its start was found at B3LYP/def2-SVP: run it at the start's level"]);
    const none = workedOf("reaction-path", { ...h2(), calc: undefined } as SetEntry, irc(), ["orca"]);
    expect(isFailure(none) && none.why).toBe("The path is at GFN2-xTB, its start was found at no level said: run it at the start's level");
  });

  it("keeps the charge and multiplicity of the point it was given", () => {
    const w = workedOf("reaction-path", { ...h2(), charge: 1, multiplicity: 2 } as SetEntry, irc(), ["orca"]) as Worked;
    expect([w.charge, w.multiplicity]).toEqual([1, 2]);
  });

  it("refuses an output that marks no one point it started from, or marks an end", () => {
    const none = workedOf("reaction-path", h2(), { ...irc(), converged: [false, false, false, false] } as ReaderOutput, ["orca"]);
    expect(isFailure(none) && none.kind).toBe("no-geometry");
    const end = workedOf("reaction-path", h2(), { ...irc(), converged: [true, false, false, false] } as ReaderOutput, ["orca"]);
    expect(isFailure(end) && end.kind).toBe("no-geometry");
  });
});
