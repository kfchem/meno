import { describe, expect, it } from "vitest";
import { readCoordinates } from "../../../../lib/io/coordinates";
import { createWorkspaceDocument, emptyWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { readCarried3D } from "./copyPaste";
import { noting } from "./readNotes";
import { readWorkspace, workspaceText } from "./workspace";
import { entryOfSet, setEntries, setMembers, setMolecules } from "../workflow/entries";
import { placeAsSet } from "../workflow/run";
import { coordinateMolecules, energyNoted, energyOf } from "./coordinates";
import { energiesFrom } from "../workflow/setTable";
import { MANIFESTS } from "../../../../lib/plugins/known";

/** The energy lines the plugins Meno carries declare (lib/plugins/manifest `quotedEnergies`): read where those plugins are added. */
const QUOTED = MANIFESTS.flatMap((m) => m.quotedEnergies ?? []);

// (made up for the test: a water and a methane, each under its name)
const TEXT = [
  "Water",
  "E = -76.4 Hartree",
  "0 1",
  "O 0.000000 0.000000 0.117300",
  "H 0.000000 0.757200 -0.469200",
  "H 0.000000 -0.757200 -0.469200",
  "Methane",
  "C 0.000000 0.000000 0.000000",
  "H 0.629118 0.629118 0.629118",
  "H -0.629118 -0.629118 0.629118",
  "H -0.629118 0.629118 -0.629118",
  "H 0.629118 -0.629118 -0.629118",
].join("\n");

describe("structures read from coordinates, placed", () => {
  const chosen = readCoordinates(TEXT).map((structure) => ({ structure, name: structure.name }));

  it("are molecules in 3D bonded by distance, their orders unknown, each called by its name, with what was said of it", () => {
    const [water, methane] = coordinateMolecules(chosen, "Pasted text");
    expect(water.bonds).toHaveLength(2);
    expect(methane.bonds).toHaveLength(4);
    expect([water.bondOrders, water.bondsFrom, water.title, water.name]).toEqual(["unknown", "distance", "Water", "Pasted text"]);
    expect(water.said).toEqual([
      { label: "Charge, multiplicity", text: "0 1" },
      { label: "Note", text: "E = -76.4 Hartree" },
    ]);
    expect(methane.said).toBeUndefined();
    expect([water.energies, methane.energies]).toEqual([[-76.4], undefined]);
  });

  it("take an energy a note gives in hartrees, and none in other units", () => {
    expect(energyOf(["E(RB3LYP) =  -154.987654321     A.U. after 12 cycles"])).toBe(-154.987654321);
    expect(energyOf(["G = -12.3 kcal/mol", "Imaginary frequencies: 0"])).toBeUndefined();
  });

  it("go on the page as a set of their own round them, its middle where they were asked for", () => {
    const ms = coordinateMolecules(chosen, "Pasted text");
    const doc = placeAsSet(emptyWorkspaceDocument(), ms, { x: 100, y: 50 }, { extentOf: () => ({ x0: -2, x1: 2, y0: -2, y1: 2 }) }, undefined, "made-up-si.pdf, p. 2");
    expect(doc.molecules3d).toHaveLength(2);
    expect(doc.sets).toHaveLength(1);
    const set = doc.sets![0];
    expect(set.name).toBe("made-up-si.pdf, p. 2");
    expect((set.x0 + set.x1) / 2).toBeCloseTo(100);
    expect((set.y0 + set.y1) / 2).toBeCloseTo(50);
    expect(setMembers(doc, set).molecules.sort()).toEqual(doc.molecules3d!.map((m) => m.id).sort());
  });
});

describe("what was said of a structure read from coordinates, saved", () => {
  it("is kept in the workspace's file and shown again as it opens - its charge and multiplicity, its notes - as it was", () => {
    const ms = coordinateMolecules(readCoordinates(TEXT).map((structure) => ({ structure, name: structure.name })), "Pasted text");
    const doc = placeAsSet(emptyWorkspaceDocument(), ms, { x: 0, y: 0 }, { extentOf: () => ({ x0: -2, x1: 2, y0: -2, y1: 2 }) });
    const saving = createWorkspaceDocument();
    const store = createEditorStore(saving);
    connectStoreToDocument(store, saving);
    saving.edit("as it was", () => doc);
    const ws = readWorkspace(workspaceText(store.getState()))!;
    expect(ws.leftOut).toBeUndefined();
    const opening = createWorkspaceDocument();
    const again = createEditorStore(opening);
    connectStoreToDocument(again, opening);
    again.getState().openWorkspace(ws, true);
    expect(opening.getState().molecules3d!.map((m) => m.said)).toEqual([
      [
        { label: "Charge, multiplicity", text: "0 1" },
        { label: "Note", text: "E = -76.4 Hartree" },
      ],
      undefined,
    ]);
  });

  it("leaves out a row that does not read, alone, and says so", () => {
    const [water] = coordinateMolecules(readCoordinates(TEXT).map((structure) => ({ structure, name: structure.name })), "Pasted text");
    const { value: m, left } = noting(() => readCarried3D({ ...water, at: { x: 0, y: 0 }, said: [{ label: "Note", text: "E = -76.4 Hartree" }, { label: "Note" }, 7] }));
    expect(m?.said).toEqual([{ label: "Note", text: "E = -76.4 Hartree" }]);
    expect(left).toEqual({ said: 2 });
  });
});

describe("the charge and multiplicity a text gives a structure read from its coordinates", () => {
  // (made up for the test: the methyl cation, its charge and multiplicity on the line before its atoms)
  const CATION = ["Methyl cation", "1 1", "C 0.000000 0.000000 0.000000", "H 1.087000 0.000000 0.000000", "H -0.543500 0.941370 0.000000", "H -0.543500 -0.941370 0.000000"].join("\n");
  const species = (text: string) => {
    const ms = coordinateMolecules(readCoordinates(text).map((structure) => ({ structure, name: structure.name })), "Pasted text");
    const doc = placeAsSet(emptyWorkspaceDocument(), ms, { x: 0, y: 0 }, { extentOf: () => ({ x0: -2, x1: 2, y0: -2, y1: 2 }) });
    return setEntries(setMolecules(doc, doc.sets![0]), "molecules").map((e) => entryOfSet(e, "x").species);
  };

  it("are what each step is told: a cation stays a cation and a singlet - never what its atoms alone say, a neutral radical", () => {
    expect(species(CATION)).toEqual([{ charge: 1, multiplicity: 1, from: { charge: "given", multiplicity: "given" } }]);
  });

  it("are none given where a title ends in two numbers: its number and another are no charge and multiplicity", () => {
    for (const title of ["Conformer 12 3", "TS 2 1"]) {
      const [m] = coordinateMolecules(readCoordinates([title, "C 0.000000 0.000000 0.000000", "H 1.087000 0.000000 0.000000", "H -0.543500 0.941370 0.000000", "H -0.543500 -0.941370 0.000000"].join("\n")).map((structure) => ({ structure, name: structure.name })), "Pasted text");
      expect(m.calc, title).toBeUndefined();
    }
  });

  it("are given only where the text gives them: a structure with none stated is as its atoms say", () => {
    expect(species(TEXT).map((s) => s?.from)).toEqual([
      { charge: "given", multiplicity: "given" },
      { charge: "atoms", multiplicity: "atoms" },
    ]);
  });
});

describe("the energy a structure's notes give it", () => {
  it("is an electronic energy a note names as one - in hartrees, after its value or in brackets after its name", () => {
    expect(energyOf(["E = -76.4 Hartree"])).toBe(-76.4);
    expect(energyOf(["SCF Done: E(RB3LYP) = -76.40 A.U."])).toBe(-76.4);
    expect(energyOf(["SCF energy (a.u.) = -154.987654"])).toBe(-154.987654);
    expect(energyOf(["FINAL SINGLE POINT ENERGY = -93.399651434575 Eh"])).toBe(-93.399651434575);
    expect(energyOf(["Electronic energy = -76.4 Hartree", "E = -76.4 Hartree"])).toBe(-76.4);
  });

  it("is never another quantity in its place, whichever comes first: a zero-point energy, a correction, a free energy, an enthalpy, a sum", () => {
    expect(energyOf(["ZPE = 0.021 Hartree", "E = -76.4 Hartree"])).toBe(-76.4);
    expect(energyOf(["Zero-point correction= 0.021234 (Hartree/Particle)", "E(RB3LYP) = -76.40 A.U."])).toBe(-76.4);
    expect(energyOf(["G = -76.38 Hartree", "E = -76.40 Hartree"])).toBe(-76.4);
    for (const note of ["ZPE = 0.021 Hartree", "Thermal correction to Gibbs Free Energy= 0.003 Hartree", "Sum of electronic and thermal Free Energies= -76.38 Hartree", "G = -76.38 Hartree", "H = -76.37 Eh", "Free energy = -76.38 Hartree"]) {
      expect(energyOf([note]), note).toBeUndefined();
    }
  });

  it("is none where two notes give two that differ - an MP2 energy and an HF one - never one of them chosen", () => {
    expect(energyOf(["E(MP2) = -76.30 au", "E(HF) = -76.01 au"])).toBeUndefined();
  });

  /** A water read from a text, its notes `notes`. */
  const water = (notes: string[]) =>
    coordinateMolecules(readCoordinates(["TS1", ...notes, "O 0.000000 0.000000 0.117300", "H 0.000000 0.757200 -0.469200", "H 0.000000 -0.757200 -0.469200"].join("\n")).map((structure) => ({ structure, name: structure.name })), "Pasted text")[0];

  it("is given a structure with what its note names it - its method with it - as what its energies are, shown and set apart from others' by it", () => {
    const m = water(["E(MP2) = -76.30 au"]);
    expect([m.energies, m.made]).toEqual([[-76.3], { how: [], energies: "E(MP2)" }]);
    expect(energiesFrom(m)).toBe("E(MP2)");
    expect(energiesFrom(water(["E(HF) = -76.01 au"]))).toBe("E(HF)");
  });

  it("is none of a structure whose notes give two that differ, saying why beside them", () => {
    const m = water(["E(MP2) = -76.30 au", "E(HF) = -76.01 au"]);
    expect([m.energies, m.made]).toEqual([undefined, undefined]);
    expect(m.said?.[m.said.length - 1]).toEqual({ label: "Energy", text: "none taken: its notes give E(MP2) = -76.3 and E(HF) = -76.01, which differ" });
  });

  it("is none of a structure whose notes give another quantity alone: the note shown, no energy given it", () => {
    const [m] = coordinateMolecules(readCoordinates(["TS1", "ZPE = 0.021 Hartree", "O 0.000000 0.000000 0.117300", "H 0.000000 0.757200 -0.469200", "H 0.000000 -0.757200 -0.469200"].join("\n")).map((structure) => ({ structure, name: structure.name })), "Pasted text");
    expect(m.energies).toBeUndefined();
    expect(m.said).toEqual([{ label: "Note", text: "ZPE = 0.021 Hartree" }]);
  });
});

describe("the energy a note names, among the ways notes write it", () => {
  // (each note, and whether it gives a geometry's electronic energy: a false refusal costs an energy not shown; a false taking, one that is wrong)
  const NOTES: [string, boolean][] = [
    ["E = -154.987654 Hartree", true], ["E(RB3LYP) = -154.98765 A.U.", true], ["SCF Done:  E(RB3LYP) =  -154.98765432     A.U. after   12 cycles", true],
    ["SCF energy (a.u.) = -154.98", true], ["Electronic energy = -154.98 Eh", true], ["Total energy = -154.98 Hartree", true], ["Final single point energy = -154.98 Eh", true],
    ["E(RB3LYP/6-31G(d)) = -154.98 Eh", true], ["E(CCSD(T)) = -154.98 Eh", true], ["E(B3LYP-D3(BJ)/def2-TZVP) = -154.98 Eh", true], ["E(wB97X-D/def2-TZVP) = -154.98 Eh", true],
    ["E(RB3LYP) = -154.98", true], ["E: -154.98 Eh", true], ["Total energy: -154.98 Eh", true], ["E_SCF = -154.98 Eh", true], ["Etot = -154.98 Eh", true], ["E_tot = -154.98 Eh", true], ["E(SCF) = -154.98 Eh", true],
    ["FINAL SINGLE POINT ENERGY -154.987654321", true], ["E = -1.5498765E+02 Eh", true], ["E = -154.987654 Eh; G = -154.90 Eh", true], ["Energy = -154.98 Eh", true], ["E (Hartree) = -154.98", true],
    ["E(MP2) = -155.123 Eh and E(HF) = -154.98 Eh", false],
    ["ZPE = 0.12345 Hartree", false], ["G = -154.90 Hartree", false], ["H = -154.91 Eh", false], ["E0 = -154.88 Eh", false], ["Zero-point energy = 0.1234 Eh", false], ["Thermal correction to Gibbs free energy = 0.0987 Hartree", false],
    ["Sum of electronic and zero-point Energies = -154.86 Hartree", false], ["Free energy = -154.90 Eh", false], ["Gibbs free energy = -154.90 Eh", false], ["Enthalpy = -154.91 Eh", false],
    ["E(corr) = -0.2345 Eh", false], ["E(T) = -0.0123 Eh", false], ["E(ZPE) = 0.1234 Eh", false], ["E(thermal) = 0.1345 Eh", false], ["E(ZPE-corrected) = -154.86 Eh", false], ["Total energy (E+ZPE) = -154.86 Eh", false], ["Energy (incl. ZPE) = -154.86 Eh", false],
    ["Total energy (free energy) = -154.90 Eh", false], ["E(rel) = 0.0123 Eh", false], ["E(dispersion) = -0.0123 Eh", false], ["E(D3) = -0.0123 Eh", false], ["E(solv) = -0.0123 Eh", false], ["E(vib) = 0.0123 Eh", false], ["E(int) = -0.0123 Eh", false],
    ["SCF Done: E(RB3LYP) = -154.9 A.U. ZPE = 0.12 Hartree", true],
  ];

  it("is taken from each that names one, and from none that names another quantity - a correction, a part of one, a sum", () => {
    const wrong = NOTES.filter(([note, taken]) => {
      const r = energyNoted([note], QUOTED);
      return (!!r && "energy" in r) !== taken;
    }).map(([note]) => note);
    expect(wrong).toEqual([]);
  });

  it("is none of two run together in one note that differ, both named", () => {
    expect(energyNoted(["E(MP2) = -155.123 Eh and E(HF) = -154.98 Eh"])).toEqual({ why: "its notes give E(MP2) = -155.123 and E(HF) = -154.98, which differ" });
  });

  it("is read as written - a power of ten, a colon - and named as it is", () => {
    expect(energyNoted(["E = -1.5498765E+02 Eh"])).toEqual({ energy: -154.98765, name: "E" });
    expect(energyNoted(["Total energy: -154.98 Eh"])).toEqual({ energy: -154.98, name: "Total energy" });
    // (a method's energy, its name and value as any note gives them, though the line is a program's)
    expect(energyNoted(["SCF Done:  E(RB3LYP) =  -154.98765432     A.U. after   12 cycles"])).toEqual({ energy: -154.98765432, name: "E(RB3LYP)" });
  });

  it("is read from a program's own line - with no \"=\" - only as the plugin added declares it, and named as it says", () => {
    const orca = "FINAL SINGLE POINT ENERGY      -154.987654321";
    expect(energyNoted([orca])).toBeNull();
    expect(energyNoted([orca], QUOTED)).toEqual({ energy: -154.987654321, name: "Final single point energy" });
    expect(energyNoted(["SCF Done:  E(RB3LYP) =  -154.98765432     A.U. after   12 cycles"], QUOTED)).toEqual({ energy: -154.98765432, name: "E(RB3LYP)" });
    // (the declarations of the plugins Meno carries, each from its program's printout)
    expect(QUOTED.map((q) => q.id).sort()).toEqual(["final-single-point", "scf-done"]);
  });

  it("is none of a bracket naming a part of an energy, a correction or a counterpoise, though it reads like a method", () => {
    for (const part of ["gCP", "CP", "NL", "vdW", "SRB", "XC", "Coul", "Exch", "Kin", "Nuc", "Rep", "BSSE"]) expect(energyNoted([`E(${part}) = -0.0123 Eh`]), part).toBeNull();
  });

  it("is taken of a final energy and an E_elec, named so", () => {
    expect(energyNoted(["Final energy = -154.98 Eh"])).toEqual({ energy: -154.98, name: "Final energy" });
    expect(energyNoted(["E_elec = -154.98 Eh"])).toEqual({ energy: -154.98, name: "E_elec" });
  });

  it("is never one with no unit and no method said: a bare E with a number", () => {
    expect(energyNoted(["E = -154.98"])).toBeNull();
  });
});
