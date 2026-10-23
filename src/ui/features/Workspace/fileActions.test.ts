import { describe, expect, it } from "vitest";
import {
  drawingLayout,
  drawingSvg,
  exportKindOf,
  exportKinds,
  xyzFileText,
  exportPxPerWorld,
  fileNameOf,
  holdsOfDrawn,
  structureFileText,
  suggestedExportPath,
  suggestedSavePath,
  writtenWhere,
  keepsOld,
} from "./fileActions";
import { optionsFor, WRITERS } from "../../../lib/io/writers";
import { heldElsewhere } from "../../../lib/doc/savers";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { labelBox, labelSetOf, runsWidth } from "../../../lib/chem/layout2d";
import { MARK_HALF_HEIGHT, MARK_SCALE, MARKS_APART, STEREO_GAP, stereoPlaces, stereoTextEms } from "./chem/marks";
import { ACS_1996, RSC } from "../../../lib/chem/style";
import type { Model } from "./store/types";
import { readStructures } from "../../../lib/io/structures";
import type { OptionValues } from "../../../lib/options";
import { readPdb } from "../../../lib/chem/pdb";
import { writtenOf } from "./utils/written";
import { WORLD_PER_ANGSTROM } from "./utils/molecule3d";
import { workspace3dOf } from "../../../lib/chem/workspaceStyle3d";
import { DEFAULT_STYLE_3D_CHOICE } from "../../../lib/chem/style3d";

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

  it("writes an SD file's records in 3D in V3000 too where V3000 is asked for - and offers the choice with molecules in 3D alone", async () => {
    const water = { atoms: [{ el: "O", x: 0, y: 0, z: 0 }, { el: "H", x: 0.96, y: 0, z: 0 }, { el: "H", x: -0.24, y: 0.93, z: 0 }], bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }], at: { x: 0, y: 0 } };
    const page = { atoms: [], bonds: [], molecules3d: [water] } as unknown as Parameters<typeof structureFileText>[0];
    expect(structureFileText(page, "/tmp/w.sdf", { version: "V3000" })).toContain("M  V30 BEGIN CTAB");
    expect(structureFileText(page, "/tmp/w.sdf", {})).not.toContain("M  V30");
    const { optionsFor, WRITERS } = await import("../../../lib/io/writers");
    expect(optionsFor(WRITERS.sdf, { drawing: false, molecules3d: true }).map((o) => o.id)).toContain("version");
  });

  it("writes an SD file's molecule in 3D past 999 atoms in V3000, every frame of it, and it opens again in 3D", () => {
    // a chain of 1001 atoms in 3D, in two frames, and one of five
    const chain = (n: number, dz = 0) => ({
      name: `chain${n}.sdf`,
      atoms: Array.from({ length: n }, (_, i) => ({ el: "C", x: 1.26 * i, y: i % 2 ? 0.44 : -0.44, z: dz })),
      bonds: Array.from({ length: n - 1 }, (_, i) => ({ a1: i, a2: i + 1, order: 1 })),
      at: { x: 0, y: 0 },
    });
    const big = { ...chain(1001), frames: [chain(1001, 0.5).atoms.flatMap((a) => [a.x, a.y, a.z])] };
    const drawn = { atoms: [], bonds: [], molecules3d: [big, chain(5)] } as unknown as Parameters<typeof structureFileText>[0];
    const shown = structureFileText(drawn, "/tmp/chains.sdf");
    expect(shown.split("$$$$\n").map((r) => / V(2000|3000)\n/.exec(r)?.[1])).toEqual(["3000", "2000", undefined]);
    const read = readStructures("sdf", "chains.sdf", shown).molecules3d!;
    expect(read.map((m) => [m.atoms.length, m.bonds.length])).toEqual([
      [1001, 1000],
      [5, 4],
    ]);
    const every = structureFileText(drawn, "/tmp/chains.sdf", { frames: "all" });
    expect(every.match(/ V3000\n/g)).toHaveLength(2);
    expect(readStructures("sdf", "chains.sdf", every).molecules3d!.map((m) => m.atoms.length)).toEqual([1001, 1001, 5]);
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
    expect(exportKinds(solid)).toEqual(["sdf", "pdb", "xyz", "svg"]);
    expect(exportKinds(both)).toEqual(["mol", "sdf", "pdb", "xyz", "svg"]);
  });

  it("offers nothing that would come out empty: words, pictures or arrows alone only as a picture", () => {
    // (words or pictures alone: no structure, no molecule in 3D)
    expect(exportKinds({ solid: false, reaction: false, drawn: false })).toEqual(["svg"]);
    // (an arrow and words, with nothing drawn: no reaction to write)
    expect(exportKinds({ solid: false, reaction: true, drawn: false })).toEqual(["svg"]);
    // (an arrow beside molecules in 3D alone: those, as their own files)
    expect(exportKinds({ solid: true, reaction: true, drawn: false })).toEqual(["sdf", "pdb", "xyz", "svg"]);
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

  it("shows a writer's options about what the page holds: an SD file's version for molecules in 3D alone too, no frames for a drawing alone", () => {
    const ids = (holds: { drawing: boolean; molecules3d: boolean }) => optionsFor(WRITERS.sdf, holds).map((o) => o.id);
    expect(ids({ drawing: true, molecules3d: true })).toEqual(["version", "frames"]);
    expect(ids({ drawing: false, molecules3d: true })).toEqual(["version", "frames"]);
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

  it("draws what XML cannot hold in words on the page as the replacement character, as words pasted from elsewhere bring it", () => {
    const words = drawingSvg({ ...model, captions: [{ id: 9, x: 0, y: -2 * L, text: "ligature\x02break \x00nul\x1b x\u{FFFE}y\u{FFFF} & <b>" }] }, aromatic, ACS_1996);
    const notXml = [...words].filter((c) => {
      const n = c.codePointAt(0)!;
      return (n < 0x20 && n !== 0x09 && n !== 0x0a && n !== 0x0d) || n === 0xfffe || n === 0xffff;
    });
    expect(notXml).toEqual([]);
    expect(words).toContain("ligature\u{FFFD}break \u{FFFD}nul\u{FFFD} x\u{FFFD}y\u{FFFD}");
    expect(words).toContain("&amp; &lt;b&gt;");
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
    expect(drawingSvg({ ...model, molecules3d: [methane] }, aromatic, ACS_1996)).not.toContain("hidden");
    // (in a workspace whose primary style hides them)
    const hiding = { ...aromatic, docStyle3d: workspace3dOf({ ...DEFAULT_STYLE_3D_CHOICE, looks: { balls: { hydrogens: "carbonHidden" } } }) };
    const hidden = drawingSvg({ ...model, molecules3d: [methane] }, hiding, ACS_1996);
    expect(hidden).toContain(">C\u2013H hidden</text>");
    // (its other look, the secondary, keeps them)
    expect(drawingSvg({ ...model, molecules3d: [{ ...methane, look: "secondary" as const }] }, hiding, ACS_1996)).not.toContain("hidden");
  });

  it("says over a molecule in 3D what its file left out - its hydrogens, its bond orders - one over the other", () => {
    // (formaldehyde's heavy atoms, as an X-ray entry would give them)
    const bare = {
      atoms: [
        { el: "C", x: 0, y: 0, z: 0 },
        { el: "O", x: 1.2, y: 0, z: 0 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 1 }],
      at: { x: 6 * L, y: 0 },
      bondOrders: "unknown" as const,
    };
    const drawn = drawingSvg({ ...model, molecules3d: [bare] }, aromatic, ACS_1996);
    expect(drawn).toContain(">No H in file</text>");
    expect(drawn).toContain(">Bond orders unknown</text>");
    const y = (text: string) => Number(new RegExp(`y="([-\\d.]+)"[^>]*>${text}</text>`).exec(drawn)![1]);
    expect(y("No H in file")).toBeLessThan(y("Bond orders unknown"));
    // (its orders given: it says only that its hydrogens are not there)
    const given = drawingSvg({ ...model, molecules3d: [{ ...bare, bonds: [{ a1: 0, a2: 1, order: 2 }], bondOrders: undefined }] }, aromatic, ACS_1996);
    expect(given).toContain(">No H in file</text>");
    expect(given).not.toContain("Bond orders");
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

  it("writes XYZ: the atoms in their order, hydrogens too, a block a frame with its energy, and Meno's reader reads it back", () => {
    const m = {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0 },
        { el: "H", x: 0.9572, y: 0, z: 0 },
        { el: "H", x: -0.2399872, y: 0.9266272, z: -0.00000004 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }],
      at: { x: 0, y: 0 },
      frames: [[0, 0, 0.1, 0.96, 0, 0.1, -0.24, 0.93, 0.1]],
      energies: [-76.0266327341, -76.0261],
      name: "water.xyz",
    };
    const one = xyzFileText([m as never], "t", {});
    expect(one.split("\n").slice(0, 3)).toEqual(["3", "water E = -76.0266327341 Eh", "O      0.00000000     0.00000000     0.00000000"]);
    expect(one.match(/^3$/gm)).toHaveLength(1);
    const all = xyzFileText([m as never], "t", { frames: "all" });
    expect(all.match(/^3$/gm)).toHaveLength(2);
    expect(all).toContain("water frame 2/2 E = -76.0261000000 Eh");
    // (read back: the same atoms in the same order, the frames, the energies)
    const back = readStructures("xyz", "water.xyz", all).molecules3d![0];
    expect(back.atoms.map((a) => a.el)).toEqual(["O", "H", "H"]);
    expect(back.atoms[2].x).toBeCloseTo(-0.2399872, 7);
    expect(back.frames).toHaveLength(1);
    expect(back.frames![0][2]).toBeCloseTo(0.1, 6);
    expect(back.frames![0][3]).toBeCloseTo(0.96, 6);
    expect(back.energies).toEqual([-76.0266327341, -76.0261]);
    // (several molecules: their blocks one after another; none: refused)
    expect(xyzFileText([m as never, { ...m, name: "other.xyz" } as never], "t", {}).match(/^3$/gm)).toHaveLength(2);
    expect(() => xyzFileText([], "t", {})).toThrow(/no molecules/);
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
    // (the frame shown, unless asked - with its energy)
    const shown = structureFileText({ atoms: [], bonds: [], molecules3d: [conformers] }, "/tmp/oh.sdf");
    expect(shown.match(/\$\$\$\$/g)).toHaveLength(1);
    expect(shown).toContain("> <Energy (Eh)>\n-75.39\n");
  });

  it("writes beside a frame's energy, in an SD file, that the frame did not finish - never only its value, as if a result", () => {
    const water = {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0 },
        { el: "H", x: 0.96, y: 0, z: 0 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 1 }],
      at: { x: 0, y: 0 },
      frames: [[0, 0, 0, 0.97, 0, 0]],
      energies: [-75.4, -75.39],
      failed: [null, { kind: "not-converged" as const, why: "stopped at 200 cycles" }],
      name: "oh.xyz",
    };
    const text = structureFileText({ atoms: [], bonds: [], molecules3d: [water] }, "/tmp/oh.sdf", { frames: "all" });
    const [first, second] = text.split("$$$$\n");
    expect(first).not.toContain("<Failed>");
    expect(second).toContain("> <Energy (Eh)>\n-75.39\n\n> <Failed>\nnot converged: stopped at 200 cycles\n");
    const unread = structureFileText({ atoms: [], bonds: [], molecules3d: [{ ...water, failed: undefined, marksUnread: true as const }] }, "/tmp/oh.sdf", { frames: "all" });
    expect(unread.match(/<Failed>/g)).toHaveLength(2);
  });

  it("keeps a molecule in 3D's radicals, in the frame it shows and in every frame", () => {
    const hydroxyl = {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0, radical: "doublet" as const },
        { el: "H", x: 0.97, y: 0, z: 0 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 1 }],
      at: { x: 0, y: 0 },
      frames: [[0, 0, 0, 0.98, 0, 0]],
      frame: 1,
      name: "hydroxyl.xyz",
    };
    for (const options of [{}, { frames: "all" }] as OptionValues[]) {
      const text = structureFileText({ atoms: [], bonds: [], molecules3d: [hydroxyl] }, "/tmp/hydroxyl.sdf", options);
      expect(text).toContain("M  RAD  1   1   2\n");
      const back = readStructures("sdf", "hydroxyl.sdf", text).molecules3d!;
      expect(back.map((m) => m.atoms.map((a) => a.radical))).toEqual(back.map(() => ["doublet", undefined]));
    }
  });

  it("writes a trajectory's frame with the bonds that frame has, where they go frame by frame", () => {
    // (two carbons bonded, then 3 Å apart: an XYZ file's frames, bonds by distance)
    const parting = {
      atoms: [
        { el: "C", x: 0, y: 0, z: 0 },
        { el: "C", x: 1.5, y: 0, z: 0 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 1 }],
      frames: [[0, 0, 0, 3, 0, 0]],
      bondsFrom: "distance" as const,
      at: { x: 0, y: 0 },
      frame: 1,
      name: "parting.xyz",
    };
    const drawn = { atoms: [], bonds: [], molecules3d: [parting] };
    const bondsOf = (text: string) => readStructures("sdf", "parting.sdf", text).molecules3d!.map((m) => m.bonds.length);
    expect(bondsOf(structureFileText(drawn, "/tmp/parting.sdf"))).toEqual([0]);
    expect(bondsOf(structureFileText(drawn, "/tmp/parting.sdf", { frames: "all" }))).toEqual([1, 0]);
    expect(structureFileText(drawn, "/tmp/parting.pdb")).not.toMatch(/^CONECT/m);
    expect(structureFileText({ ...drawn, molecules3d: [{ ...parting, frame: 0 }] }, "/tmp/parting.pdb")).toMatch(/^CONECT/m);
  });

  it("writes molecules in 3D as a PDB file - each a residue, the frame shown or a model for each frame - which reads back as they were", async () => {
    const { processFileContent } = await import("./utils/io");
    const oh = {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0, charge: -1 },
        { el: "H", x: 0.96, y: 0, z: 0 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 1 }],
      at: { x: 0, y: 0, z: 0 },
      frames: [[0, 0, 0, 0.97, 0, 0], [0, 0, 0, 0.98, 0, 0]],
      frame: 1,
      name: "oh.xyz",
    };
    // (as they stand on the page: the sodium 5 Å to the right of the hydroxide's centre, level with it)
    const na = { atoms: [{ el: "Na", x: 0, y: 0, z: 0, charge: 1 }], bonds: [], at: { x: 5 * WORLD_PER_ANGSTROM, y: 0, z: 0 } };
    // (the drawing beside them is not written: the format holds none)
    const shown = structureFileText({ ...model, molecules3d: [oh, na] }, "/tmp/ions.pdb");
    expect(shown).not.toMatch(/^MODEL/m);
    expect(shown.split("\n").filter((l) => l.startsWith("HETATM")).map((l) => l.substring(22, 26).trim())).toEqual(["1", "1", "2"]);
    const back = await processFileContent("ions.pdb", shown);
    expect(back.model.atoms).toHaveLength(0);
    expect(back.molecules3d![0].atoms.map((a) => [a.el, a.x, a.charge])).toEqual([["O", -0.485, -1], ["H", 0.485, undefined], ["Na", 5, 1]]);
    expect(back.molecules3d![0].bonds).toEqual([{ a1: 0, a2: 1, order: 1 }]);
    // every frame: a model for each, the sodium where it stands in each
    const all = structureFileText({ atoms: [], bonds: [], molecules3d: [oh, na] }, "/tmp/ions.pdb", { frames: "all" });
    expect(all.match(/^MODEL/gm)).toHaveLength(3);
    const frames = await processFileContent("ions.pdb", all);
    expect(frames.molecules3d).toHaveLength(1);
    expect(frames.molecules3d![0].frames).toEqual([[-0.485, 0, 0, 0.485, 0, 0, 5, 0, 0], [-0.49, 0, 0, 0.49, 0, 0, 5, 0, 0]]);
    expect(() => structureFileText(model, "/tmp/none.pdb")).toThrow(/no molecules in 3D/);
  });

  it("writes several molecules in 3D to a PDB file as they stand on the page, each turned and placed as it is seen; one where its file had it", () => {
    const k = WORLD_PER_ANGSTROM;
    const water = (more: { at: { x: number; y: number; z: number }; turn?: [number, number, number, number] }) => ({
      atoms: [
        { el: "O", x: 1, y: 2, z: 3 },
        { el: "H", x: 1.96, y: 2, z: 3 },
        { el: "H", x: 1, y: 2.96, z: 3 },
      ],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
      ],
      name: "water.xyz",
      ...more,
    });
    // (the same file's water twice, 6 Å apart on the page, the second turned a quarter about z)
    const both = [water({ at: { x: 0, y: 0, z: 10 } }), water({ at: { x: 6 * k, y: 0, z: 10 }, turn: [0, 0, Math.SQRT1_2, Math.SQRT1_2] })];
    const atoms = readPdb(structureFileText({ atoms: [], bonds: [], molecules3d: both }, "/tmp/waters.pdb")).models[0].atoms;
    expect(new Set(atoms.map((a) => `${a.x} ${a.y} ${a.z}`)).size).toBe(6);
    // (as a writer of another kind is given them)
    writtenOf(both).atoms.forEach((a, i) => {
      expect(atoms[i].x).toBeCloseTo(a.x, 2);
      expect(atoms[i].y).toBeCloseTo(a.y, 2);
      expect(atoms[i].z).toBeCloseTo(a.z, 2);
    });
    // (the second's O-H along x turned to along y)
    expect(atoms[4].x - atoms[3].x).toBeCloseTo(0, 2);
    expect(atoms[4].y - atoms[3].y).toBeCloseTo(0.96, 2);
    const alone = readPdb(structureFileText({ atoms: [], bonds: [], molecules3d: [both[1]] }, "/tmp/water.pdb")).models[0].atoms;
    expect(alone.map((a) => [a.x, a.y, a.z])).toEqual([[1, 2, 3], [1.96, 2, 3], [1, 2.96, 3]]);
  });

  it("writes heavy water to a PDB file as D2O and opens it again as hydrogens of mass 2", async () => {
    const { processFileContent } = await import("./utils/io");
    const d2o = {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0 },
        { el: "H", x: 0.957, y: 0, z: 0, isotope: 2 },
        { el: "H", x: -0.24, y: 0.927, z: 0, isotope: 2 },
      ],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
      ],
      at: { x: 0, y: 0, z: 0 },
      name: "d2o.pdb",
    };
    const text = structureFileText({ atoms: [], bonds: [], molecules3d: [d2o] }, "/tmp/d2o.pdb");
    expect(text.split("\n").filter((l) => l.startsWith("HETATM")).map((l) => l.substring(76, 78).trim())).toEqual(["O", "D", "D"]);
    const back = await processFileContent("d2o.pdb", text);
    expect(back.molecules3d![0].atoms.map((a) => [a.el, a.isotope])).toEqual([["O", undefined], ["H", 2], ["H", 2]]);
    expect(back.molecules3d![0].bonds.map((b) => [b.a1, b.a2])).toEqual([[0, 1], [0, 2]]);
  });
});

describe("a workspace saved", () => {
  /** What a save did, in turn, and the files it wrote, by path - on a file system that takes no notice of case, keeping a name as it was first written. */
  function disk(files: Record<string, string> = {}) {
    const done: string[] = [];
    const written = new Map(Object.entries(files));
    const kept = (path: string) => [...written.keys()].find((k) => k.toLowerCase() === path.toLowerCase()) ?? path;
    const write = async (path: string, bytes: Uint8Array, keepOld: boolean) => {
      done.push(`write ${path}${keepOld ? ", keeping the old" : ""}`);
      const at = kept(path);
      const old = keepOld && written.has(at) ? `${at}.bak` : null;
      if (old) written.set(old, written.get(at)!);
      written.set(at, new TextDecoder().decode(bytes));
      return old;
    };
    const truePathOf = async (path: string) => (done.push(`true path of ${path}`), kept(path));
    return { done, written, write, truePathOf };
  }
  const bytes = new TextEncoder().encode("PK new");

  it("is written where the dialog said, then known by the file's one true path, as an opened one is", async () => {
    const d = disk({ "/Users/Chem/Work/Aspirin.meno": "PK old" });
    expect(await writtenWhere("/users/chem/work/ASPIRIN.meno", bytes, d)).toEqual({ kept: "/Users/Chem/Work/Aspirin.meno", old: null });
    // (asked once the file is there, too: a new file has no name kept before it is written)
    expect(d.done).toEqual(["true path of /users/chem/work/ASPIRIN.meno", "write /users/chem/work/ASPIRIN.meno", "true path of /users/chem/work/ASPIRIN.meno"]);
  });

  it("is never written over a file another tab holds: refused, naming that tab, nothing written - its own file and a free one written", async () => {
    const d = disk({ "/w/aspirin.meno": "PK the other tab's", "/w/mine.meno": "PK mine" });
    const tabs = [
      { id: "t1", openedFrom: "/w/mine.meno", label: "mine.meno" },
      { id: "t2", openedFrom: "/w/aspirin.meno", label: "aspirin.meno" },
    ];
    const heldBy = (path: string) => heldElsewhere(path, "t1", tabs);
    // (Save As onto the other tab's file, however it was written)
    await expect(writtenWhere("/W/ASPIRIN.meno", bytes, { ...d, heldBy })).rejects.toThrow('that file is open in the tab "aspirin.meno"; save there, or close it first.');
    expect(d.written.get("/w/aspirin.meno")).toBe("PK the other tab's");
    expect(d.done.some((x) => x.startsWith("write"))).toBe(false);
    // (as a save's failure is said)
    const said = await writtenWhere("/w/aspirin.meno", bytes, { ...d, heldBy }).catch((e: Error) => `Save failed: ${e.message}`);
    expect(said).toBe('Save failed: that file is open in the tab "aspirin.meno"; save there, or close it first.');
    // (its own file, and one no tab holds)
    expect((await writtenWhere("/w/mine.meno", bytes, { ...d, heldBy })).kept).toBe("/w/mine.meno");
    expect((await writtenWhere("/w/free.meno", bytes, { ...d, heldBy })).kept).toBe("/w/free.meno");
    expect([...d.written.keys()].sort()).toEqual(["/w/aspirin.meno", "/w/free.meno", "/w/mine.meno"]);
    expect(d.written.get("/w/mine.meno")).toBe("PK new");
  });

  it("keeps the file it was saved over beside it only where asked of that file, and says where", async () => {
    const d = disk({ "/w/a.meno": "PK damaged" });
    const keepOld = (path: string) => path === "/w/a.meno";
    expect(await writtenWhere("/W/A.meno", bytes, { ...d, keepOld })).toEqual({ kept: "/w/a.meno", old: "/w/a.meno.bak" });
    expect(d.written.get("/w/a.meno.bak")).toBe("PK damaged");
    expect(await writtenWhere("/w/b.meno", bytes, { ...d, keepOld })).toEqual({ kept: "/w/b.meno", old: null });
    // (a save not asked to: none)
    const plain = disk({ "/w/a.meno": "PK old" });
    expect((await writtenWhere("/w/a.meno", bytes, plain)).old).toBeNull();
    expect([...plain.written.keys()]).toEqual(["/w/a.meno"]);
  });
});

describe("a workspace that left something out as it opened, saved", () => {
  const left = { left: { picture: 1 }, kept: false };
  it("keeps the file it was opened from beside the first save over it - its only copy of what was left out", () => {
    expect(keepsOld("/w/a.meno", "/w/a.meno", false, left)).toBe(true);
    // (not once kept: the file saved then holds nothing of it)
    expect(keepsOld("/w/a.meno", "/w/a.meno", false, { ...left, kept: true })).toBe(false);
  });
  it("keeps no other file, and none where nothing was left out", () => {
    expect(keepsOld("/w/b.meno", "/w/a.meno", false, left)).toBe(false);
    expect(keepsOld("/w/a.meno", null, false, left)).toBe(false);
    expect(keepsOld("/w/a.meno", "/w/a.meno", false, null)).toBe(false);
    // (as before: a file it last saved still holding one it cannot keep)
    expect(keepsOld("/w/a.meno", "/w/a.meno", true, null)).toBe(true);
  });
});

describe("R, S, E and Z in a picture of the drawing (the maintainer, 2026-10-21)", () => {
  // (an invented pent-3-en-2-ol, drawn: its double bond E, its centre S, by ids that are not positions)
  const L = NOMINAL_BOND_LENGTH;
  const at = (id: number, x: number, y: number, el = "C") => ({ id, x: x * L, y: y * L, r: 0.9, el });
  const model: Model = {
    atoms: [at(1, 0, 0), at(2, 0.87, 0.5), at(3, 1.73, 0), at(4, 2.6, 0.5), at(5, 2.6, 1.5, "O"), at(6, 3.46, 0)],
    bonds: [
      { id: 11, a: 1, b: 2, order: 1 },
      { id: 12, a: 2, b: 3, order: 2 },
      { id: 13, a: 3, b: 4, order: 1 },
      { id: 14, a: 4, b: 5, order: 1 },
      { id: 15, a: 4, b: 6, order: 1 },
    ],
  };
  const marks = { valence: new Map(), centres: new Map([[4, "S" as const]]), doubleBonds: new Map([[12, "E" as const]]) };
  const aromatic = { aromaticEnabled: false, aromaticRings: {} };
  // (the letters alone, for the places; in parentheses, for how they are written)
  const bare = { ...ACS_1996, stereoDescriptors: "plain" as const };

  it("puts them where the canvas puts them, at the canvas's size without its floor for the screen", () => {
    const { layout, opts } = drawingLayout(model, { ...aromatic, shownMarks: marks }, bare);
    const items = layout.texts.filter((t) => t.text === "S" || t.text === "E");
    expect(items.map((t) => t.text).sort()).toEqual(["E", "S"]);
    // (the known answer: the canvas's own placing - ChemMarks2D's, at a zoom its floor does not reach)
    const size = opts.fontPx * MARK_SCALE;
    const laid = new Map(model.atoms.map((a) => [a.id, a]));
    const boxes = new Map<number, ReturnType<typeof labelBox>>();
    for (const t of layout.texts) if (t.atom != null) boxes.set(model.atoms[t.atom].id, labelBox(t, t.fontPx, labelSetOf(opts)));
    const canvas = stereoPlaces({
      model: { atoms: model.atoms.map((a) => ({ ...a, ...laid.get(a.id) })), bonds: model.bonds },
      centres: marks.centres,
      doubleBonds: marks.doubleBonds,
      boxes,
      half: (cip) => ({ x: (size * stereoTextEms(cip, false)) / 2, y: size * MARK_HALF_HEIGHT }),
      apart: MARKS_APART * size,
      off: STEREO_GAP * opts.fontPx,
      bond: L,
    });
    for (const p of canvas) {
      const t = items.find((i) => i.text === p.text)!;
      const w = runsWidth(t.runs!, t.fontPx, labelSetOf(opts));
      const first = runsWidth([t.runs![0]], t.fontPx, labelSetOf(opts));
      // (a text is placed by its first letter's middle: its own middle is where the canvas puts the mark)
      expect(t.x + w / 2 - first / 2).toBeCloseTo(p.x, 9);
      expect(t.y).toBeCloseTo(p.y, 9);
      expect(t.fontPx).toBeCloseTo(size, 12);
      expect(t.runs).toEqual([{ text: p.text, italic: true }]);
    }
  });

  it("writes them as the canvas does - in parentheses where the style says so - and has none where none are shown", () => {
    const style = { ...ACS_1996, stereoDescriptors: "parentheses" as const };
    const { layout } = drawingLayout(model, { ...aromatic, shownMarks: marks }, style);
    const s = layout.texts.find((t) => t.text === "(S)");
    expect(s?.runs).toEqual([{ text: "(" }, { text: "S", italic: true }, { text: ")" }]);
    expect(drawingLayout(model, aromatic, ACS_1996).layout.texts.some((t) => t.text === "S" || t.text === "E")).toBe(false);
    // (marks of atoms the picture does not hold: none of its)
    const elsewhere = { valence: new Map(), centres: new Map([[99, "R" as const]]), doubleBonds: new Map() };
    expect(drawingLayout(model, { ...aromatic, shownMarks: elsewhere }, ACS_1996).layout.texts.some((t) => t.text === "R")).toBe(false);
  });

  it("keeps one put by hand where it was put, in ems of the labels from its atom", () => {
    const moved: Model = { ...model, atoms: model.atoms.map((a) => (a.id === 4 ? { ...a, stereoAt: { x: 0, y: 2 } } : a)) };
    const { layout, opts } = drawingLayout(moved, { ...aromatic, shownMarks: marks }, bare);
    const t = layout.texts.find((i) => i.text === "S")!;
    const w = runsWidth(t.runs!, t.fontPx, labelSetOf(opts));
    const first = runsWidth([t.runs![0]], t.fontPx, labelSetOf(opts));
    const c = moved.atoms.find((a) => a.id === 4)!;
    expect(t.x + w / 2 - first / 2).toBeCloseTo(c.x, 9);
    expect(t.y).toBeCloseTo(c.y + 2 * opts.fontPx, 9);
  });
});
