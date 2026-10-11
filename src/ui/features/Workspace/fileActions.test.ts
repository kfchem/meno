import { describe, expect, it } from "vitest";
import {
  drawingSvg,
  exportKindOf,
  exportKinds,
  exportPxPerWorld,
  fileNameOf,
  holdsOfDrawn,
  structureFileText,
  suggestedExportPath,
  suggestedSavePath,
} from "./fileActions";
import { optionsFor, WRITERS } from "../../../lib/io/writers";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { ACS_1996, RSC } from "../../../lib/chem/style";
import type { Model } from "./store/types";
import { useAppSettings } from "../../../lib/settings/appSettings";

const L = NOMINAL_BOND_LENGTH;
const model: Model = {
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 2, x: L, y: 0, r: 0.9, el: "O" },
  ],
  bonds: [{ id: 3, a: 1, b: 2, order: 1, stereo: "none" }],
};

describe("structureFileText", () => {
  it("writes an SD file for .sdf and a MOL file otherwise, titled with the file's name", () => {
    const sdf = structureFileText(model, "/tmp/ethanol.sdf");
    expect(sdf.startsWith("ethanol\n")).toBe(true);
    expect(sdf.endsWith("$$$$\n")).toBe(true);
    const mol = structureFileText(model, "C:\\work\\methanol.MOL");
    expect(mol.startsWith("methanol\n")).toBe(true);
    expect(mol.endsWith("M  END\n")).toBe(true);
  });

  it("writes an RXN file for .rxn, the reaction its arrow shows", () => {
    const reaction = { ...model, arrows: [{ id: 1, x: 3 * L, y: 0, angle: 0, length: 2 * L }] };
    const rxn = structureFileText(reaction, "/tmp/oxidation.rxn");
    expect(rxn.split("\n").slice(0, 5)).toEqual(["$RXN", "oxidation", "      Meno", "", "  1  0"]);
    expect(() => structureFileText(model, "/tmp/nothing.rxn")).toThrow(/arrow/);
  });

  it("writes V2000 where V2000 holds the structure, and V3000 where the writer's options ask for it", () => {
    expect(structureFileText(model, "/tmp/a.mol")).toContain(" V2000\n");
    expect(structureFileText(model, "/tmp/a.mol", { version: "V3000" })).toContain("M  V30 BEGIN CTAB");
    expect(structureFileText(model, "/tmp/a.sdf", { version: "V3000" })).toContain("M  V30 BEGIN CTAB");
    const reaction = { ...model, arrows: [{ id: 1, x: 3 * L, y: 0, angle: 0, length: 2 * L }] };
    expect(structureFileText(reaction, "/tmp/r.rxn", { version: "V3000" }).startsWith("$RXN V3000")).toBe(true);
  });
});

describe("suggestedSavePath", () => {
  it("saves a workspace: where the canvas was saved; else beside the file opened over it, by its name; else workspace.meno", () => {
    expect(suggestedSavePath({ savedPath: "/work/a.meno", openedName: null })).toBe("/work/a.meno");
    // (in its folder, where Open said where it was)
    expect(suggestedSavePath({ savedPath: null, openedName: "/data/run 3/b.sdf" })).toBe("/data/run 3/b.meno");
    expect(suggestedSavePath({ savedPath: null, openedName: "b.sdf" })).toBe("b.meno");
    expect(suggestedSavePath({ savedPath: null, openedName: "conformers.xyz" })).toBe("conformers.meno");
    expect(suggestedSavePath({ savedPath: null, openedName: null })).toBe("workspace.meno");
  });
});

describe("Export", () => {
  const structure = { solid: false, reaction: false, drawn: true };
  const reaction = { solid: false, reaction: true, drawn: true };
  const solid = { solid: true, reaction: false, drawn: false };
  const both = { solid: true, reaction: false, drawn: true };

  it("offers what the canvas can be written as, the fittest first, and always a picture", () => {
    expect(exportKinds(structure)).toEqual(["mol", "sdf", "svg"]);
    expect(exportKinds(reaction)).toEqual(["rxn", "mol", "sdf", "svg"]);
    // (molecules in 3D alone: an SD file keeps them; a drawing beside them is a MOL file's too; a PDB file holds them and no drawing)
    expect(exportKinds(solid)).toEqual(["sdf", "pdb", "svg"]);
    expect(exportKinds(both)).toEqual(["mol", "sdf", "pdb", "svg"]);
  });

  it("offers nothing that would come out empty: words, pictures or arrows alone only as a picture", () => {
    // (words or pictures alone: no structure, no molecule in 3D)
    expect(exportKinds({ solid: false, reaction: false, drawn: false })).toEqual(["svg"]);
    // (an arrow and words, with nothing drawn: no reaction to write)
    expect(exportKinds({ solid: false, reaction: true, drawn: false })).toEqual(["svg"]);
    // (an arrow beside molecules in 3D alone: those, as their own files)
    expect(exportKinds({ solid: true, reaction: true, drawn: false })).toEqual(["sdf", "pdb", "svg"]);
    expect(suggestedExportPath({ savedPath: "/work/a.meno", openedName: null }, { solid: false, reaction: false, drawn: false })).toBe("/work/a.svg");
  });

  it("suggests the canvas's name as the first kind it can be written as, unless it is of one already", () => {
    expect(suggestedExportPath({ savedPath: "/work/a.meno", openedName: null }, structure)).toBe("/work/a.mol");
    // (never the file it came from: beside it, numbered, the first free)
    expect(suggestedExportPath({ savedPath: null, openedName: "b.sdf" }, structure)).toBe("b-2.sdf");
    expect(suggestedExportPath({ savedPath: null, openedName: "/data/1abc.PDB" }, structure, "pdb")).toBe("/data/1abc-2.pdb");
    const taken = new Set(["/data/b-2.sdf", "/data/b-3.sdf"]);
    expect(suggestedExportPath({ savedPath: null, openedName: "/data/b.sdf" }, structure, "sdf", (p) => taken.has(p))).toBe("/data/b-4.sdf");
    // (saved since as a workspace: named after it, which is no file it came from)
    expect(suggestedExportPath({ savedPath: "/work/b.meno", openedName: "/data/b.sdf" }, structure, "sdf")).toBe("/work/b.sdf");
    expect(suggestedExportPath({ savedPath: null, openedName: "conformers.xyz" }, reaction)).toBe("conformers.rxn");
    expect(suggestedExportPath({ savedPath: null, openedName: null }, structure)).toBe("structure.mol");
    expect(suggestedExportPath({ savedPath: null, openedName: null }, reaction)).toBe("reaction.rxn");
    expect(suggestedExportPath({ savedPath: null, openedName: null }, solid)).toBe("molecules.sdf");
  });

  it("starts from the kind of the file the canvas came from, where it can be written as it; and suggests the kind chosen", () => {
    expect(exportKindOf({ savedPath: null, openedName: "/data/b.SDF" }, structure)).toBe("sdf");
    expect(exportKindOf({ savedPath: null, openedName: "/data/1abc.pdb" }, solid)).toBe("pdb");
    expect(exportKindOf({ savedPath: null, openedName: "/data/1abc.pdb" }, structure)).toBeUndefined();
    expect(exportKindOf({ savedPath: null, openedName: "/data/b.rxn" }, structure)).toBeUndefined();
    expect(exportKindOf({ savedPath: "/work/a.meno", openedName: "b.sdf" }, structure)).toBeUndefined();
    expect(suggestedExportPath({ savedPath: null, openedName: "/data/b.sdf" }, structure, "svg")).toBe("/data/b.svg");
    expect(suggestedExportPath({ savedPath: null, openedName: null }, structure, "sdf")).toBe("structure.sdf");
  });

  it("offers what a selection can be written as, by what it holds, whatever else the page holds", () => {
    const atom = { id: 1, x: 0, y: 0, r: 0.9, el: "C" };
    // (a structure selected beside a reaction's arrow left out: a MOL file first, no RXN)
    expect(holdsOfDrawn({ atoms: [atom], bonds: [] })).toEqual(structure);
    expect(exportKinds(holdsOfDrawn({ atoms: [atom], bonds: [], arrows: [] }))).toEqual(["mol", "sdf", "svg"]);
    expect(holdsOfDrawn({ atoms: [atom], bonds: [], arrows: [{ id: 1, x: 2, y: 0, angle: 0, length: 2 }] })).toEqual(reaction);
    // (a molecule in 3D selected alone)
    const carried = { atoms: [], bonds: [], molecules3d: [{ name: "m", atoms: [], bonds: [], at: { x: 0, y: 0 } }] } as unknown as Parameters<typeof holdsOfDrawn>[0];
    expect(holdsOfDrawn(carried)).toEqual(solid);
  });

  it("offers kinds Meno writes, each named, with its options' defaults among their choices", () => {
    for (const k of new Set([...exportKinds(structure), ...exportKinds(reaction), ...exportKinds(solid)])) {
      const w = WRITERS[k];
      expect(w.name).toBeTruthy();
      for (const o of w.options) if (o.type === "choice") expect(o.choices.map((c) => c.value)).toContain(o.default);
    }
  });

  it("shows a writer's options about what the page holds: no version for molecules in 3D alone, no frames for a drawing alone", () => {
    const ids = (holds: { drawing: boolean; molecules3d: boolean }) => optionsFor(WRITERS.sdf, holds).map((o) => o.id);
    expect(ids({ drawing: true, molecules3d: true })).toEqual(["version", "frames"]);
    expect(ids({ drawing: false, molecules3d: true })).toEqual(["frames"]);
    expect(ids({ drawing: true, molecules3d: false })).toEqual(["version"]);
    expect(optionsFor(WRITERS.svg, { drawing: true, molecules3d: true })).toEqual([]);
  });
});

describe("fileNameOf", () => {
  it("names a file as a tab shows it: without its folder, on either system", () => {
    expect(fileNameOf("/Users/me/work/ethanol.mol")).toBe("ethanol.mol");
    expect(fileNameOf("C:\\Users\\me\\work\\ethanol.sdf")).toBe("ethanol.sdf");
  });
});

describe("drawingSvg", () => {
  const aromatic = { aromaticEnabled: false, aromaticRings: {} };
  const svg = drawingSvg(model, aromatic, ACS_1996);

  it("comes out at the style's own size: 14.4 pt to the bond at 96 px to the inch in ACS 1996", () => {
    const scale = exportPxPerWorld(ACS_1996);
    expect(scale * L).toBeCloseTo((14.4 * 96) / 72, 9);
    const width = Number(/width="([\d.e]+)"/.exec(svg)![1]);
    const box = /viewBox="([-\d.e ]+)"/.exec(svg)![1].split(" ").map(Number);
    expect(width).toBeCloseTo(box[2] * scale, 6);
    // RSC's bonds are 12.2 pt
    expect(exportPxPerWorld(RSC) * L).toBeCloseTo((12.2 * 96) / 72, 9);
  });

  it("draws in the style it is given", () => {
    const rsc = drawingSvg(model, aromatic, { ...RSC, bondColor: "#336699" });
    expect(rsc).toContain('font-family="Helvetica');
    expect(rsc).toContain('stroke="#336699"');
    const w = Number(/stroke-width="([\d.e]+)"/.exec(rsc)![1]);
    expect(w).toBeCloseTo((0.45 / 12.2) * L, 9);
  });

  it("keeps a line its true width, however thin that is in pixels", () => {
    const w = Number(/stroke-width="([\d.e]+)"/.exec(svg)![1]);
    // 0.6 pt of a 14.4 pt bond, in the drawing's own units
    expect(w).toBeCloseTo((0.6 / 14.4) * L, 9);
  });

  it("draws a reaction's arrow and pluses, the picture reaching to take them in", () => {
    const scheme = {
      ...model,
      arrows: [{ id: 1, x: 3 * L, y: 0, angle: 0, length: 2 * L }],
      pluses: [{ id: 1, x: -L, y: 0 }],
    };
    const drawn = drawingSvg(scheme, aromatic, ACS_1996);
    const paths = (text: string) => (text.match(/<path /g) ?? []).length;
    expect(paths(drawn) - paths(svg)).toBe(2);
    const box = /viewBox="([-\d.e ]+)"/.exec(drawn)![1].split(" ").map(Number);
    // from the plus on the left to the arrow's point on the right
    expect(box[0]).toBeLessThan(-L);
    expect(box[0] + box[2]).toBeGreaterThan(4 * L);
  });

  it("says under a molecule in 3D drawn without the hydrogens on its carbons that it is - and under no other", () => {
    const methane = {
      atoms: [
        { el: "C", x: 0, y: 0, z: 0 },
        { el: "H", x: 0.63, y: 0.63, z: 0.63 },
        { el: "H", x: -0.63, y: -0.63, z: 0.63 },
        { el: "H", x: -0.63, y: 0.63, z: -0.63 },
        { el: "H", x: 0.63, y: -0.63, z: -0.63 },
      ],
      bonds: [1, 2, 3, 4].map((h) => ({ a1: 0, a2: h, order: 1 })),
      at: { x: 6 * L, y: 0 },
    };
    const was = useAppSettings.getState().style3d;
    try {
      expect(drawingSvg({ ...model, molecules3d: [methane] }, aromatic, ACS_1996)).not.toContain("hidden");
      useAppSettings.setState({ style3d: { ...was, looks: { [was.primary]: { hydrogens: "carbonHidden" } } } });
      const hidden = drawingSvg({ ...model, molecules3d: [methane] }, aromatic, ACS_1996);
      expect(hidden).toContain(">C\u2013H hidden</text>");
      // (its other look, the secondary, keeps them)
      expect(drawingSvg({ ...model, molecules3d: [{ ...methane, look: "secondary" as const }] }, aromatic, ACS_1996)).not.toContain("hidden");
    } finally {
      useAppSettings.setState({ style3d: was });
    }
  });

  it("writes the label in Arial", () => {
    expect(svg).toContain('font-family="Arial');
    // run by run: the symbol, then its hydrogen
    expect(svg).toContain(">O</text>");
    expect(svg).toContain(">H</text>");
  });
});

describe("an SD file of a canvas with molecules in 3D", () => {
  it("holds the drawing, and each molecule in 3D a record of its own in 3D, in the frame it shows", async () => {
    const { processFileContent } = await import("./utils/io");
    const water3d = {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0.5 },
        { el: "H", x: 0.76, y: 0.59, z: 0.5 },
        { el: "H", x: -0.76, y: 0.59, z: 0.5 },
      ],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
      ],
      at: { x: 0, y: 0 },
      frames: [[0, 0, 1, 0.8, 0.6, 1, -0.8, 0.6, 1]],
      frame: 1,
      name: "water.xyz",
    };
    const text = structureFileText({ ...model, molecules3d: [water3d] }, "/tmp/both.sdf");
    expect(text.match(/\$\$\$\$/g)).toHaveLength(2);
    expect(text).toContain("\nwater\n");
    const back = await processFileContent("both.sdf", text);
    expect(back.model.atoms).toHaveLength(2);
    expect(back.molecules3d).toHaveLength(1);
    expect(back.molecules3d![0].atoms[1]).toMatchObject({ el: "H", x: 0.8, z: 1 });
    // molecules in 3D alone: their records alone
    expect(structureFileText({ atoms: [], bonds: [], molecules3d: [water3d] }, "/tmp/w.sdf").match(/\$\$\$\$/g)).toHaveLength(1);
  });

  it("holds every frame of each, a record each, numbered, with its energy where it is known, where the writer's options ask", async () => {
    const { processFileContent } = await import("./utils/io");
    const conformers = {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0 },
        { el: "H", x: 0.96, y: 0, z: 0 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 1 }],
      at: { x: 0, y: 0 },
      frames: [[0, 0, 0, 0.97, 0, 0], [0, 0, 0, 0.98, 0, 0], [0, 0, 0]],
      energies: [-75.4, -75.39, -75.38],
      frame: 1,
      name: "oh.xyz",
    };
    const text = structureFileText({ atoms: [], bonds: [], molecules3d: [conformers] }, "/tmp/oh.sdf", { frames: "all" });
    // (the frame of the wrong size is none of them)
    expect(text.match(/\$\$\$\$/g)).toHaveLength(3);
    expect(text.startsWith("oh 1\n")).toBe(true);
    expect(text).toContain("\noh 3\n");
    expect(text).toContain("> <Energy (Eh)>\n-75.39\n");
    const back = await processFileContent("oh.sdf", text);
    expect(back.molecules3d).toHaveLength(3);
    expect(back.molecules3d![2].atoms[1]).toMatchObject({ el: "H", x: 0.98 });
    // (the frame shown, unless asked)
    expect(structureFileText({ atoms: [], bonds: [], molecules3d: [conformers] }, "/tmp/oh.sdf").match(/\$\$\$\$/g)).toHaveLength(1);
  });

  it("writes molecules in 3D as a PDB file - each a residue, the frame shown or a model for each frame - which reads back as they were", async () => {
    const { processFileContent } = await import("./utils/io");
    const oh = {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0, charge: -1 },
        { el: "H", x: 0.96, y: 0, z: 0 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 1 }],
      at: { x: 0, y: 0 },
      frames: [[0, 0, 0, 0.97, 0, 0], [0, 0, 0, 0.98, 0, 0]],
      frame: 1,
      name: "oh.xyz",
    };
    const na = { atoms: [{ el: "Na", x: 5, y: 0, z: 0, charge: 1 }], bonds: [], at: { x: 0, y: 0 } };
    // (the drawing beside them is not written: the format holds none)
    const shown = structureFileText({ ...model, molecules3d: [oh, na] }, "/tmp/ions.pdb");
    expect(shown).not.toMatch(/^MODEL/m);
    expect(shown.split("\n").filter((l) => l.startsWith("HETATM")).map((l) => l.substring(22, 26).trim())).toEqual(["1", "1", "2"]);
    const back = await processFileContent("ions.pdb", shown);
    expect(back.model.atoms).toHaveLength(0);
    expect(back.molecules3d![0].atoms.map((a) => [a.el, a.x, a.charge])).toEqual([["O", 0, -1], ["H", 0.97, undefined], ["Na", 5, 1]]);
    expect(back.molecules3d![0].bonds).toEqual([{ a1: 0, a2: 1, order: 1 }]);
    // every frame: a model for each, the sodium where it stands in each
    const all = structureFileText({ atoms: [], bonds: [], molecules3d: [oh, na] }, "/tmp/ions.pdb", { frames: "all" });
    expect(all.match(/^MODEL/gm)).toHaveLength(3);
    const frames = await processFileContent("ions.pdb", all);
    expect(frames.molecules3d).toHaveLength(1);
    expect(frames.molecules3d![0].frames).toEqual([[0, 0, 0, 0.97, 0, 0, 5, 0, 0], [0, 0, 0, 0.98, 0, 0, 5, 0, 0]]);
    expect(() => structureFileText(model, "/tmp/none.pdb")).toThrow(/no molecules in 3D/);
  });
});
