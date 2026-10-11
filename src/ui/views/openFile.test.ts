import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openable, openedAs, openedTexts, textsOf } from "./openFile";
import { registerKinds } from "../../lib/io/kinds";
import { MANIFESTS } from "../../lib/plugins/known";

const MOL = `ethanol
  Meno

  2  1  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
M  END
`;

describe("openedAs", () => {
  it("opens a chemical file on a workspace, named for the file", () => {
    expect(openedAs("ethanol.mol", MOL)).toEqual({
      kind: "workspace",
      label: "ethanol.mol",
      data: { filename: "ethanol.mol", payload: MOL, kind: "mol" },
    });
    // (told what it is, so that the canvas need not ask again; and where it is, where that is known)
    expect(openedAs("ethanol.mol", MOL, "/data/ethanol.mol").data).toMatchObject({ kind: "mol", path: "/data/ethanol.mol" });
  });

  it("opens an XYZ file and a Meno workspace on a workspace too, where 3D stands in 3D", () => {
    const xyz = "3\nwater\nO 0 0 0\nH 0.76 0.59 0\nH -0.76 0.59 0\n";
    expect(openedAs("water.xyz", xyz)).toEqual({ kind: "workspace", label: "water.xyz", data: { filename: "water.xyz", payload: xyz, kind: "xyz" } });
    // (known by its content, whatever it is called)
    expect(openedAs("water.out", xyz).kind).toBe("workspace");
    expect(openedAs("work.meno", "{}").kind).toBe("workspace");
  });

  it("opens text into a workspace's column, as it is - on a canvas of its own where none takes it", () => {
    expect(openedAs("run.py", "print(1)\n", "/w/run.py")).toEqual({
      kind: "workspace",
      label: "run.py",
      data: { texts: [{ name: "run.py", text: "print(1)\n", path: "/w/run.py" }], filename: "run.py", path: "/w/run.py" },
    });
    // (JSON too: its words kept as they are, to be written back as they were)
    expect(textsOf(openedAs("a.json", '{"a":1}'))).toEqual([{ name: "a.json", text: '{"a":1}' }]);
    expect(textsOf(openedAs("notes.abc", "plain words"))).toEqual([{ name: "notes.abc", text: "plain words" }]);
    expect(textsOf(openedAs("ethanol.mol", MOL))).toBeUndefined();
  });

  it("opens texts together on one canvas, named for the first - a new one, with no name, as Untitled", () => {
    const opened = openedTexts([{ name: "a.txt", text: "a" }, { name: "b.txt", text: "b" }]);
    expect(opened).toMatchObject({ kind: "workspace", label: "a.txt", data: { filename: "a.txt" } });
    expect(textsOf(opened)).toHaveLength(2);
    expect(openedTexts([{ name: "", text: "" }])).toEqual({ kind: "workspace", label: "Untitled.txt", data: { texts: [{ name: "", text: "" }] } });
  });

  it("offers chemical files, calculations' output - of the plugins added, and those their catalogues name - and text to Open, and no kind nothing reads", () => {
    registerKinds([]);
    for (const ext of [".meno", ".mol", ".sdf", ".rxn", ".xyz", ".pdb", ".cube", ".log", ".txt", ".py"]) expect(openable()).toContain(ext);
    // (nothing added that reads, writes or names them: no calculation's files)
    expect(openable()).not.toContain(".out");
    expect(openable()).not.toContain(".gjf");
    registerKinds(MANIFESTS.filter((m) => m.id === "getting-started"));
    expect(openable()).toEqual(expect.arrayContaining([".out", ".fchk", ".molden"]));
    // (what a plugin added writes, a calculation's input, as text to change)
    registerKinds(MANIFESTS.filter((m) => m.id === "gaussian"));
    expect(openable()).toEqual(expect.arrayContaining([".gjf", ".com"]));
    expect(textsOf(openedAs("job.gjf", "# B3LYP/6-31G(d) Opt\n"))).toHaveLength(1);
    registerKinds(MANIFESTS);
    expect(openable()).not.toContain(".ket");
    // (each once)
    expect(new Set(openable()).size).toBe(openable().length);
  });

  describe("with plugins added that read calculations' output", () => {
    beforeEach(() => registerKinds(MANIFESTS));
    afterEach(() => registerKinds([]));

    it("opens a calculation's output on a workspace, a log of something else as text", () => {
      expect(openedAs("job.out", "\n                                 * O   R   C   A *\n")).toMatchObject({ kind: "workspace", label: "job.out" });
      expect(openedAs("run.log", " Entering Gaussian System, Link 0=g16\n")).toMatchObject({ kind: "workspace" });
      expect(textsOf(openedAs("build.log", "compiled in 3 s\n"))).toHaveLength(1);
    });
  });

  it("opens a calculation's output as text where no plugin added reads it: Meno knows no program", () => {
    expect(textsOf(openedAs("run.log", " Entering Gaussian System, Link 0=g16\n"))).toHaveLength(1);
  });
});
