import { describe, expect, it } from "vitest";
import type { CalcInfo, ReaderOutput } from "../../../../lib/calc/output";
import { factor } from "../../../../lib/units";
import type { Molecule3D } from "../store/types";
import { entryOfSet, framesOf, setEntries, type SetEntry } from "./entries";
import { runMeno } from "./meno";
import { pairEntries, PATH_PAIR } from "./pairs";
import { isFailure, workedOf } from "./programs";
import { resultsOf, type Worked } from "./run";
import { framesMolecule } from "./setTable";
import { refinedFrame, takeFrames } from "./takeFrames";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { readWorkspace, workspaceText } from "../utils/workspace";

/** An optimisation's calculation, at `method`, converged. */
const optimisedAt = (method = "GFN2-xTB", more: Partial<CalcInfo> = {}): CalcInfo => ({ readers: ["cclib 1.9rc1"], program: "ORCA", method, optimised: true, ...more });
/** H2 as a step's entry, its bond `d` Å long, optimised at GFN2-xTB - and as `extra` says. */
const h2 = (number: number, d = 0.74, extra: Partial<SetEntry> = {}): SetEntry =>
  ({ compound: number - 1, number: 1, atoms: [{ el: "H" }, { el: "H" }], bonds: [{ a1: 0, a2: 1, order: 1 }], xyz: [0, 0, 0, d, 0, 0], calc: optimisedAt(), ...extra }) as unknown as SetEntry;
const hf = (): SetEntry => ({ ...h2(9), atoms: [{ el: "H" }, { el: "F" }] }) as unknown as SetEntry;

describe("a path search's pairs", () => {
  it("pairs each start with the end in its place, in order - refusing starts and ends of other numbers", () => {
    const p = pairEntries([h2(1), h2(2)], [h2(3, 1.1), h2(4, 1.2)], "order");
    expect("entries" in p && p.entries.map((e) => [e.number, e.compound, e.end?.compound])).toEqual([
      [1, 0, 2],
      [1, 1, 3],
    ]);
    expect(pairEntries([h2(1)], [h2(2), h2(3)], "order")).toEqual({ why: "Start holds 1 and End 2: in order, each start is paired with the end in its place" });
  });

  it("keeps how each was paired with it - in order by place alone, never a match of which is which - and writes it on its path", () => {
    const order = pairEntries([h2(1), h2(2)], [h2(3, 1.1), h2(4, 1.2)], "order");
    expect("entries" in order && order.entries.map((e) => e.paired)).toEqual(["in order, by place: start a #1 with end c #1", "in order, by place: start b #1 with end d #1"]);
    const each = pairEntries([h2(1)], [h2(3, 1.1)], "each");
    expect("entries" in each && each.entries[0].paired).toBe("each with each");
    const tagged = (e: SetEntry) => ({ ...e, properties: { pc: { value: "pc-1", unit: "none" as const, status: "computed" as const } } });
    const on = pairEntries([tagged(h2(1))], [tagged(h2(3, 1.1))], "property", "pc");
    expect("entries" in on && on.entries[0].paired).toBe("matched on pc");
  });

  it("pairs each with each at most as many as At most says - 10 unless raised", () => {
    const many = (n: number) => Array.from({ length: n }, (_, k) => h2(k + 1));
    expect(pairEntries(many(11), many(10), "each")).toEqual({ why: "Start holds 11 and End 10: each with each makes 110 pairs, and it makes at most 10 - match them on a property instead, or raise At most" });
    const raised = pairEntries(many(11), many(10), "each", "", PATH_PAIR, 110);
    expect("entries" in raised && raised.entries.length).toBe(110);
  });

  it("pairs each with each, or on a property - one with no end to pair with kept, refused with why", () => {
    const each = pairEntries([h2(1), h2(2)], [h2(3), h2(4)], "each");
    expect("entries" in each && each.entries.length).toBe(4);
    const tagged = (e: SetEntry, v: string) => ({ ...e, properties: { start: { value: v, unit: "none" as const, status: "computed" as const } } });
    const on = pairEntries([tagged(h2(1), "start-1"), tagged(h2(2), "start-2")], [tagged(h2(3), "start-2")], "property", "start");
    expect("entries" in on && on.entries.map((e) => e.end?.compound ?? null)).toEqual([null, 2]);
    expect("refused" in on && on.refused).toEqual([{ entry: 0, why: "a #1 is paired with no end: no entry of End has its start, start-1" }]);
    expect(pairEntries([h2(1)], [h2(2)], "property", " ")).toEqual({ why: "Name the property to pair them on" });
  });

  it("refuses a pair whose start or end is no converged optimisation, or the two not at one level: a barrier from its start would be none", () => {
    const why = (start: SetEntry, end: SetEntry) => {
      const p = pairEntries([start], [end], "order");
      return "refused" in p ? p.refused[0]?.why : p.why;
    };
    expect(why(h2(1, 0.74, { calc: optimisedAt("GFN2-xTB", { optimised: undefined }) }), h2(2, 1.1))).toBe("a #1 is no converged optimisation: optimise it first, at the path's level");
    expect(why(h2(1), h2(2, 1.1, { failed: { kind: "not-converged", why: "The optimisation did not converge" } }))).toBe("its end b #1 is no converged optimisation: optimise it first, at the path's level");
    expect(why(h2(1, 0.74, { calc: undefined }), h2(2, 1.1, { calc: undefined }))).toBe("a #1 and its end b #1 are no converged optimisations: optimise them first, at the path's level");
    expect(why(h2(1), h2(2, 1.1, { calc: optimisedAt("B3LYP", { basis: "def2-SVP" }) }))).toBe("a #1 (GFN2-xTB) and its end b #1 (B3LYP/def2-SVP) are not at one level: optimise both at the path's");
    // (one level, said in any case - its solvation none as none)
    expect(why(h2(1), h2(2, 1.1, { calc: optimisedAt("gfn2-xtb", { solvation: "none" }) }))).toBeUndefined();
  });

  it("refuses a pair of other atoms, or of another charge or spin: no path joins them", () => {
    const other = pairEntries([h2(1)], [hf()], "order");
    expect("refused" in other && other.refused[0].why).toBe("a #1 and its end i #1 are not the same atoms in one numbering: put the end in the start's numbering first (a reaction arrow's Atom map, then Export reaction in 3D…)");
    const ion = pairEntries([h2(1)], [h2(2, 0.74, { charge: 1, multiplicity: 2 })], "order");
    expect("refused" in ion && ion.refused[0].why).toBe("a #1 and its end b #1 are not of one charge and spin");
  });
});

describe("a path search's molecule", () => {
  // (four frames, as a program gave them in its summary's order: two images, the point refined between them and the last, then the last)
  const energies = [-1.17, -1.1, -1.09, -1.12];
  const out = (frequencies?: number[]): ReaderOutput => ({
    schema: 1,
    program: "ORCA",
    method: "GFN2-xTB",
    atoms: ["H", "H"],
    frames: [0.74, 0.9, 0.97, 1.1].map((d) => [0, 0, 0, d, 0, 0]),
    energies,
    converged: [false, false, true, false],
    ...(frequencies ? { imaginary: frequencies.filter((f) => f < 0) } : {}),
    results: [
      { id: "path.frame", on: "frames", group: "Path", label: "What it is", values: ["NEB image 1 of 3", "NEB image 2 of 3", "highest point refined", "NEB image 3 of 3"] },
      ...(frequencies ? [{ id: "vibrations", on: "list", group: "Vibrations", label: "Vibrations", columns: [{ label: "Frequency", quantity: "wavenumber" }], rows: frequencies.map((f) => ({ cells: [f] })) }] : []),
    ],
  });
  const molecule = (frequencies?: number[]): Molecule3D => {
    const w = workedOf("path-search", { ...h2(1), end: h2(2, 1.1) }, out(frequencies), ["orca"]);
    if (isFailure(w)) throw new Error(w.why);
    const [m] = resultsOf({ ok: true, holds: "molecules", kept: [w as Worked], aside: [], said: "" }, "path-search").molecules;
    return { ...m, id: 1, at: { x: 0, y: 0 } };
  };
  const KCAL = factor("Eh", "kcal/mol");

  it("is the path as frames, in the order given, its entry the point refined - each frame with its energy and what it is", () => {
    const m = molecule([-812.5, 4100.25]);
    expect(m.frames?.length).toBe(3);
    expect(m.energies).toEqual(energies);
    expect(m.entryFrames).toEqual([2]);
    expect(m.path).toBeUndefined();
    expect(refinedFrame(m)).toBe(2);
    // (a set takes the point refined as its entry: its places, its energy)
    const [entry] = setEntries([m], "molecules");
    expect([entry.frame, entry.energy, entry.xyz[3]]).toEqual([2, -1.09, 0.97]);
  });

  it("puts its calculation on the point refined - any other molecule's, an opened run's of one entry frame too, on its last", () => {
    const m = molecule([-812.5, 4100.25]);
    const all = () => [0, 1, 2, 3];
    // (the calculation's results with the frame it is of alone)
    const at = (x: Molecule3D) => setEntries([x], "molecules", all).map((e) => [e.frame, !!e.calc?.results, e.imaginary ?? null]);
    expect(at(m)).toEqual([
      [0, false, null],
      [1, false, null],
      [2, true, [-812.5]],
      [3, false, null],
    ]);
    // (no path search's - an opened run, one entry frame chosen: its frames saying nothing of a point refined, nor marked one by one)
    const opened: Molecule3D = { ...m, imaginary: undefined, calc: { ...m.calc!, results: m.calc!.results!.filter((r) => r.id !== "path.frame") } };
    expect(refinedFrame(opened)).toBeNull();
    expect(at(opened)).toEqual([
      [0, false, null],
      [1, false, null],
      [2, false, null],
      [3, true, [-812.5]],
    ]);
  });

  it("carries the barriers each way, worked out by Meno from the energies printed, each saying from which", () => {
    const [entry] = setEntries([molecule()], "molecules");
    const p = entryOfSet(entry, "x").properties;
    expect(p["path.E-barrier"].value).toBeCloseTo((-1.09 + 1.17) * KCAL, 9);
    expect(p["path.E-reverse-barrier"].value).toBeCloseTo((-1.09 + 1.12) * KCAL, 9);
    expect(p["path.E-barrier"]).toMatchObject({ unit: "kcal/mol", by: { program: "ORCA", treatment: "electronic, at GFN2-xTB: the energy of the highest point refined, less that of the path's start (its first image)" } });
    expect(p["path.E-reverse-barrier"].by?.treatment).toBe("electronic, at GFN2-xTB: the energy of the highest point refined, less that of the path's end (its last image)");
    // (how its start and end were paired, written on it where the pair said; none where it did not)
    expect(p).not.toHaveProperty("path.paired");
    const w = workedOf("path-search", { ...h2(1), end: h2(2, 1.1), paired: "in order, by place: start a #1 with end b #1" }, out(), ["orca"]);
    expect(!isFailure(w) && (w as Worked).properties?.["path.paired"]).toEqual({ value: "in order, by place: start a #1 with end b #1", unit: "none", status: "computed" });
    // (and kept with the molecule it makes, as its entry's)
    const [m] = resultsOf({ ok: true, holds: "molecules", kept: [w as Worked], aside: [], said: "" }, "path-search").molecules;
    const [again] = setEntries([{ ...m, id: 2, at: { x: 0, y: 0 } }], "molecules");
    expect(entryOfSet(again, "x").properties["path.paired"]?.value).toBe("in order, by place: start a #1 with end b #1");
  });

  it("says how many imaginary frequencies its point refined has, where they were worked out - for the chemist's Filter, Meno judging none", () => {
    const kept = (m: Molecule3D, conditions: string) => {
      const o = runMeno("filter", setEntries([m], "molecules"), "molecules", { conditions });
      if (!o.ok) throw new Error(o.said);
      return o.kept.length;
    };
    expect(kept(molecule([-812.5, 4100.25]), "imaginary = 1")).toBe(1);
    expect(kept(molecule([-812.5, 4100.25]), "imaginary.first > 800 cm-1")).toBe(1);
    // (worked out, and none: 0 - never taken for not worked out)
    expect(kept(molecule([300.5, 4100.25]), "imaginary = 0")).toBe(1);
    // (not worked out: no count at all - neither 1 nor 0)
    expect(kept(molecule(), "imaginary = 0")).toBe(0);
  });

  it("gives Take frames its point refined as its highest - and the first and last of its path as they are", () => {
    const m = molecule();
    const take = (which: "highest" | "first" | "last" | "entry") => {
      const o = takeFrames([m], which);
      if (!o.ok) throw new Error(o.said);
      return o;
    };
    expect(take("highest").kept.map((e) => e.frame)).toEqual([2]);
    expect(take("highest").said).toBe("1 frame of 1 molecule: the highest in energy (of each, its highest point refined)");
    expect(take("entry").kept.map((e) => e.frame)).toEqual([2]);
    expect([take("first").kept[0].frame, take("last").kept[0].frame]).toEqual([0, 3]);
    // (where an image stands higher than the point refined - as a program may give one - the point refined all the same)
    const higher = { ...m, energies: [-1.17, -1.0, -1.09, -1.12] };
    expect(takeFrames([higher], "highest")).toMatchObject({ ok: true, kept: [expect.objectContaining({ frame: 2 })] });
  });

  /** The molecule a Meno step after it makes of the point refined alone - a Filter's, keeping it - as Duplicates onwards do. */
  const refinedAlone = (m: Molecule3D): Molecule3D => {
    const o = runMeno("filter", setEntries([m], "molecules"), "molecules", { conditions: "imaginary = 1" });
    if (!o.ok) throw new Error(o.said);
    const [one] = resultsOf(o, "filter").molecules;
    return { ...one, id: 2, at: { x: 0, y: 0 } };
  };

  it("gives a step after it the point refined alone, with what its frames say of that frame only", () => {
    const m = molecule([-812.5, 4100.25]);
    const [entry] = setEntries([m], "molecules");
    expect(entry.calc?.results?.find((r) => r.id === "path.frame")).toMatchObject({ on: "frames", values: ["highest point refined"] });
    // (the rest of its calculation as it was: of the point refined)
    expect(entry.calc?.results?.find((r) => r.id === "vibrations")).toEqual(m.calc?.results?.find((r) => r.id === "vibrations"));
    expect(entry.imaginary).toEqual([-812.5]);
    // (the molecule made of it, of one frame: its point refined that frame - so a step after that one still has its calculation)
    const one = refinedAlone(m);
    expect(framesOf(one)).toBe(1);
    expect(refinedFrame(one)).toBe(0);
    const [again] = setEntries([one], "molecules");
    expect([again.calc?.results?.length, again.imaginary]).toEqual([2, [-812.5]]);
    expect(refinedAlone(one).calc?.results?.find((r) => r.id === "path.frame")).toMatchObject({ values: ["highest point refined"] });
  });

  it("keeps the point refined's calculation whole through a save and opening again: none of its results left out", () => {
    const one = refinedAlone(molecule([-812.5, 4100.25]));
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().pasteModel({ atoms: [], bonds: [], molecules3d: [{ ...one, at: { x: 0, y: 0 } }] });
    const ws = readWorkspace(workspaceText(store.getState()));
    expect(ws!.leftOut).toBeUndefined();
    const [opened] = ws!.drawn.molecules3d!;
    expect(opened.calc?.results?.map((r) => r.id)).toEqual(["path.frame", "vibrations"]);
  });

  it("puts the point refined's calculation with it alone, of its frames a set's table takes out - never on another frame of its path", () => {
    const path = molecule([-812.5, 4100.25]);
    // (a result of the molecule as a whole, as a program reads one: of the point refined, the geometry its calculation is of)
    const dipole = { id: "dipole", on: "molecule" as const, group: "Dipole", label: "Dipole moment", quantity: "dipole" as const, value: 1.5 };
    const m: Molecule3D = { ...path, calc: { ...path.calc!, results: [...path.calc!.results!, dipole] } };
    const out = (frames: number[]) => {
      const x = { ...framesMolecule(m, frames), id: 3, at: { x: 0, y: 0 } };
      const [entry] = setEntries([x], "molecules", (y) => [framesOf(y) - 1]);
      return { ids: x.calc?.results?.map((r) => r.id), said: x.calc?.results?.find((r) => r.id === "path.frame"), imaginary: entry.imaginary ?? null };
    };
    // (the point refined alone: its own calculation - its dipole, its imaginary frequency - and its frame's word)
    expect(out([2])).toEqual({ ids: ["path.frame", "dipole"], said: expect.objectContaining({ values: ["highest point refined"] }), imaginary: [-812.5] });
    // (its path's last image alone: its own word, and none of the point refined's - not its imaginary frequency)
    expect(out([3])).toEqual({ ids: ["path.frame"], said: expect.objectContaining({ values: ["NEB image 3 of 3"] }), imaginary: null });
    // (the two together: the point refined's with it, the last image after it its own frame)
    expect(out([2, 3]).ids).toEqual(["path.frame", "dipole"]);
  });

  it("fails a pair whose path is not at its ends' level, or says none - naming both", () => {
    const at = (method?: string) => workedOf("path-search", { ...h2(1), end: h2(2, 1.1) }, { ...out(), method }, ["orca"]);
    expect(at("B3LYP")).toEqual({ kind: "failed", why: "The path is at B3LYP, its ends were optimised at GFN2-xTB: optimise them at the path's level first" });
    expect(at(undefined)).toEqual({ kind: "failed", why: "It did not say the path's level: whether it is its ends' cannot be told" });
  });

  it("refuses an output with no point refined, or one at an end of its path", () => {
    const none = workedOf("path-search", { ...h2(1), end: h2(2) }, { ...out(), converged: [false, false, false, false] }, ["orca"]);
    expect(none).toEqual({ kind: "no-geometry", why: "It read back no one point refined on its path" });
    const atEnd = workedOf("path-search", { ...h2(1), end: h2(2) }, { ...out(), converged: [false, false, false, true] }, ["orca"]);
    expect(atEnd).toEqual({ kind: "no-geometry", why: "It read back no path with energies, its point refined between its ends" });
  });
});
