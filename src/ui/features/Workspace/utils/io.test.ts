import { describe, expect, it } from "vitest";
import { calcResult, editorModelOf, opensAsText, processFileContent, xyzComments } from "./io";
import sampleSdf from "../../../../samples/cholesterol.sdf?raw";
import sampleRxn from "../../../../samples/esterification.rxn?raw";
import sampleXyz from "../../../../samples/cholesterol.xyz?raw";
import samplePdb from "../../../../samples/cholesterol.pdb?raw";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

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
