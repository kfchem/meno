import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerKinds } from "../../../../lib/io/kinds";
import { MANIFESTS } from "../../../../lib/plugins/known";
import { calcResult, editorModelOf, H_CHOSEN_SAID, openedPlace, opensAsText, processFileContent, recordsLeftOutSaid, xyzComments } from "./io";
import { useNotices } from "../../../notices";
import sampleSdf from "../../../../samples/cholesterol.sdf?raw";
import sampleRxn from "../../../../samples/esterification.rxn?raw";
import sampleXyz from "../../../../samples/cholesterol.xyz?raw";
import samplePdb from "../../../../samples/cholesterol.pdb?raw";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Molecule3D } from "../store/types";
import type { Unmarked } from "../../../../lib/calc/output";
import { entriesIn, setEntries } from "../workflow/entries";
import { notesOf, solidOf } from "./molecule3d";
import { readCarried3D } from "./copyPaste";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import { readMarks } from "./figures";
import { implicitHydrogens } from "../../../../lib/chem/molecule";

// (XYZ energies are read by the patterns of the plugins added: those of the programs that write them)
beforeAll(() => registerKinds(MANIFESTS.filter((m) => ["xtb", "crest", "orca"].includes(m.id))));
afterAll(() => registerKinds([]));

describe("processFileContent", () => {
  it("imports an SDF", async () => {
    const r = await processFileContent("cholesterol.sdf", sampleSdf);
    expect(r.model.atoms).toHaveLength(28);
    expect(r.arrow).toBeUndefined();
  });

  it("imports an RXN with its arrow", async () => {
    const r = await processFileContent("esterification.rxn", sampleRxn);
    expect(r.model.atoms.length).toBeGreaterThan(0);
    expect(r.arrow).toBeDefined();
  });

  it("imports a PDB file's atoms as a molecule in 3D", async () => {
    const r = await processFileContent("cholesterol.pdb", samplePdb);
    expect(r.model.atoms).toHaveLength(0);
    expect(r.molecules3d?.[0].atoms).toHaveLength(74);
  });

  it("names unsupported formats instead of showing a blank canvas", async () => {
    await expect(
      processFileContent("reaction.ket", '{"root":{"nodes":[]}}'),
    ).rejects.toThrow("KET files are not supported yet");
  });

  it("reports files that contain no molecules", async () => {
    await expect(processFileContent("notes.mol", "hello")).rejects.toThrow(
      "No molecules found in notes.mol.",
    );
    await expect(processFileContent("", "hello")).rejects.toThrow(
      "No molecules found in the file.",
    );
  });
});

describe("a file with no coordinates", () => {
  // (as some programs write one: every atom at 0, 0, 0 - opened as a pile, one label over the rest)
  const atomAt = (el: string, x = 0, y = 0) => `${x.toFixed(4).padStart(10)}${y.toFixed(4).padStart(10)}${"0.0000".padStart(10)} ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`;
  const bondOf = ([a, b, o]: number[]) => `${String(a).padStart(3)}${String(b).padStart(3)}${String(o).padStart(3)}  0`;
  const molfile = (title: string, els: string[], bonds: number[][], header = "  Meno", at: (i: number) => [number, number] = () => [0, 0]) =>
    [title, header, "", `${String(els.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
      ...els.map((el, i) => atomAt(el, ...at(i))), ...bonds.map(bondOf), "M  END"].join("\n");
  // ibuprofen
  const els = ["C", "C", "C", "C", "C", "C", "C", "C", "C", "C", "C", "C", "C", "O", "O"];
  const bonds = [[1, 2, 1], [2, 3, 1], [2, 4, 1], [4, 5, 1], [5, 6, 2], [6, 7, 1], [7, 8, 2], [8, 9, 1], [9, 10, 2], [10, 5, 1], [8, 11, 1], [11, 12, 1], [11, 13, 1], [13, 14, 2], [13, 15, 1]];
  const spread = (atoms: readonly { id: number; x: number; y: number }[], bs: readonly { a: number; b: number }[]) => {
    const at = new Map(atoms.map((a) => [a.id, a]));
    const lengths = bs.map((b) => Math.hypot(at.get(b.a)!.x - at.get(b.b)!.x, at.get(b.a)!.y - at.get(b.b)!.y));
    let nearest = Infinity;
    for (const [i, p] of atoms.entries()) for (const q of atoms.slice(i + 1)) nearest = Math.min(nearest, Math.hypot(p.x - q.x, p.y - q.y));
    return { shortest: Math.min(...lengths), longest: Math.max(...lengths), nearest };
  };

  it("is laid out as it is opened, as Clean-up lays a structure out", async () => {
    const r = await processFileContent("ibuprofen.mol", molfile("ibuprofen", els, bonds));
    expect(r.model.atoms).toHaveLength(15);
    const s = spread(r.model.atoms, r.model.bonds);
    expect(s.shortest).toBeGreaterThan(NOMINAL_BOND_LENGTH * 0.8);
    expect(s.longest).toBeLessThan(NOMINAL_BOND_LENGTH * 1.2);
    expect(s.nearest).toBeGreaterThan(NOMINAL_BOND_LENGTH * 0.5);
  });

  it("lays its fragments out side by side, and is no molecule in 3D whatever its header says", async () => {
    const salt = await processFileContent("salt.mol", molfile("salt", ["Na", "Cl", "C", "O"], [[3, 4, 1]], "  Meno          3D"));
    expect(salt.molecules3d ?? []).toHaveLength(0);
    expect(salt.model.atoms).toHaveLength(4);
    expect(spread(salt.model.atoms, salt.model.bonds).nearest).toBeGreaterThan(NOMINAL_BOND_LENGTH * 0.5);
  });

  it("lays out a reaction's molecules before the scheme is laid out: each clear of the arrow and the + between them", async () => {
    // (ethanol + acetic acid -> ethyl acetate, every atom of each at 0, 0)
    const rxn = ["$RXN", "", "  Meno", "", "  2  1", "$MOL", molfile("ethanol", ["C", "C", "O"], [[1, 2, 1], [2, 3, 1]]),
      "$MOL", molfile("acid", ["C", "C", "O", "O"], [[1, 2, 1], [2, 3, 2], [2, 4, 1]]),
      "$MOL", molfile("ester", ["C", "C", "O", "O", "C", "C"], [[1, 2, 1], [2, 3, 2], [2, 4, 1], [4, 5, 1], [5, 6, 1]])].join("\n");
    const r = await processFileContent("esterification.rxn", rxn);
    expect(r.model.atoms).toHaveLength(13);
    const s = spread(r.model.atoms, r.model.bonds);
    expect(s.shortest).toBeGreaterThan(NOMINAL_BOND_LENGTH * 0.8);
    expect(s.nearest).toBeGreaterThan(NOMINAL_BOND_LENGTH * 0.5);
    // (the arrow between the reactants and the product, none of their atoms on it)
    const a = r.arrow!;
    expect(r.model.atoms.filter((at) => at.x > a.x1 && at.x < a.x2)).toHaveLength(0);
  });

  it("lays out the records of an SD file that have none, and leaves the rest where they are", async () => {
    // (a first record drawn, a C-O; a second with no coordinates)
    const drawn = molfile("drawn", ["C", "O"], [[1, 2, 1]], "  Meno", (i) => [i * 1.5, 0]);
    const r = await processFileContent("two.sdf", `${drawn}\n$$$$\n${molfile("ibuprofen", els, bonds)}\n$$$$\n`);
    expect(r.model.atoms).toHaveLength(17);
    const first = r.model.atoms.slice(0, 2);
    expect(Math.hypot(first[0].x - first[1].x, first[0].y - first[1].y)).toBeCloseTo(NOMINAL_BOND_LENGTH, 1);
    const rest = r.model.atoms.slice(2);
    const ids = new Set(rest.map((a) => a.id));
    expect(spread(rest, r.model.bonds.filter((b) => ids.has(b.a))).nearest).toBeGreaterThan(NOMINAL_BOND_LENGTH * 0.5);
  });
});

describe("opensAsText", () => {
  it("takes a file of no kind as text, as Open does - not one Meno does not read yet, nor bytes", () => {
    expect(opensAsText("job.inp", "! B3LYP def2-SVP\n")).toBe(true);
    expect(opensAsText("README", "words")).toBe(true);
    expect(opensAsText("scheme.KET", '{"root":{}}')).toBe(false);
    expect(opensAsText("picture.png", "\u0089PNG\r\n\u001a\n\u0000\u0000\u0000\rIHDR")).toBe(false);
  });
});

describe("editorModelOf", () => {
  it("keeps what a bond is besides its order", () => {
    const model = editorModelOf({
      atoms: [
        { id: 1, x: 0, y: 0, el: "O" },
        { id: 2, x: 1, y: 0, el: "O" },
      ],
      bonds: [
        { id: 3, a: 1, b: 2, order: 1, hydrogen: true },
        { id: 4, a: 1, b: 2, order: 1, coordination: true },
        { id: 5, a: 1, b: 2, order: 2, query: "double-or-aromatic", stereo: "either" },
      ],
    });
    expect(model.bonds.map((b) => [b.hydrogen, b.coordination, b.query, b.stereo])).toEqual([
      [true, undefined, undefined, "none"],
      [undefined, true, undefined, "none"],
      [undefined, undefined, "double-or-aromatic", "either"],
    ]);
  });
});

/** A molfile of water, its header saying 2D or 3D, its atoms at the depths given. */
const water = (dim: "2D" | "3D", z: [number, number, number]) =>
  [
    "water",
    // (initials, the program in 8, the date and time in 10, then the dimensions: columns 21-22)
    `  Meno              ${dim}`,
    "",
    "  3  2  0  0  0  0  0  0  0  0999 V2000",
    `    0.0000    0.0000${z[0].toFixed(4).padStart(10)} O   0  0`,
    `    0.7570    0.5860${z[1].toFixed(4).padStart(10)} H   0  0`,
    `   -0.7570    0.5860${z[2].toFixed(4).padStart(10)} H   0  0`,
    "  1  2  1  0",
    "  1  3  1  0",
    "M  END",
    "",
  ].join("\n");

describe("files of 3D structures", () => {
  it("open an XYZ file as one molecule in 3D, its other frames kept", async () => {
    const r = await processFileContent("cholesterol.xyz", sampleXyz);
    expect(r.model.atoms).toHaveLength(0);
    expect(r.molecules3d).toHaveLength(1);
    expect(r.molecules3d![0].atoms).toHaveLength(74);
    expect(r.molecules3d![0].frames).toBeUndefined();
    const twoFrames = "2\nfirst\nH 0 0 0\nH 0.74 0 0\n2\nsecond\nH 0 0 0\nH 0.80 0 0\n";
    const t = await processFileContent("h2.xyz", twoFrames);
    expect(t.molecules3d![0].frames).toEqual([[0, 0, 0, 0.8, 0, 0]]);
  });

  it("open a trajectory whose last frame is cut short with the frames before it, the molecule saying how many were left out", async () => {
    const r = await processFileContent("md.xyz", "2\nfirst\nH 0 0 0\nH 0.74 0 0\n2\nsecond\nH 0 0 0\nH 0.80 0 0\n2\nthird\nH 0 0 0\n");
    expect(r.molecules3d![0].frames).toHaveLength(1);
    expect(r.molecules3d![0].framesLeftOut).toBe(1);
  });

  it("open an optimisation's steps, as a plugin knows its program's file of them - renamed too: no frame an entry, convergence not stated in it", async () => {
    // (xtb 6.7.1 writes an optimisation's steps to xtbopt.log, ORCA 6.1.1 to <name>_trj.xyz, each frame's comment line
    // as below: which converged is said in their outputs, not there)
    registerKinds(MANIFESTS.filter((m) => ["xtb", "crest", "orca"].includes(m.id)));
    const water = (comment: string, x: number) => `3\n${comment}\nO 0 0 0\nH ${x} 0 0\nH -0.24 0.93 0\n`;
    const xtb = water(" energy: -5.068684795763 gnorm: 0.065230900969 xtb: 6.7.1 (edcfbbe)", 0.99) + water(" energy: -5.070539 gnorm: 0.000312 xtb: 6.7.1 (edcfbbe)", 0.96);
    const orca = water("Coordinates from ORCA-job opt E -76.02", 0.99) + water("Coordinates from ORCA-job opt E -76.03", 0.96);
    // (ORCA's relaxed scan's points, each converged, and a conformer search's: ensembles)
    const scan = water("Coordinates from ORCA-job oscan Relaxed Surface Scan Step 1 E -113.549190716119", 0.99) + ">\n" + water("Coordinates from ORCA-job oscan Relaxed Surface Scan Step 2 E -113.545986", 0.96);
    const crest = water("        -5.07053900", 0.96) + water("        -5.06871200", 0.99);
    const opened = async (name: string, text: string) => (await processFileContent(name, text)).molecules3d![0];
    for (const [name, text] of [["xtbopt.log", xtb], ["opt.log", xtb], ["water_xtbopt.log", xtb], ["opt_trj.xyz", orca], ["OPT_TRJ.XYZ", crest], ["steps.xyz", orca]]) {
      const m = await opened(name, text);
      expect([m.entryFrames, m.noEntryWhy, entriesIn(m)], name).toEqual([[], "unstated", 0]);
    }
    for (const [name, text] of [["oscan.allxyz", scan], ["crest_conformers.xyz", crest], ["ensemble.xyz", crest], ["xtbopt.xyz", water(" energy: -5.0705 gnorm: 0.0003 xtb: 6.7.1", 0.96)]]) {
      const m = await opened(name, text);
      expect([m.entryFrames, entriesIn(m)], name).toEqual([undefined, name === "xtbopt.xyz" ? 1 : 2]);
    }
  });

  it("keep each frame's energy, where a calculation reader finds one", async () => {
    const frame = (comment: string, x: number) => `2\n${comment}\nH 0 0 0\nH ${x} 0 0\n`;
    const crest = await processFileContent("crest_conformers.xyz", frame("  -1.1700", 0.74) + frame("  -1.1650", 0.8));
    expect(crest.molecules3d![0].energies).toEqual([-1.17, -1.165]);
    expect(xyzComments(frame("first", 0.74) + frame(" second ", 0.8))).toEqual(["first", " second "]);
    const titled = await processFileContent("h2.xyz", frame("first", 0.74) + frame("second", 0.8));
    expect(titled.molecules3d![0].energies).toBeUndefined();
  });

  it("open a molfile that says it is 3D in 3D, even when it is flat", async () => {
    const r = await processFileContent("water.mol", water("3D", [0, 0, 0]));
    expect(r.molecules3d).toHaveLength(1);
    expect(r.model.atoms).toHaveLength(0);
  });

  it("open a molfile whose atoms spread in depth in 3D, whatever its header says", async () => {
    const r = await processFileContent("water.mol", water("2D", [0, 0.3, -0.3]));
    expect(r.molecules3d).toHaveLength(1);
  });

  it("open an SD file's 3D records in 3D and its flat ones as drawings", async () => {
    const r = await processFileContent("both.sdf", water("2D", [0, 0, 0]) + "$$$$\n" + water("3D", [0, 0.3, -0.3]) + "$$$$\n");
    expect(r.model.atoms).toHaveLength(3);
    expect(r.molecules3d).toHaveLength(1);
  });

  it("leave a flat 2D molfile a drawing", async () => {
    const r = await processFileContent("water.mol", water("2D", [0, 0, 0]));
    expect(r.molecules3d).toBeUndefined();
    expect(r.model.atoms).toHaveLength(3);
  });
});

describe("an aromatic ring whose file does not say which nitrogen carries its H", () => {
  // (imidazole, its five bonds aromatic - MOL bond type 4 - and no H stated)
  const imidazole = "imidazole\n  test\n\n  5  5  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.8500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n   -0.8084    0.2627    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0\n   -0.4996   -0.6877    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    0.4996   -0.6877    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0\n    0.8084    0.2627    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  4  0\n  2  3  4  0\n  3  4  4  0\n  4  5  4  0\n  5  1  4  0\nM  END";

  it("says so over the nitrogen it is drawn on, while that atom is as read", async () => {
    // (as the canvas takes a file it opens: useStructureEvents)
    const r = { model: editorModelOf((await processFileContent("imidazole.mol", imidazole)).model) };
    const { atoms } = readMarks(r.model);
    const said = [...atoms].map(([id, words]) => [r.model.atoms.find((a) => a.id === id)!.el, words]);
    expect(said).toEqual([["N", H_CHOSEN_SAID]]);
    // (its H drawn on it: its two ring bonds single)
    const id = atoms.keys().next().value!;
    const sum = r.model.bonds.filter((b) => b.a === id || b.b === id).reduce((n, b) => n + b.order, 0);
    expect(implicitHydrogens("N", sum)).toBe(1);
    // (made another atom, or its bonds changed: no longer said)
    const edited = { ...r.model, atoms: r.model.atoms.map((a) => (a.id === id ? { ...a, el: "C" } : a)) };
    expect(readMarks(edited).atoms.size).toBe(0);
  });
});

describe("a calculation's output, as a reader read it", () => {
  // an optimisation of water, in the reader's plain data, written by hand
  const out = {
    program: "ORCA",
    method: "B3LYP",
    charge: 0,
    multiplicity: 1,
    atoms: ["O", "H", "H"],
    frames: [
      [0, 0, 0.1, 0, 0.8, -0.5, 0, -0.8, -0.5],
      [0, 0, 0.11, 0, 0.78, -0.48, 0, -0.78, -0.48],
      [0, 0, 0.12, 0, 0.76, -0.47, 0, -0.76, -0.47],
    ],
    energies: [-76.30, -76.31, -76.32],
    optimised: true,
  };

  it("stands on the page as one molecule in 3D: its steps the frames, the last shown, its bonds found as an XYZ file's are", () => {
    const [m] = calcResult(out, ["cclib 1.9rc1"], "water_opt.out").molecules3d!;
    expect(m.atoms.map((a) => a.el)).toEqual(["O", "H", "H"]);
    expect(m.bonds).toHaveLength(2);
    // (its bonds by distance, frame by frame: an output gives none)
    expect(m.bondsFrom).toBe("distance");
    expect(m.frames).toHaveLength(2);
    expect(m.frame).toBe(2);
    expect(m.energies).toEqual([-76.30, -76.31, -76.32]);
    expect(m.name).toBe("water_opt.out");
    expect(m.calc).toMatchObject({ readers: ["cclib 1.9rc1"], program: "ORCA", method: "B3LYP", optimised: true });
  });

  // (the maintainer, 2026-10-13: a file of several jobs - Gaussian's Link1, ORCA's $new_job - opens as one molecule for each)
  it("of a file of several jobs, stands as one molecule for each, side by side: each its own frames, energies and words", () => {
    const sp = { ...out, method: "HF", basis: "3-21G", frames: [out.frames[2]], energies: [-75.58], optimised: null, job: { number: 2, of: 2, kind: "Single point" } };
    const opt = { ...out, method: "HF", basis: "STO-3G", job: { number: 1, of: 2, kind: "Optimisation" } };
    const r = calcResult({ ...sp, jobs: [opt, sp] }, ["cclib 1.9rc1"], "link1.log", { name: "link1.log", sha256: "c".repeat(64) });
    const [a, b] = r.molecules3d!;
    expect(r.molecules3d).toHaveLength(2);
    expect([a.name, b.name]).toEqual(["link1.log, job 1", "link1.log, job 2"]);
    // (nothing of one job put with the other's: the opt's path and energies its own, the single point's one frame and energy)
    expect([a.frames, a.energies]).toEqual([out.frames.slice(1), [-76.30, -76.31, -76.32]]);
    expect([b.frames, b.energies]).toEqual([undefined, [-75.58]]);
    expect(a.calc).toMatchObject({ basis: "STO-3G", optimised: true, job: { number: 1, of: 2, kind: "Optimisation" }, source: { sha256: "c".repeat(64) } });
    expect(b.calc).toMatchObject({ basis: "3-21G", job: { number: 2, of: 2, kind: "Single point" } });
    expect(b.calc!.optimised).toBeUndefined();
    // (a job that gives no geometry stands as none; a file of one job, as before)
    expect(calcResult({ ...sp, jobs: [{ ...opt, frames: [] }, sp] }, ["cclib"], "x.log").molecules3d).toHaveLength(1);
    expect(calcResult(out, ["cclib"], "one.out").molecules3d![0].name).toBe("one.out");
  });

  describe("of an optimisation or a relaxed scan, the geometries it converged on are its entries", () => {
    // (methanol, HF/STO-3G, Gaussian 16: its H-C-O-H dihedral scanned over three points - 21 geometries, the
    // four it converged on marked as cclib marks them; their energies as the output's scan summary gives them)
    const SCAN = [
      -113.543862, -113.545317, -113.545941, -113.545976, -113.545985, -113.493398, -113.535107, -113.548734, -113.549175, -113.54919, -113.549191,
      -113.488332, -113.529495, -113.545796, -113.545969, -113.545986, -113.484845, -113.533240, -113.548998, -113.549185, -113.549193,
    ];
    const methanol = (k: number) => [0, 0, 0, 0, 0, 1.42, 1.03, 0, -0.36, -0.515, 0.892, -0.36, -0.515, -0.892, -0.36, 0.93 - 0.01 * k, 0.01 * k, 1.74];
    const output = (n: number, converged: boolean[], energies = SCAN.slice(0, n)) => ({
      program: "Gaussian",
      method: "HF",
      atoms: ["C", "O", "H", "H", "H", "H"],
      frames: Array.from({ length: n }, (_, k) => methanol(k)),
      energies,
      converged,
    });
    const entries = (m: Omit<Molecule3D, "id" | "at">) => setEntries([{ ...m, id: 1, at: { x: 0, y: 0 } } as Molecule3D], "conformers");

    it("a relaxed scan: its four points, each with the energy it converged at - not its 21 steps", () => {
      const converged = SCAN.map((_, k) => [4, 10, 15, 20].includes(k));
      const [m] = calcResult(output(21, converged), ["cclib"], "scan.log").molecules3d!;
      expect(m.frames).toHaveLength(20);
      expect(m.entryFrames).toEqual([4, 10, 15, 20]);
      expect(entriesIn(m)).toBe(4);
      expect(entries(m).map((e) => e.energy)).toEqual([-113.545985, -113.549191, -113.545986, -113.549193]);
      expect(m.notConverged).toBeUndefined();
    });

    it("an optimisation: its last geometry alone", () => {
      const [m] = calcResult(output(5, [false, false, false, false, true]), ["cclib"], "opt.log").molecules3d!;
      expect(entries(m).map((e) => [e.frame, e.energy])).toEqual([[4, SCAN[4]]]);
    });

    it("one that never converged: no entry - no geometry that is no minimum weighed - its frames kept, said not to have", () => {
      const [m] = calcResult(output(2, [false, false]), ["cclib"], "opt2.log").molecules3d!;
      expect(m.notConverged).toBe(true);
      expect(entries(m)).toEqual([]);
      expect(m.frames).toHaveLength(1);
      expect(notesOf({ ...m, id: 1, at: { x: 0, y: 0 } } as Molecule3D, solidOf({ ...m, id: 1, at: { x: 0, y: 0 } } as Molecule3D, STYLE_3D), "primary")).toContain("Not converged");
    });

    it("says how many of its frames are entries, and that the rest are steps on the way", () => {
      const converged = SCAN.map((_, k) => [4, 10, 15, 20].includes(k));
      const [m] = calcResult(output(21, converged), ["cclib"], "scan.log").molecules3d!;
      const molecule = { ...m, id: 1, at: { x: 0, y: 0 } } as Molecule3D;
      // (and, as any opened output's, that its bond orders are not known)
      expect(notesOf(molecule, solidOf(molecule, STYLE_3D), "primary")).toEqual(["Bond orders unknown", "4 of 21 frames are entries (converged points)"]);
    });

    it("a scan stopped before its last point converged: the points it converged on - that last point a frame, no entry, said not to have", () => {
      // (the same Gaussian scan's output cut short in its third point - 13 geometries, points 1 and 2 converged)
      const converged = SCAN.slice(0, 13).map((_, k) => [4, 10].includes(k));
      const [m] = calcResult(output(13, converged), ["cclib"], "scan-cut.log").molecules3d!;
      expect(m.entryFrames).toEqual([4, 10]);
      expect(entries(m).map((e) => e.energy)).toEqual([-113.545985, -113.549191]);
      expect(m.frames).toHaveLength(12);
      expect(m.notConverged).toBe(true);
      const molecule = { ...m, id: 1, at: { x: 0, y: 0 } } as Molecule3D;
      expect(notesOf(molecule, solidOf(molecule, STYLE_3D), "primary")).toEqual(["Bond orders unknown", "2 of 13 frames are entries (converged points)", "Last point not converged"]);
    });

    it("an optimisation stopped at its first geometry says it did not converge, as one stopped at its second does", () => {
      const [one] = calcResult(output(1, [false]), ["cclib"], "opt1.log").molecules3d!;
      const [two] = calcResult(output(2, [false, false]), ["cclib"], "opt2.log").molecules3d!;
      const notes = (m: typeof one) => notesOf({ ...m, id: 1, at: { x: 0, y: 0 } } as Molecule3D, solidOf({ ...m, id: 1, at: { x: 0, y: 0 } } as Molecule3D, STYLE_3D), "primary");
      expect(notes(one)).toEqual(["Bond orders unknown", "No frame is an entry (none converged)", "Not converged"]);
      expect(notes(two)).toEqual(["Bond orders unknown", "No frame is an entry (none converged)", "Not converged"]);
      // (and so they stay, the workspace saved and opened again: none an entry)
      const back = readCarried3D(JSON.parse(JSON.stringify({ ...two, at: { x: 0, y: 0 } })))!;
      expect(back.entryFrames).toEqual([]);
      expect(entriesIn(back)).toBe(0);
    });

    const notes = (m: Omit<Molecule3D, "id" | "at">) => notesOf({ ...m, id: 1, at: { x: 0, y: 0 } } as Molecule3D, solidOf({ ...m, id: 1, at: { x: 0, y: 0 } } as Molecule3D, STYLE_3D), "primary");

    it("every geometry, where the reader marks none; none, where its marks are not one a geometry - convergence not stated, never every one", () => {
      const [plain] = calcResult({ ...output(3, []), converged: undefined }, ["cclib"], "x.out").molecules3d!;
      expect(entriesIn(plain)).toBe(3);
      const [odd] = calcResult(output(3, [false, true]), ["cclib"], "x.out").molecules3d!;
      expect([odd.entryFrames, odd.noEntryWhy, odd.notConverged]).toEqual([[], "unstated", undefined]);
      expect(notes(odd)).toEqual(["Bond orders unknown", "No frame is an entry (convergence not stated in this file)"]);
    });

    it("a geometry that does not read, between others: left out with its own mark - each other kept by its own", () => {
      // (the scan, its eighth geometry cut short: 20 read, the four points still the four, a place earlier after it)
      const converged = SCAN.map((_, k) => [4, 10, 15, 20].includes(k));
      const o = output(21, converged);
      const [m] = calcResult({ ...o, frames: o.frames.map((f, k) => (k === 7 ? f.slice(0, 10) : f)) }, ["cclib"], "scan.log").molecules3d!;
      expect(m.frames).toHaveLength(19);
      expect(m.entryFrames).toEqual([4, 9, 14, 19]);
      expect(entriesIn(m)).toBe(4);
      expect(m.notConverged).toBeUndefined();
    });

    it("none, where the reader says why none is: a run that did not end as it should, a path's points, convergence not stated", () => {
      const why = (unmarked: Unmarked, n = 3) => calcResult({ ...output(n, Array(n).fill(false)), unmarked }, ["cclib"], "x.log").molecules3d![0];
      expect(notes(why("error"))).toEqual(["Bond orders unknown", "No frame is an entry (the run ended with an error)"]);
      expect(notes(why("cut"))).toEqual(["Bond orders unknown", "No frame is an entry (the run did not come to its end)"]);
      expect(notes(why("path"))).toEqual(["Bond orders unknown", "No frame is an entry (points of a scan or a reaction path)"]);
      expect(notes(why("unstated"))).toEqual(["Bond orders unknown", "No frame is an entry (convergence not stated in this file)"]);
      // (a single point that ended with an error: no entry either)
      const one = why("error", 1);
      expect([one.entryFrames, entriesIn(one)]).toEqual([[], 0]);
      expect(notes(one)).toEqual(["Bond orders unknown", "No frame is an entry (the run ended with an error)"]);
      // (and so they stay, saved and opened again)
      const back = readCarried3D(JSON.parse(JSON.stringify({ ...why("cut"), at: { x: 0, y: 0 } })))!;
      expect([back.entryFrames, back.noEntryWhy]).toEqual([[], "cut"]);
    });

    it("none, where which are entries does not read as the workspace is opened again - never every one", () => {
      const [m] = calcResult(output(5, [false, false, false, false, true]), ["cclib"], "opt.log").molecules3d!;
      for (const bad of [[9], [2, 1], "4", [0.5], null]) {
        const back = readCarried3D(JSON.parse(JSON.stringify({ ...m, entryFrames: bad, at: { x: 0, y: 0 } })))!;
        expect([back.entryFrames, back.noEntryWhy, entriesIn(back)], JSON.stringify(bad)).toEqual([[], "unread", 0]);
      }
      expect(notes(readCarried3D(JSON.parse(JSON.stringify({ ...m, entryFrames: [9], at: { x: 0, y: 0 } })))!)).toContain("No frame is an entry (which are could not be read)");
      // (a frame that does not read, left out: each entry kept by its place among those kept, the one left out with it)
      const o = calcResult(output(21, SCAN.map((_, k) => [4, 10, 15, 20].includes(k))), ["cclib"], "scan.log").molecules3d![0];
      const holed = { ...o, frames: o.frames!.map((f, k) => (k === 9 ? [0] : k === 2 ? "x" : f)), at: { x: 0, y: 0 } };
      expect(readCarried3D(JSON.parse(JSON.stringify(holed)))!.entryFrames).toEqual([3, 13, 18]);
      // (a why that does not read is not said; none is still none)
      const back = readCarried3D(JSON.parse(JSON.stringify({ ...m, entryFrames: [], noEntryWhy: "lost", at: { x: 0, y: 0 } })))!;
      expect([back.entryFrames, back.noEntryWhy]).toEqual([[], undefined]);
    });

    it("kept as the workspace is saved and opened again", () => {
      const converged = SCAN.map((_, k) => [4, 10, 15, 20].includes(k));
      const [m] = calcResult(output(21, converged), ["cclib"], "scan.log").molecules3d!;
      const back = readCarried3D(JSON.parse(JSON.stringify({ ...m, at: { x: 0, y: 0 } })))!;
      expect(back.entryFrames).toEqual([4, 10, 15, 20]);
      const [n] = calcResult(output(2, [false, false]), ["cclib"], "opt2.log").molecules3d!;
      expect(readCarried3D(JSON.parse(JSON.stringify({ ...n, at: { x: 0, y: 0 } })))!.notConverged).toBe(true);
    });
  });

  it("keeps no energies that are not one a frame", () => {
    const [m] = calcResult({ ...out, energies: [-76.32] }, ["cclib"], "x.out").molecules3d!;
    expect(m.energies).toBeUndefined();
  });

  it("is one frame, shown, for a single point", () => {
    const [m] = calcResult({ ...out, frames: [out.frames[2]], energies: [-76.32] }, ["cclib"], "sp.out").molecules3d!;
    expect(m.frames).toBeUndefined();
    expect(m.frame).toBeUndefined();
    expect(m.energies).toEqual([-76.32]);
  });
});

describe("a file a tab was opened with, once read", () => {
  const read = { centroid: { x: 5, y: 3 }, model: { atoms: [{ x: 4, y: 3 }, { x: 6, y: 3 }] } };
  it("takes the document's place on a canvas nothing is drawn on, its middle at the origin", () => {
    expect(openedPlace(true, [], read)).toEqual({ add: false, dx: -5, dy: -3 });
  });
  it("is added to the right of what was drawn as it was read, level with it - not put in its place, taking it away", () => {
    // (a paste made while a 25 MB SD file was read, from 0 to 2 across, at y 1)
    const { add, dx, dy } = openedPlace(false, [{ x: 0, y: 0 }, { x: 2, y: 2 }], read);
    expect(add).toBe(true);
    expect(4 + dx).toBeGreaterThan(2);
    expect(3 + dy).toBeCloseTo(1, 9);
  });
});

describe("an SD file with records that do not read", () => {
  it("opens the others, and says in a notice which were left out and why", async () => {
    const record = (el: string, bond: string) =>
      ["", "  Meno            2D", "", "  2  1  0  0  0  0  0  0  0  0999 V2000",
        `    0.0000    0.0000    0.0000 ${el}   0  0  0  0  0  0  0  0  0  0  0  0`,
        "    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0", bond, "M  END", "$$$$"].join("\n");
    const r = await processFileContent("three.sdf", [record("C", "  1  2  1  0"), record("N", "  1  4  1  0"), record("S", "  1  2  1  0")].join("\n") + "\n");
    expect(r.model.atoms.map((a) => a.el)).toEqual(["C", "O", "S", "O"]);
    expect(useNotices.getState().notices).toMatchObject([{ title: "Part of the file left out", text: "Record 2 has a bond to an atom it does not have. The other records of three.sdf opened." }]);
    for (const n of useNotices.getState().notices) useNotices.getState().dismiss(n.id);
  });

  it("names five of those left out at most, then how many more", () => {
    const left = Array.from({ length: 7 }, (_, i) => ({ record: i + 2, why: "ends before the atoms and bonds it says it has" }));
    expect(recordsLeftOutSaid("b.sdf", left)).toBe(
      "Record 2 ends before the atoms and bonds it says it has. Record 3 ends before the atoms and bonds it says it has. Record 4 ends before the atoms and bonds it says it has. Record 5 ends before the atoms and bonds it says it has. Record 6 ends before the atoms and bonds it says it has. 2 more are left out as well. The other records of b.sdf opened.",
    );
  });
});

