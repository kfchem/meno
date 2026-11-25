import { describe, expect, it } from "vitest";
import { readStructures } from "../../../lib/io/structures";
import { xyzComment, xyzFrameName } from "../../../lib/chem/xyzWriter";
import { structureFileText, xyzFileText } from "./fileActions";
import { readCarried3D } from "./utils/copyPaste";
import { sharesOf, sharesWithheld } from "./utils/molecule3d";
import { chipDetails, chipEnergies, setChipRuns } from "./utils/chipSaid";
import { barsAbove, NO_ENERGY } from "./utils/barsAbove";
import { tableRows } from "./workflow/setTable";
import type { Molecule3D } from "./store/types";

/** An invented water file: three frames, each comment line written by hand. */
const block = (comment: string, dz: number) => `3\n${comment}\nO 0 0 ${dz}\nH 0.96 0 ${dz}\nH -0.24 0.93 ${dz}\n`;
const three = (a: string, b: string, c: string) => block(a, 0) + block(b, 0.05) + block(c, 0.1);

const read = (text: string, name = "made-up.xyz") => readStructures("xyz", name, text).molecules3d![0];

describe("a frame's name, from its XYZ comment line", () => {
  it("is the line as written, less Meno's own energy, trimmed", () => {
    expect(xyzFrameName("E = -76.4 Eh  alpha one")).toBe("alpha one");
    expect(xyzFrameName("  beta  E = -7.6E+01 Eh  ")).toBe("beta");
    expect(xyzFrameName("gamma E = -76.4 Eh delta")).toBe("gamma delta");
    expect(xyzFrameName("E = -76.4 Eh")).toBe("");
    // (no other form is read into it: a writer's own keywords stay as written)
    expect(xyzFrameName("[k7] site 2 dE 1.2 kcal/mol")).toBe("[k7] site 2 dE 1.2 kcal/mol");
  });

  it("names each frame of a file of several, with its energy beside", () => {
    const m = read(three("E = -76.40 Eh conformer A", "E = -76.41 Eh conformer B", "E = -76.39 Eh"));
    expect(m.frameNames).toEqual(["conformer A", "conformer B", ""]);
    expect(m.energies).toEqual([-76.4, -76.41, -76.39]);
    expect(m.atomsDiffer).toBeUndefined();
  });

  it("names none where no line has more than an energy, nor of a file of one frame", () => {
    expect(read(three("E = -1 Eh", "E = -2 Eh", "")).frameNames).toBeUndefined();
    expect(read(block("only one", 0)).frameNames).toBeUndefined();
  });

  it("keeps each frame's energy where some lines give one and others none", () => {
    const m = read(three("E = -76.40 Eh a", "b, no energy", "E = -76.38 Eh c"));
    expect(m.energies![0]).toBe(-76.4);
    expect(Number.isNaN(m.energies![1])).toBe(true);
    expect(m.energies![2]).toBe(-76.38);
    expect(m.frameNames).toEqual(["a", "b, no energy", "c"]);
    // (no line gives one: none at all)
    expect(read(three("a", "b", "c")).energies).toBeUndefined();
  });

  it("marks a file whose frames' elements differ", () => {
    const other = "3\nx\nO 0 0 0\nH 0.96 0 0\nH -0.24 0.93 0\n3\ny\nH 0 0 0\nO 0.96 0 0\nH -0.24 0.93 0\n";
    expect(read(other).atomsDiffer).toBe(true);
  });
});

describe("frame names and energies through Meno's own writers", () => {
  const water = {
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.96, y: 0, z: 0 },
      { el: "H", x: -0.24, y: 0.93, z: 0 },
    ],
    bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }],
    at: { x: 0, y: 0 },
    frames: [[0, 0, 0.05, 0.96, 0, 0.05, -0.24, 0.93, 0.05], [0, 0, 0.1, 0.96, 0, 0.1, -0.24, 0.93, 0.1]],
    energies: [-76.4, NaN, -76.38],
    frameNames: ["conformer A", "", "conformer C"],
    name: "water.xyz",
  };

  it("writes a named frame's energy, then its name; an unnamed one as before", () => {
    expect(xyzComment("water", { i: 0, of: 3 }, -76.4, null, "conformer A")).toBe("E = -76.4000000000 Eh conformer A");
    expect(xyzComment("water", { i: 1, of: 3 }, undefined, null, "")).toBe("water frame 2/3");
    const text = xyzFileText([water as never], "t", { frames: "all" });
    expect(text.split("\n").filter((_, i) => i % 5 === 1)).toEqual(["E = -76.4000000000 Eh conformer A", "water frame 2/3", "E = -76.3800000000 Eh conformer C"]);
  });

  it("reads its own XYZ back: names, and each frame's energy where it had one", () => {
    const back = read(xyzFileText([water as never], "t", { frames: "all" }), "water.xyz");
    expect(back.frameNames).toEqual(["conformer A", "water frame 2/3", "conformer C"]);
    expect(back.energies![0]).toBe(-76.4);
    expect(Number.isNaN(back.energies![1])).toBe(true);
    expect(back.energies![2]).toBe(-76.38);
  });

  it("titles each SD record with its frame's name, and reads the titles back", () => {
    const sdf = structureFileText({ atoms: [], bonds: [], molecules3d: [water as never] }, "/tmp/w.sdf", { frames: "all" } as never);
    const titles = readStructures("sdf", "w.sdf", sdf).molecules3d!.map((m) => m.title);
    expect(titles).toEqual(["conformer A", "water 2", "conformer C"]);
  });

  it("keeps names and a frame with no energy in the saved workspace", () => {
    const saved = JSON.parse(JSON.stringify(water));
    expect(saved.energies).toEqual([-76.4, null, -76.38]);
    const back = readCarried3D(saved)!;
    expect(back.frameNames).toEqual(["conformer A", "", "conformer C"]);
    expect(Number.isNaN(back.energies![1])).toBe(true);
    expect(back.energies![2]).toBe(-76.38);
  });
});

describe("a frame with no energy, where others have one", () => {
  const set = { frames: [[], []], conformerSet: true, energies: [-76.4, NaN, -76.38], numbers: [1, 2, 3] } as unknown as Molecule3D;

  it("gives no shares, and says why", () => {
    expect(sharesOf(set)).toBeUndefined();
    expect(sharesWithheld(set)).toBe("#2 has no energy, so no shares are given");
  });

  it("is said to have none; the others stand above the lowest of those that have one", () => {
    const bars = barsAbove(set.energies!);
    expect(bars.above[1]).toBeNull();
    expect(bars.above[2]).toBeCloseTo(0.02 * 627.5094740631, 3);
    const runs = setChipRuns({ count: 3, frame: 1, energies: set.energies, names: ["a", "b", "c"] });
    expect(runs.map((r) => r.text).join("")).toBe(`2 / 3b · ${NO_ENERGY}`);
  });

  it("names the frame in place of the title, whole in the details, and in Copy energies", () => {
    const c = { count: 3, frame: 0, energies: set.energies, title: "made-up", names: ["a", "", "c"] };
    expect(setChipRuns({ ...c, frame: 0 }).find((r) => r.gapPx)?.text).toBe("a");
    expect(setChipRuns({ ...c, frame: 1 }).find((r) => r.gapPx)?.text).toBe("made-up");
    expect(chipDetails(c, 2)[0]).toEqual({ group: "Name", rows: [{ label: "Frame 3", text: "c" }] });
    expect(chipEnergies(c)!.split("\n")).toEqual(["Frame\tName\tEnergy (Eh)\tAbove the lowest (kcal/mol)", "1\ta\t-76.400000\t0.00", "2\t\t\t", "3\tc\t-76.380000\t12.55"]);
  });

  it("names a set's table rows by the frame, with no energy where it has none", () => {
    const m = { ...set, atoms: [], bonds: [], at: { x: 0, y: 0 }, id: 1, name: "made-up.xyz", frameNames: ["a", "", "c"] } as unknown as Molecule3D;
    const rows = tableRows([m], "conformers");
    expect(rows.map((r) => [r.name, r.energy])).toEqual([["a", -76.4], ["made-up.xyz", undefined], ["c", -76.38]]);
  });
});
