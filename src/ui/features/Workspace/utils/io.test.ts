import { afterEach, describe, expect, it } from "vitest";
import { calcResult, editorModelOf, openedPlace, opensAsText, processFileContent, xyzComments } from "./io";
import { useNotices } from "../../../notices";
import sampleSdf from "../../../../samples/cholesterol.sdf?raw";
import sampleRxn from "../../../../samples/esterification.rxn?raw";
import sampleXyz from "../../../../samples/cholesterol.xyz?raw";
import samplePdb from "../../../../samples/cholesterol.pdb?raw";

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
  afterEach(() => {
    for (const n of useNotices.getState().notices) useNotices.getState().dismiss(n.id);
  });

  it("open an XYZ file as one molecule in 3D, its other frames kept", async () => {
    const r = await processFileContent("cholesterol.xyz", sampleXyz);
    expect(r.model.atoms).toHaveLength(0);
    expect(r.molecules3d).toHaveLength(1);
    expect(r.molecules3d![0].atoms).toHaveLength(74);
    expect(r.molecules3d![0].frames).toBeUndefined();
    const twoFrames = "2\nfirst\nH 0 0 0\nH 0.74 0 0\n2\nsecond\nH 0 0 0\nH 0.80 0 0\n";
    const t = await processFileContent("h2.xyz", twoFrames);
    expect(t.molecules3d![0].frames).toEqual([[0, 0, 0, 0.8, 0, 0]]);
    expect(useNotices.getState().notices).toEqual([]);
  });

  it("open a trajectory whose last frame is cut short with the frames before it, saying in a notice how many were left out", async () => {
    const r = await processFileContent("md.xyz", "2\nfirst\nH 0 0 0\nH 0.74 0 0\n2\nsecond\nH 0 0 0\nH 0.80 0 0\n2\nthird\nH 0 0 0\n");
    expect(r.molecules3d![0].frames).toHaveLength(1);
    expect(useNotices.getState().notices).toMatchObject([{ title: "Part of the file left out", text: expect.stringMatching(/^md.xyz ends before the atoms of its last frame do: 1 of its 3 frames is left out/) }]);
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

