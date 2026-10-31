import { describe, expect, it } from "vitest";
import { addMolecule3d, emptyWorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { countOf, setEntries } from "./entries";
import { addSet } from "./model";
import { clock, conformersWorked, doneSaid, entryFiles, hartrees, isFailure, jobEntries, pluginEntry, readCollected, readKept, readNote, readPrepared, readRefused, sameCompound, UNLINKED_WHY, workedOf } from "./programs";
import { runMeno } from "./meno";
import type { SetEntry } from "./entries";
import { resultsOf, type Worked } from "./run";

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
    // (the memory its plugin declares, in MiB, for the queue to count: a whole number within reason, else none said)
    expect(readPrepared({ jobs: [{ ...job, memory: 12000 }] }, 1)).toEqual([{ ...job, memory: 12000 }]);
    for (const memory of [0, -5, 1.5, "8GB", 2 ** 40]) expect(readPrepared({ jobs: [{ ...job, memory }] }, 1)).toEqual([job]);
    // (the cores it takes, where its plugin says so - ORCA with no MPI, one: a whole number, at least one, else none said)
    expect(readPrepared({ jobs: [{ ...job, cores: 1 }] }, 1)).toEqual([{ ...job, cores: 1 }]);
    for (const cores of [0, -1, 1.5, "1"]) expect(readPrepared({ jobs: [{ ...job, cores }] }, 1)).toEqual([job]);
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

  it("leave out an entry the plugin refused, saying why - the others run; never a job for one refused", () => {
    const refused = [{ entry: 1, why: " xTB: no isotope's mass. " }];
    const raw = { jobs: [job, { ...job, entries: [2] }], refused };
    expect(readPrepared(raw, 3)).toEqual([job, { ...job, entries: [2] }]);
    // (its kind core's - `refused` where it names none, `failed` where it names one core does not know)
    expect(readRefused(raw, 3)).toEqual([{ entry: 1, kind: "refused", why: "xTB: no isotope's mass." }]);
    expect(readRefused({ ...raw, refused: [{ ...refused[0], kind: "out-of-memory" }] }, 3)).toEqual([{ entry: 1, kind: "failed", why: "xTB: no isotope's mass." }]);
    expect(readPrepared({ ...raw, jobs: [job, { ...job, entries: [1, 2] }] }, 3)).toBe("It prepared a job for what it refused");
    // (named wrongly - beyond those sent, twice, without why: none taken, and the entry is then in no job)
    for (const bad of [[{ entry: 3, why: "x" }], [refused[0], refused[0]], [{ entry: 1 }]]) {
      expect(readRefused({ ...raw, refused: bad }, 3)).toEqual([]);
      expect(readPrepared({ ...raw, refused: bad }, 3)).toBe("It prepared no job for some of what came in");
    }
  });

  it("say what the plugin says of how it prepared them, in a line of plain words - none where it says none", () => {
    expect(readNote({ jobs: [job], note: "  frequencies computed\n numerically " })).toBe("frequencies computed numerically");
    for (const raw of [{ jobs: [job] }, { jobs: [job], note: " " }, { jobs: [job], note: 3 }, null]) expect(readNote(raw)).toBeUndefined();
    expect(readNote({ jobs: [job], note: "x".repeat(400) })?.length).toBe(300);
  });
});

describe("what a plugin reads back of a job", () => {
  const out = { schema: 1, program: "xtb", version: "6.7.1", method: "GFN2-xTB", atoms: ["O", "H", "H"], frames: [WATER.xyz as number[], [0, 0, 0.01, 0, 0.77, 0.58, 0, -0.77, 0.58]], energies: [-5.0703, -5.0705], optimised: true };

  it("is an output for each entry - or why the job gave none", () => {
    expect(readCollected({ outputs: [out] }, 1)).toEqual([out]);
    expect(readCollected({ why: "  Some atoms are very close  " }, 1)).toEqual({ why: "Some atoms are very close", kind: "program-error" });
    // (of the kind its plugin says, one of core's - an optimisation that did not converge - else, a kind core has not, failed)
    expect(readCollected({ why: "The optimisation did not converge in 50 cycles", kind: "not-converged" }, 1)).toEqual({ why: "The optimisation did not converge in 50 cycles", kind: "not-converged" });
    expect(readCollected({ why: "It stopped", kind: "exploded" }, 1)).toEqual({ why: "It stopped", kind: "failed" });
    expect(readCollected({ outputs: [] }, 1)).toEqual({ why: "It read back nothing for it" });
    // (an output Meno cannot take fails its entry alone, the job's others taken)
    expect(readCollected({ outputs: [{ ...out, schema: 2 }, out] }, 2)).toEqual([{ kind: "failed", why: "It read it back in a form this Meno does not read" }, out]);
    expect(readCollected({ outputs: [{ ...out, frames: [[1, 2]] }] }, 1)).toEqual([{ kind: "no-geometry", why: "It read back no geometry" }]);
    expect(readCollected({ outputs: [{ ...out, frames: [null, WATER.xyz] }] }, 1)).toEqual([{ kind: "no-geometry", why: "It read back a geometry Meno cannot read" }]);
    // (and an entry its plugin says failed, why and of what kind - one core knows, else failed - its words kept)
    expect(readCollected({ outputs: [out, { why: " xtb wrote back another molecule ", kind: "wrong-molecule" }, { why: "odd", kind: "melted" }] }, 3)).toEqual([
      out,
      { kind: "wrong-molecule", why: "xtb wrote back another molecule" },
      { kind: "failed", why: "odd" },
    ]);
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
    if (isFailure(w)) throw new Error(w.why);
    expect(w.xyz).toEqual(out.frames[1]);
    expect(w.energy).toBe(-5.0705);
    expect(w.path).toEqual([WATER.xyz]);
    expect(w.pathEnergies).toEqual([-5.0703]);
    expect(w.calc).toMatchObject({ readers: ["xtb 6.7.1"], program: "xtb", method: "GFN2-xTB", optimised: true });
    // (an energy keeps no path; another molecule is refused)
    const energy = workedOf("energy", WATER, { ...out, frames: [WATER.xyz as number[]], energies: [-5.07] }, ["xtb 6.7.1"]);
    expect(!isFailure(energy) && energy.path).toBeFalsy();
    expect(workedOf("energy", WATER, { ...out, atoms: ["O", "H", "C"] }, ["xtb 6.7.1"])).toEqual({ kind: "wrong-molecule", why: "What came back is not the molecule that went" });
    expect(workedOf("energy", WATER, { ...out, frames: [[1, 2]] }, ["xtb 6.7.1"])).toEqual({ kind: "no-geometry", why: "It read back no geometry" });
  });

  it("starts a failed run's entry from its geometry alone: no energy, calculation or mark of it carried on, where the program reads none", () => {
    // (a run that stopped, its entry out of Failed - with an energy on it, as a stale one would be - worked out again by a program that read no energy)
    const stopped: SetEntry = { ...WATER, energy: -76.1, calc: { readers: [], program: "ORCA", method: "B3LYP" }, failed: { kind: "program-error", why: "ORCA finished by error termination in SCF" } };
    const unread = { ...out, energies: undefined };
    const w = workedOf("optimise", stopped, unread, ["xtb 6.7.1"]);
    if (isFailure(w)) throw new Error(w.why);
    expect(w.energy).toBeUndefined();
    expect(w.failed).toBeUndefined();
    expect(w.calc).toMatchObject({ program: "xtb" });
    // (and where it reads one, that one alone)
    const read = workedOf("optimise", stopped, out, ["xtb 6.7.1"]);
    expect(!isFailure(read) && read.energy).toBe(-5.0705);
  });

  it("gives back none of what the entry came with that is not so of what the program worked out: how it was made, what its energies were from, its stereo labels", () => {
    // (water made by a conformer search, its energy MMFF94's, optimised by xTB: its energy is now xTB's, and says so only)
    const made = { ...WATER, calc: { readers: [], program: "RDKit", method: "MMFF94" }, keep: { made: { how: [], energies: "MMFF94" } } };
    const w = workedOf("optimise", made, out, ["xtb 6.7.1"]);
    if (isFailure(w)) throw new Error(w.why);
    expect(w.keep).toBeUndefined();
    expect(w.calc).toMatchObject({ program: "xtb", method: "GFN2-xTB" });
    // (made from a structure drawn: that link kept - it is still that compound - but not how it was made, nor its labels, which were of the geometry it came with)
    const drawn = { ...made, keep: { drawnFrom: [11, 12, 13], drawnAs: "drawn", stereo: { atoms: { 0: "R" }, bonds: {} }, made: { how: [], energies: "MMFF94" }, centres: [{ metal: 0, atoms: [1, 2] }] } };
    const linked = workedOf("optimise", drawn, out, ["xtb 6.7.1"]);
    if (isFailure(linked)) throw new Error(linked.why);
    expect(linked.keep).toEqual({ drawnFrom: [11, 12, 13], drawnAs: "drawn", centres: [{ metal: 0, atoms: [1, 2] }] });
    // (a conformer search's conformers likewise - each with the search's calculation, none with the entry's own)
    const found = conformersWorked(made, { schema: 1, program: "CREST", atoms: ["O", "H", "H"], frames: [WATER.xyz as number[], WATER.xyz as number[]], energies: [-5, -4.99] }, ["crest 3.0"]);
    if (isFailure(found)) throw new Error(found.why);
    expect(found.map((f) => [f.keep, f.calc?.program])).toEqual([
      [undefined, "CREST"],
      [undefined, "CREST"],
    ]);    // (and made from a structure drawn: each linked to it - but one whose bonds the search changed, not)
    const moved = conformersWorked(drawn, { schema: 1, program: "CREST", atoms: ["O", "H", "H"], frames: [WATER.xyz as number[], [0, 0, 0, 0, 0.76, 0.59, 0, -3, 0.59]], energies: [-5, -4.99] }, ["crest 3.0"]);
    if (isFailure(moved)) throw new Error(moved.why);
    expect(moved.map((f) => f.keep)).toEqual([{ drawnFrom: [11, 12, 13], drawnAs: "drawn", centres: [{ metal: 0, atoms: [1, 2] }] }, { made: { how: [{ label: "Drawing", text: UNLINKED_WHY }] } }]);
  });

  it("drops the link to the structure drawn where the calculation broke or formed a bond, or gave another charge - and says so", () => {
    const drawn: SetEntry = { ...WATER, keep: { drawnFrom: [11, 12, 13], drawnAs: "drawn" } };
    // (one hydrogen gone off, 3 Å away: a bond broken)
    const broken = workedOf("optimise", drawn, { ...out, frames: [WATER.xyz as number[], [0, 0, 0, 0, 0.76, 0.59, 0, -3, 0.59]] }, ["xtb 6.7.1"]);
    if (isFailure(broken)) throw new Error(broken.why);
    expect(broken.keep).toEqual({ made: { how: [{ label: "Drawing", text: UNLINKED_WHY }] } });
    // (the two hydrogens brought together: a bond formed)
    const formed = workedOf("optimise", drawn, { ...out, frames: [[0, 0, 0, 0, 0.76, 0.59, 0, 0.1, 0.9]] }, ["xtb 6.7.1"]);
    expect(!isFailure(formed) && formed.keep?.drawnFrom).toBeFalsy();
    // (its own charge, -1 on the oxygen, the calculation said 0: another species)
    const other = workedOf("energy", drawn, { ...out, frames: [WATER.xyz as number[]], energies: [-5], charge: 0 }, ["xtb 6.7.1"]);
    expect(!isFailure(other) && other.keep?.drawnFrom).toBeFalsy();
    const same = workedOf("energy", drawn, { ...out, frames: [WATER.xyz as number[]], energies: [-5], charge: -1 }, ["xtb 6.7.1"]);
    expect(!isFailure(same) && same.keep).toEqual({ drawnFrom: [11, 12, 13], drawnAs: "drawn" });
    expect(sameCompound(WATER, out.frames[1])).toBe(true);
  });

  it("keeps conformers optimised linked to the structure drawn, through to their populations - what it was made from riding with them as properties", () => {
    // (a generated structure's provenance: a model's NLL, a descriptor, what it was made from)
    const properties = {
      nll: { value: 21.5, unit: "none" as const, status: "computed" as const },
      mw: { value: 18.02, unit: "g/mol" as const, status: "computed" as const },
      "made_from.smiles": { value: "O", unit: "none" as const, status: "computed" as const },
    };
    const drawn: SetEntry = { ...WATER, properties, keep: { drawnFrom: [11, 12, 13], drawnAs: "drawn" } };
    const searched = conformersWorked(drawn, { schema: 1, program: "RDKit", atoms: ["O", "H", "H"], frames: [WATER.xyz as number[], [0, 0, 0.02, 0, 0.75, 0.6, 0, -0.75, 0.6]], energies: [-1, -0.99] }, []);
    if (isFailure(searched)) throw new Error(searched.why);
    const conformers = resultsOf({ ok: true, holds: "conformers", kept: searched.map((e) => ({ ...e, keep: drawn.keep })), aside: [], said: "" }, "conformers").molecules;
    const optimised = setEntries(conformers.map((m, i) => ({ ...m, id: i + 1, at: { x: 0, y: 0 } })), "conformers").map((e) => {
      const w = workedOf("optimise", e, { ...out, frames: [e.xyz as number[], e.xyz.map((v, k) => (k === 2 ? v + 0.01 : v))], energies: [-5.07, e.number === 1 ? -5.0705 : -5.0702] }, ["xtb 6.7.1"]);
      if (isFailure(w)) throw new Error(w.why);
      return w;
    });
    const mols = resultsOf({ ok: true, holds: "conformers", kept: optimised, aside: [], said: "" }, "conformers").molecules;
    expect(mols.map((m) => [m.drawnFrom, m.drawnAs])).toEqual([[[11, 12, 13], "drawn"]]);
    const populated = runMeno("populations", setEntries(mols.map((m, i) => ({ ...m, id: i + 1, at: { x: 0, y: 0 } })), "conformers"), "conformers");
    if (!populated.ok) throw new Error(populated.said);
    const shared = resultsOf(populated, "populations").molecules;
    expect(shared.map((m) => [m.drawnFrom, m.drawnAs, m.shares?.length])).toEqual([[[11, 12, 13], "drawn", 2]]);
    for (const e of setEntries(mols.map((m, i) => ({ ...m, id: i + 1, at: { x: 0, y: 0 } })), "conformers")) expect(e.properties).toMatchObject(properties);
    for (const e of setEntries(shared.map((m, i) => ({ ...m, id: i + 1, at: { x: 0, y: 0 } })), "conformers")) expect(e.properties).toMatchObject(properties);
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
    if (isFailure(made)) throw new Error(made.why);
    expect(made.map((w) => [w.compound, w.number, w.energy])).toEqual([
      [3, 1, -1],
      [3, 2, -0.99],
    ]);
    expect(made[0].calc).toMatchObject({ program: "RDKit" });
  });

  it("keeps a search's results - of its run, how it took conformers as one - with the conformer set; a job per conformer's, with none", () => {
    const rmsd = { id: "search.rmsd", on: "molecule", group: "Same conformer", label: "RMSD threshold", value: 0.125, unit: "Å" };
    const out = { schema: 1, program: "CREST", atoms: ["O", "H", "H"], frames: [WATER.xyz as number[], [0, 0, 0.1, 0, 0.7, 0.6, 0, -0.7, 0.6]], energies: [-1, -0.99], results: [rmsd] };
    const made = conformersWorked(WATER, out, ["crest 3.0"]);
    if (isFailure(made)) throw new Error(made.why);
    const [m] = resultsOf({ ok: true, holds: "conformers", kept: made, aside: [], said: "" }, "conformers").molecules;
    expect(m.calc?.results?.map((r) => [r.id, r.on === "molecule" ? r.value : null])).toEqual([["search.rmsd", 0.125]]);
    // (the same conformers, each a job of its own: what the first's found is of it alone, not the compound's)
    expect(resultsOf({ ok: true, holds: "conformers", kept: made, aside: [], said: "" }, "frequencies").molecules[0].calc?.results).toBeUndefined();
  });

  it("keeps the program's own populations, where it gives one for each conformer", () => {
    const out = { schema: 1, program: "CREST", atoms: ["O", "H", "H"], frames: [WATER.xyz as number[], [0, 0, 0.1, 0, 0.7, 0.6, 0, -0.7, 0.6]], energies: [-1, -0.99], populations: [0.7, 0.3] };
    const made = conformersWorked(WATER, out, []);
    if (isFailure(made)) throw new Error(made.why);
    expect(made.map((w) => w.share)).toEqual([0.7, 0.3]);
    // (and each one's degeneracy, kept with the molecule for a Boltzmann weight to count in)
    const counted = conformersWorked(WATER, { ...out, degeneracies: [1, 2] }, []);
    if (isFailure(counted)) throw new Error(counted.why);
    expect(counted.map((w) => w.degeneracy)).toEqual([1, 2]);
    expect(resultsOf({ ok: true, holds: "conformers", kept: counted, aside: [], said: "" }, "conformers").molecules[0].degeneracies).toEqual([1, 2]);
    // (all one, or not a whole number for each: none kept)
    expect(resultsOf({ ok: true, holds: "conformers", kept: made, aside: [], said: "" }, "conformers").molecules[0].degeneracies).toBeUndefined();
    const odd = conformersWorked(WATER, { ...out, degeneracies: [1, 1.5] }, []);
    if (isFailure(odd)) throw new Error(odd.why);
    expect(odd.map((w) => w.degeneracy)).toEqual([undefined, undefined]);
    const without = conformersWorked(WATER, { ...out, populations: [0.7] }, []);
    if (isFailure(without)) throw new Error(without.why);
    expect(without.map((w) => w.share)).toEqual([undefined, undefined]);
    // (as the molecule's own shares, in its conformer set)
    expect(resultsOf({ ok: true, holds: "conformers", kept: made, aside: [], said: "" }, "conformers").molecules[0].shares).toEqual([0.7, 0.3]);
  });

  it("keeps each conformer's imaginary frequencies, as its frequency job judged them, with that conformer - not with the compound", () => {
    // (CREST's conformers, then each one's frequencies by xtb: the second a saddle point)
    const conformers: SetEntry[] = [WATER, { ...WATER, number: 2 }];
    const out = (imaginary: number[]) => ({ schema: 1, program: "xtb", atoms: ["O", "H", "H"], frames: [WATER.xyz as number[]], energies: [-1], imaginary });
    const done = conformers.map((e, i) => workedOf("frequencies", e, out(i === 1 ? [-382.63] : []), ["xtb 6.7.1"]));
    if (done.some(isFailure)) throw new Error("not done");
    const [m] = resultsOf({ ok: true, holds: "conformers", kept: done as Worked[], aside: [], said: "" }, "frequencies").molecules;
    // (the first judged none: none, apart from not judged)
    expect(m.imaginary).toEqual([[], [-382.63]]);
    expect(m.calc?.imaginary).toBeUndefined();
    // (taken on: the second named as no minimum)
    expect(setEntries([{ ...m, id: 2, at: { x: 0, y: 0 } }], "conformers").map((e) => e.imaginary)).toEqual([[], [-382.63]]);
    expect(setEntries([{ ...m, id: 2, at: { x: 0, y: 0 } }], "conformers").map((e) => e.calc?.imaginary)).toEqual([undefined, undefined]);
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
