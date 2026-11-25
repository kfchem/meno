import { describe, expect, it } from "vitest";
import type { ReaderOutput } from "../../../../lib/calc/output";
import type { Molecule3D } from "../store/types";
import { setEntries, startedFrame, type SetEntry } from "./entries";
import { isFailure, STOPPED_SAID, workedOf } from "./programs";
import { resultsOf, type Worked } from "./run";
import { takeFrames } from "./takeFrames";
import { stoppedSaid } from "./failures";

/** H2, as a step's entry, its bond `d` A long - found at `method` (a saddle point's frequencies, say). */
const h2 = (d = 0.97, method = "TB2", basis?: string): SetEntry =>
  ({ compound: 0, number: 1, atoms: [{ el: "H" }, { el: "H" }], bonds: [{ a1: 0, a2: 1, order: 1 }], xyz: [0, 0, 0, d, 0, 0], calc: { readers: ["quanta"], program: "Quanta", method, ...(basis ? { basis } : {}) } }) as unknown as SetEntry;

/** What Quanta's IRC read back, one end to the other, its start marked; a side stopped at its cap where `stopped`. */
const irc = (stopped?: string): ReaderOutput =>
  ({
    schema: 1,
    program: "Quanta",
    method: "TB2",
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
    const w = workedOf("reaction-path", h2(), irc(), ["quanta"]) as Worked;
    expect(isFailure(w)).toBe(false);
    // (a path that reached its ends: none said stopped)
    expect(w.stopped).toBeUndefined();
    const m = molecule(w);
    expect([m.frames?.length, m.entryFrames, m.energies]).toEqual([3, [2], [-1.17, -1.1, -1.09, -1.12]]);
    expect(startedFrame(m)).toBe(2);
    const [entry] = setEntries([m], "molecules");
    expect([entry.frame, entry.energy, entry.calc?.method]).toEqual([2, -1.09, "TB2"]);
    // (its ends taken as they are: the first, the last)
    const ends = takeFrames([m], "first");
    expect(ends.ok && ends.kept.map((e) => e.xyz[3])).toEqual([0.74]);
  });

  it("keeps a path one of whose sides stopped before its end, as far as it came, its ends where it stopped - for the steps after it to decide", () => {
    const why = "The forward side stopped at Quanta's iteration cap before reaching an end";
    const w = workedOf("reaction-path", h2(), irc(why), ["quanta"]) as Worked;
    // (no failure: the path whole, said as stopped, in its program's words)
    expect([w.failed, w.stopped, w.after?.length]).toEqual([undefined, why, 1]);
    const m = molecule(w);
    expect([m.frames?.length, m.entryFrames, m.failed]).toEqual([3, [2], undefined]);
    // (its ends taken as they are, for the steps after it - their optimisation, their bonding compared - to say what they are)
    const first = takeFrames([m], "first");
    const last = takeFrames([m], "last");
    expect([first.ok && first.kept.map((e) => e.xyz[3]), last.ok && last.kept.map((e) => e.xyz[3])]).toEqual([[0.74], [1.1]]);
    // (its program's words kept on its calculation, as they came)
    expect(w.calc?.warnings?.map((x) => x.text)).toEqual([why]);
    // (where its program gave none: Meno's words, on the line and on the molecule alike)
    const silent = workedOf("reaction-path", h2(), { ...irc(), optimised: false } as ReaderOutput, ["quanta"]) as Worked;
    expect([silent.stopped, silent.calc?.warnings]).toEqual([STOPPED_SAID, [{ kind: "other", text: STOPPED_SAID }]]);
    expect(stoppedSaid(1)).toBe("1 not converged, kept as far as it came");
    expect(stoppedSaid(2)).toBe("2 not converged, kept as far as they came");
  });

  it("is a path only at the level its start was found at: else it fails, naming both", () => {
    expect(isFailure(workedOf("reaction-path", h2(0.97, "TB2"), irc(), ["quanta"]))).toBe(false);
    const other = workedOf("reaction-path", h2(0.97, "B3LYP", "def2-SVP"), irc(), ["quanta"]);
    expect(isFailure(other) && [other.kind, other.why]).toEqual(["failed", "The path is at TB2, its start was found at B3LYP/def2-SVP: run it at the start's level"]);
    const none = workedOf("reaction-path", { ...h2(), calc: undefined } as SetEntry, irc(), ["quanta"]);
    expect(isFailure(none) && none.why).toBe("The path is at TB2, its start was found at no level said: run it at the start's level");
  });

  it("keeps the charge and multiplicity of the point it was given", () => {
    const w = workedOf("reaction-path", { ...h2(), charge: 1, multiplicity: 2 } as SetEntry, irc(), ["quanta"]) as Worked;
    expect([w.charge, w.multiplicity]).toEqual([1, 2]);
  });

  it("refuses an output that marks no one point it started from, or marks an end", () => {
    const none = workedOf("reaction-path", h2(), { ...irc(), converged: [false, false, false, false] } as ReaderOutput, ["quanta"]);
    expect(isFailure(none) && none.kind).toBe("no-geometry");
    const end = workedOf("reaction-path", h2(), { ...irc(), converged: [true, false, false, false] } as ReaderOutput, ["quanta"]);
    expect(isFailure(end) && end.kind).toBe("no-geometry");
  });
});
