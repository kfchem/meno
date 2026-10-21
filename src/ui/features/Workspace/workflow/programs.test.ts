import { describe, expect, it } from "vitest";
import { addMolecule3d, emptyWorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { countOf, setEntries } from "./entries";
import { addSet } from "./model";
import { clock, conformersWorked, doneSaid, entryFiles, hartrees, jobEntries, pluginEntry, readCollected, readKept, readPrepared, workedOf } from "./programs";
import type { SetEntry } from "./entries";
import { resultsOf } from "./run";

const WATER: SetEntry = {
  compound: 0,
  number: 1,
  atoms: [
    { el: "O", x: 0, y: 0, z: 0, charge: -1 },
    { el: "H", x: 0, y: 0, z: 0 },
    { el: "H", x: 0, y: 0, z: 0, radical: "doublet" },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  xyz: [0, 0, 0, 0, 0.76, 0.59, 0, -0.76, 0.59],
  name: "water",
};

describe("what a plugin is given of an entry", () => {
  it("is Meno's plain data at the entry's geometry, with its charge and multiplicity as Export reads them", () => {
    const e = pluginEntry(WATER);
    expect(e.atoms[1]).toEqual({ el: "H", x: 0, y: 0.76, z: 0.59 });
    expect(e.atoms[0].charge).toBe(-1);
    expect(e.bonds).toEqual([
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ]);
    // (11 electrons with the charge, one of them unpaired, on the radical)
    expect([e.charge, e.multiplicity, e.name]).toEqual([-1, 2, "water"]);
  });

  it("is a molecule read from a calculation in the state its calculation was: its charge and multiplicity, not its atoms' (none, as an output gives them)", () => {
    // (the ammonium ion, as an output of a cation gives it: five atoms, no charge on any)
    const nh4: Omit<Molecule3D, "id"> = {
      atoms: [{ el: "N", x: 0, y: 0, z: 0 }, ...[[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]].map(([x, y, z]) => ({ el: "H", x: 0.6 * x, y: 0.6 * y, z: 0.6 * z }))],
      bonds: [1, 2, 3, 4].map((h) => ({ a1: 0, a2: h, order: 1 })),
      at: { x: 0, y: 0 },
      calc: { readers: ["cclib 1.9rc1"], program: "ORCA", charge: 1, multiplicity: 1 },
    };
    const [entry] = setEntries([{ ...nh4, id: 1 }], "molecules");
    expect([pluginEntry(entry).charge, pluginEntry(entry).multiplicity]).toEqual([1, 1]);
    // (drawn and made in 3D - no calculation said otherwise - it is what its atoms say: neutral NH4, a doublet)
    const [drawn] = setEntries([{ ...nh4, calc: undefined, id: 2 }], "molecules");
    expect([pluginEntry(drawn).charge, pluginEntry(drawn).multiplicity]).toEqual([0, 2]);
  });

  it("gives an isotope its mass (NIST), where one is measured - none, where none is", () => {
    const heavy = pluginEntry({ ...WATER, atoms: WATER.atoms.map((a, i) => (i === 1 ? { ...a, isotope: 2 } : i === 2 ? { ...a, isotope: 99 } : a)) });
    expect(heavy.atoms[1]).toEqual({ el: "H", x: 0, y: 0.76, z: 0.59, isotope: 2, mass: 2.01410177812 });
    expect(heavy.atoms[2].isotope).toBe(99);
    expect(heavy.atoms[2].mass).toBeUndefined();
    expect(heavy.atoms[0].mass).toBeUndefined();
  });
});

describe("the jobs a plugin prepares", () => {
  const job = { entries: [0], program: "xtb", args: ["input.xyz", "--opt"], files: [{ name: "input.xyz", text: "3\n\n" }], reads: ["xtbopt.log"] };

  it("are taken as they are where they can be run: each entry in one, programs by name, files inside the job's folder", () => {
    expect(readPrepared({ jobs: [job, { ...job, entries: [1] }] }, 2)).toEqual([job, { ...job, entries: [1] }]);
    // (its program given one of its files to read: Gaussian's, run as `g16 <input`)
    const read = { ...job, program: "g16", args: [], stdin: "input.xyz" };
    expect(readPrepared({ jobs: [read] }, 1)).toEqual([read]);
    // (programs installed beside its own, run after it: ORCA's orca_2mkl)
    const then = { ...job, program: "orca", then: [{ program: "orca_2mkl", args: ["input", "-molden"] }] };
    expect(readPrepared({ jobs: [then] }, 1)).toEqual([then]);
    expect(readPrepared({ jobs: [{ ...job, then: [] }] }, 1)).toEqual([job]);
  });

  it("are refused where they cannot", () => {
    expect(readPrepared({ jobs: [] }, 1)).toBe("It prepared no job");
    expect(readPrepared({ jobs: [job] }, 2)).toBe("It prepared no job for some of what came in");
    for (const bad of [
      { ...job, program: "/bin/sh" },
      { ...job, program: "../xtb" },
      { ...job, entries: [3] },
      { ...job, files: [{ name: "../escape", text: "" }] },
      { ...job, files: [{ name: "/etc/passwd", text: "" }] },
      { ...job, reads: ["../../secret"] },
      { ...job, args: "--opt" },
      // (what its program reads must be a file written for it)
      { ...job, stdin: "other.xyz" },
      { ...job, stdin: "../input.xyz" },
      { ...job, stdin: 1 },
      // (a program after it by name alone, a few at most)
      { ...job, then: [{ program: "/bin/sh", args: [] }] },
      { ...job, then: [{ program: "orca_2mkl", args: "-molden" }] },
      { ...job, then: new Array(5).fill({ program: "orca_2mkl", args: [] }) },
      { ...job, then: "orca_2mkl" },
    ])
      expect(readPrepared({ jobs: [bad] }, 1)).toBe("It prepared a job Meno cannot run");
  });
});

describe("what a plugin reads back of a job", () => {
  const out = { schema: 1, program: "xtb", version: "6.7.1", method: "GFN2-xTB", atoms: ["O", "H", "H"], frames: [WATER.xyz as number[], [0, 0, 0.01, 0, 0.77, 0.58, 0, -0.77, 0.58]], energies: [-5.0703, -5.0705], optimised: true };

  it("is an output for each entry - or why the job gave none", () => {
    expect(readCollected({ outputs: [out] }, 1)).toEqual([out]);
    expect(readCollected({ why: "  Some atoms are very close  " }, 1)).toEqual({ why: "Some atoms are very close" });
    expect(readCollected({ outputs: [] }, 1)).toEqual({ why: "It read back nothing for it" });
    expect(readCollected({ outputs: [{ ...out, schema: 2 }] }, 1)).toEqual({ why: "It read it back in a form this Meno does not read" });
    expect(readCollected({ outputs: [{ ...out, frames: [[1, 2]] }] }, 1)).toEqual({ why: "It read back no geometry" });
    expect(readCollected({ outputs: [{ ...out, frames: [null, WATER.xyz] }] }, 1)).toEqual({ why: "It read back a geometry Meno cannot read" });
  });

  it("or, for each entry, an output for Meno's readers: its kind, and a file it read back or what the program printed - by a name inside its folder", () => {
    expect(readCollected({ read: [{ kind: "gaussian", file: "input.log", name: "water.log" }] }, 1)).toEqual({ read: [{ kind: "gaussian", file: "input.log", name: "water.log" }] });
    expect(readCollected({ read: [{ kind: "orca", log: true, name: "water.out" }] }, 1)).toEqual({ read: [{ kind: "orca", log: true, name: "water.out" }] });
    // (a file's name goes by its own, where none is given)
    expect(readCollected({ read: [{ kind: "gaussian", file: "input.log" }] }, 1)).toEqual({ read: [{ kind: "gaussian", file: "input.log", name: "input.log" }] });
    expect(readCollected({ read: [] }, 1)).toEqual({ why: "It read back nothing for it" });
    // (with the wavefunction the job wrote besides, to keep with what is read)
    const wavefunction = { kind: "molden", file: "input.molden.input", name: "water.molden" };
    expect(readCollected({ read: [{ kind: "orca", log: true, name: "water.out", wavefunction }] }, 1)).toEqual({ read: [{ kind: "orca", log: true, name: "water.out", wavefunction }] });
    for (const bad of [
      { kind: "Not A Kind", log: true, name: "a.out" },
      { kind: "orca", file: "../secret" },
      { kind: "orca", name: "a.out" },
      { kind: "orca", log: true, name: "/etc/a.out" },
      { kind: "orca", log: true, name: "a.out", wavefunction: { ...wavefunction, file: "../a.molden" } },
      { kind: "orca", log: true, name: "a.out", wavefunction: { ...wavefunction, kind: "Molden File" } },
      { kind: "orca", log: true, name: "a.out", wavefunction: "input.molden.input" },
    ]) {
      expect(readCollected({ read: [bad] }, 1)).toEqual({ why: "It said to read what Meno cannot" });
    }
  });

  it("makes the entry worked out: its last geometry and energy; an optimisation's path before it; what the calculation was", () => {
    const w = workedOf("optimise", WATER, out, ["xtb 6.7.1"]);
    if (typeof w === "string") throw new Error(w);
    expect(w.xyz).toEqual(out.frames[1]);
    expect(w.energy).toBe(-5.0705);
    expect(w.path).toEqual([WATER.xyz]);
    expect(w.pathEnergies).toEqual([-5.0703]);
    expect(w.calc).toMatchObject({ readers: ["xtb 6.7.1"], program: "xtb", method: "GFN2-xTB", optimised: true });
    // (an energy keeps no path; another molecule is refused)
    const energy = workedOf("energy", WATER, { ...out, frames: [WATER.xyz as number[]], energies: [-5.07] }, ["xtb 6.7.1"]);
    expect(typeof energy !== "string" && energy.path).toBeFalsy();
    expect(workedOf("energy", WATER, { ...out, atoms: ["O", "H", "C"] }, ["xtb 6.7.1"])).toBe("What came back is not the molecule that went");
  });

  it("gives back none of what the entry came with that is not so of what the program worked out: how it was made, what its energies were from", () => {
    // (water made by a conformer search, its energy MMFF94's, optimised by xTB: its energy is now xTB's, and says so only)
    const made = { ...WATER, calc: { readers: [], program: "RDKit", method: "MMFF94" }, keep: { drawnFrom: [], drawnAs: "", made: { how: [], energies: "MMFF94" } } };
    const w = workedOf("optimise", made, out, ["xtb 6.7.1"]);
    if (typeof w === "string") throw new Error(w);
    expect(w.keep).toBeUndefined();
    expect(w.calc).toMatchObject({ program: "xtb", method: "GFN2-xTB" });
    // (a conformer search's conformers likewise - each but the first with no calculation of the entry's own)
    const found = conformersWorked(made, { schema: 1, program: "CREST", atoms: ["O", "H", "H"], frames: [WATER.xyz as number[], WATER.xyz as number[]], energies: [-5, -4.99] }, ["crest 3.0"]);
    if (typeof found === "string") throw new Error(found);
    expect(found.map((f) => [f.keep, f.calc?.program])).toEqual([
      [undefined, "CREST"],
      [undefined, undefined],
    ]);
  });
});

describe("surfaces a job wrote, in cube files Meno reads itself", () => {
  it("are taken, one list for each entry: each row its file, the value it is drawn at, and what colours it", () => {
    const row = { label: "Promolecular density", file: "NCI-grad.cube", iso: 0.3, colour: { file: "NCI-dens.cube", from: -7, to: 7, label: "sign(λ2)ρ × 100 (a.u.)" } };
    expect(readCollected({ surfaces: [{ name: "Non-covalent interactions", rows: [row] }] }, 1)).toEqual({ surfaces: [{ name: "Non-covalent interactions", rows: [row] }] });
  });

  it("are refused where they cannot be read: a file outside the job's folder, a scale that runs nowhere, one too few", () => {
    const one = (r: Record<string, unknown>) => readCollected({ surfaces: [{ name: "NCI", rows: [{ label: "x", file: "a.cube", ...r }] }] }, 1);
    expect(one({ file: "../a.cube" })).toHaveProperty("why");
    expect(one({ colour: { file: "b.cube", from: 1, to: 1 } })).toHaveProperty("why");
    expect(one({ colour: { file: "/b.cube", from: 0, to: 1 } })).toHaveProperty("why");
    expect(one({})).toEqual({ surfaces: [{ name: "NCI", rows: [{ label: "x", file: "a.cube" }] }] });
    expect(readCollected({ surfaces: [] }, 1)).toHaveProperty("why");
  });
});

describe("the files a step takes besides", () => {
  const held = async (sha256: string) => (sha256 === "abc" ? { name: "water.molden", text: "[Molden Format]" } : undefined);
  it("are an entry's molecule's output, where it is of a kind the step takes - and the entry its last geometry", async () => {
    const source = { name: "water.molden", sha256: "abc", kind: "molden" };
    expect(await entryFiles({ last: true }, [source], ["molden", "wfx"], held)).toEqual([{ kind: "molden", name: "water.molden", text: "[Molden Format]" }]);
    // (of no kind it takes; not its last geometry; held nowhere; read from nothing)
    expect(await entryFiles({ last: true }, [{ ...source, kind: "orca" }], ["molden"], held)).toEqual([]);
    expect(await entryFiles({ last: false }, [source], ["molden"], held)).toEqual([]);
    expect(await entryFiles({ last: true }, [{ ...source, sha256: "def" }], ["molden"], held)).toEqual([]);
    expect(await entryFiles({ last: true }, [undefined], ["molden"], held)).toEqual([]);
    expect(await entryFiles({ last: true }, [source], [], held)).toEqual([]);
  });

  it("are the wavefunction kept with an entry's molecule, where its output is of no kind the step takes", async () => {
    // (ORCA's output read, its orbitals kept as a Molden file beside it)
    const output = { name: "water.out", sha256: "out", kind: "orca" };
    const wavefunction = { name: "water.molden", sha256: "abc", kind: "molden" };
    expect(await entryFiles({ last: true }, [output, wavefunction], ["molden", "wfx"], held)).toEqual([{ kind: "molden", name: "water.molden", text: "[Molden Format]" }]);
    expect(await entryFiles({ last: true }, [output, undefined], ["molden"], held)).toEqual([]);
  });
});

describe("a conformer search", () => {
  it("searches each compound of a conformer set once, from its first conformer - each entry of a compound set", () => {
    const e = (compound: number, number: number) => ({ ...WATER, compound, number });
    expect(jobEntries("conformers", [e(0, 1), e(0, 2), e(1, 1)], "conformers").map((x) => [x.compound, x.number])).toEqual([
      [0, 1],
      [1, 1],
    ]);
    expect(jobEntries("conformers", [e(0, 1), e(1, 1)], "molecules")).toHaveLength(2);
    expect(jobEntries("optimise", [e(0, 1), e(0, 2)], "conformers")).toHaveLength(2);
  });

  it("makes each geometry it gave a conformer of the compound, numbered in order", () => {
    const out = { schema: 1, program: "RDKit", atoms: ["O", "H", "H"], frames: [WATER.xyz as number[], [0, 0, 0.1, 0, 0.7, 0.6, 0, -0.7, 0.6]], energies: [-1, -0.99] };
    const made = conformersWorked({ ...WATER, compound: 3 }, out, ["rdkit 2026.03.6"]);
    if (typeof made === "string") throw new Error(made);
    expect(made.map((w) => [w.compound, w.number, w.energy])).toEqual([
      [3, 1, -1],
      [3, 2, -0.99],
    ]);
    expect(made[0].calc).toMatchObject({ program: "RDKit" });
  });

  it("keeps the program's own populations, where it gives one for each conformer", () => {
    const out = { schema: 1, program: "CREST", atoms: ["O", "H", "H"], frames: [WATER.xyz as number[], [0, 0, 0.1, 0, 0.7, 0.6, 0, -0.7, 0.6]], energies: [-1, -0.99], populations: [0.7, 0.3] };
    const made = conformersWorked(WATER, out, []);
    if (typeof made === "string") throw new Error(made);
    expect(made.map((w) => w.share)).toEqual([0.7, 0.3]);
    // (and each one's degeneracy, kept with the molecule for a Boltzmann weight to count in)
    const counted = conformersWorked(WATER, { ...out, degeneracies: [1, 2] }, []);
    if (typeof counted === "string") throw new Error(counted);
    expect(counted.map((w) => w.degeneracy)).toEqual([1, 2]);
    expect(resultsOf({ ok: true, holds: "conformers", kept: counted, aside: [], said: "" }, "conformers").molecules[0].degeneracies).toEqual([1, 2]);
    // (all one, or not a whole number for each: none kept)
    expect(resultsOf({ ok: true, holds: "conformers", kept: made, aside: [], said: "" }, "conformers").molecules[0].degeneracies).toBeUndefined();
    const odd = conformersWorked(WATER, { ...out, degeneracies: [1, 1.5] }, []);
    if (typeof odd === "string") throw new Error(odd);
    expect(odd.map((w) => w.degeneracy)).toEqual([undefined, undefined]);
    const without = conformersWorked(WATER, { ...out, populations: [0.7] }, []);
    if (typeof without === "string") throw new Error(without);
    expect(without.map((w) => w.share)).toEqual([undefined, undefined]);
    // (as the molecule's own shares, in its conformer set)
    expect(resultsOf({ ok: true, holds: "conformers", kept: made, aside: [], said: "" }, "conformers").molecules[0].shares).toEqual([0.7, 0.3]);
  });

  it("takes what a plugin kept at once by place - never one it was not given", () => {
    expect(readKept({ kept: [2, 0, 2] }, 3)).toEqual([0, 2]);
    expect(readKept({ kept: [3] }, 3)).toBe("It said nothing Meno can take");
    expect(readKept({}, 3)).toBe("It said nothing Meno can take");
  });
});

describe("what a step that ran jobs says", () => {
  it("says how long, and its energy - or how many of how many", () => {
    expect(clock(42_000)).toBe("0:42");
    expect(clock(723_000)).toBe("12:03");
    expect(clock(3_723_000)).toBe("1:02:03");
    expect(hartrees(-42.108712)).toBe("−42.108712 Eh");
    expect(hartrees(-0.0000001)).toBe("0.000000 Eh");
    expect(doneSaid([{ ...WATER, energy: -5.07054 }], 1, 12_000)).toBe("0:12 · E −5.070540 Eh");
    expect(doneSaid([WATER, WATER], 3, 65_000)).toBe("1:05 · 2 of 3");
  });
});

describe("a molecule whose frames are a path", () => {
  it("is one entry in a set - its last geometry, with its energy - not one for each frame", () => {
    const path: Omit<Molecule3D, "id"> = {
      atoms: WATER.atoms.map((a) => ({ ...a })),
      bonds: WATER.bonds.map((b) => ({ ...b })),
      frames: [[0, 0, 0, 0, 0.7, 0.6, 0, -0.7, 0.6], [0, 0, 0, 0, 0.77, 0.58, 0, -0.77, 0.58]],
      energies: [-5.0, -5.06, -5.07],
      path: true,
      at: { x: 0, y: 0 },
    };
    let doc = addMolecule3d(emptyWorkspaceDocument(), path);
    doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
    expect(countOf(doc, doc.sets![0])).toMatchObject({ holds: "molecules", entries: 1 });
    const [entry, ...more] = setEntries(doc.molecules3d!, "molecules");
    expect(more).toEqual([]);
    expect(entry.xyz).toEqual(path.frames![1]);
    expect(entry.energy).toBe(-5.07);
  });
});
