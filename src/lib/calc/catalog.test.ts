import { describe, expect, it } from "vitest";
import { registerKinds } from "../io/kinds";
import { MANIFESTS } from "../plugins/known";
import {
  alsoReadersFor,
  anyKindById,
  MENO,
  REFUSED,
  PLUGINS,
  pluginsFilling,
  READER_PLUGINS,
  pluginOf,
  READERS,
  WRITER_PLUGINS,
  readerFor,
  readerIdOfLine,
  readerNameOf,
  readersOf,
  type PythonPlugin,
  type ReaderPlugin,
} from "./catalog";

const none = { read: {}, also: {} };

describe("the readers Meno knows of", () => {
  it("are Meno's own, then each plugin from its manifest in its folder", () => {
    expect(READERS.map((r) => r.id)).toEqual(["meno", "cclib", "gaussian", "orca", "pyscf", "wfx", "xtb"]);
    // (the structure files Meno reads on the page, and the cube, under the readers' contract)
    expect(MENO.reads).toEqual(["meno-workspace", "rxn", "mol", "sdf", "xyz", "pdb", "cube"]);
    const [cclib, gaussian, , pyscf] = READER_PLUGINS;
    expect(cclib).toMatchObject({
      name: "cclib",
      version: "0.1.6",
      uses: [{ name: "cclib", version: "1.9rc1" }],
      profile: "plugin-cclib",
      lock: "resources/plugins/cclib/requirements.lock",
      worker: "resources/plugins/cclib/worker.py",
    });
    expect(cclib.env).toBeUndefined();
    // (every program cclib reads, each a kind it brings itself)
    expect(cclib.reads).toEqual(expect.arrayContaining(["orca", "gaussian", "gaussian-fchk", "xtb", "nwchem", "psi4", "qchem", "gamess", "molpro"]));
    expect(cclib.reads.length).toBeGreaterThan(15);
    // (a program's own plugin reads its outputs: Gaussian's, the kinds it declares itself)
    expect(gaussian).toMatchObject({ name: "Gaussian interface", reads: ["gaussian", "gaussian-fchk"], worker: "resources/plugins/gaussian/worker.py" });
    expect(pyscf).toMatchObject({
      name: "PySCF",
      profile: "plugin-pyscf",
      lock: "resources/plugins/pyscf/pixi.lock",
      worker: "resources/plugins/pyscf/worker.py",
      env: "pixi",
      reads: ["orca", "gaussian", "gaussian-fchk", "molden"],
    });
    // (a program's plugin that reads its own program's output, the kind its manifest declares)
    expect(READER_PLUGINS.find((p) => p.id === "xtb")).toMatchObject({ reads: ["xtb", "xtb-g98"], ownKinds: ["xtb", "xtb-g98"], env: "pixi", worker: "resources/plugins/xtb/worker.py" });
  });

  it("are every plugin - those that read files, those that fill roles, as RDKit does, and those that fill kinds of step - each in an environment named for it", () => {
    expect(PLUGINS.map((p) => p.id)).toEqual(["blender", "cclib", "crem", "crest", "gaussian", "molnextr", "molscribe", "multiwfn", "nciplot", "orca", "pyscf", "rdkit", "reinvent", "wfx", "xtb"]);
    const rdkit = PLUGINS.find((p) => p.id === "rdkit")!;
    expect(rdkit).toMatchObject({ reads: [], profile: "plugin-rdkit", lock: "resources/plugins/rdkit/requirements.lock", worker: "resources/plugins/rdkit/worker.py" });
    expect(rdkit.roles).toEqual(["smiles", "checks", "stereoisomers", "configurations", "conformers", "drawing"]);
    expect(READER_PLUGINS.map((p) => p.id)).toEqual(["cclib", "gaussian", "orca", "pyscf", "wfx", "xtb"]);
    // (ORCA's own output read by the plugin whose program writes it: its own kind, by its manifest's writtenBy)
    expect(READER_PLUGINS.find((p) => p.id === "orca")).toMatchObject({ reads: ["orca"], ownKinds: ["orca"] });
    expect(pluginsFilling("smiles").map((p) => p.id)).toEqual(["rdkit"]);
    expect(pluginsFilling("conformers").map((p) => p.id)).toEqual(["rdkit"]);
    // (two that read structures from pictures, each standing alone: the chemist chooses, in Settings, Chemistry)
    expect(pluginsFilling("pictures").map((p) => p.id)).toEqual(["molnextr", "molscribe"]);
    for (const id of ["molnextr", "molscribe"]) {
      const p = PLUGINS.find((q) => q.id === id)!;
      expect(p).toMatchObject({ roles: ["pictures"], systems: ["macos", "windows"], lock: `resources/plugins/${id}/requirements.lock` });
      // (its trained model downloaded besides, from where its makers keep it, pinned to a revision, checked by its hash)
      expect(p.downloads).toHaveLength(1);
      expect(p.downloads[0].url).toMatch(/^https:\/\/huggingface\.co\/.+\/resolve\/[0-9a-f]{40}\//);
    }
    // (and those that write files: Gaussian's input, its plugin set up as any is)
    expect(WRITER_PLUGINS.map((p) => p.id)).toEqual(["gaussian"]);
    expect(WRITER_PLUGINS[0]).toMatchObject({ reads: ["gaussian", "gaussian-fchk"], roles: [], profile: "plugin-gaussian", worker: "resources/plugins/gaussian/worker.py" });
    // (and those that run a program installed separately: ORCA, and Gaussian besides writing its input - never fetched, found)
    const orca = PLUGINS.find((p) => p.id === "orca")!;
    expect(orca.steps.map((d) => [d.kind, d.programs])).toEqual([
      ["optimise", ["orca"]],
      ["energy", ["orca"]],
      ["frequencies", ["orca"]],
      ["path-search", ["orca"]],
      ["reaction-path", ["orca"]],
      ["saddle-point", ["orca"]],
    ]);
    expect(orca.installed).toEqual([
      {
        name: "orca",
        label: "ORCA",
        files: { macos: "orca", windows: "orca.exe", linux: "orca" },
        path: ["{folder}"],
        env: {},
        places: {},
        beside: { orca_2mkl: { macos: "orca_2mkl", linux: "orca_2mkl", windows: "orca_2mkl.exe" } },
        parallel: "processes",
      },
    ]);
    expect(WRITER_PLUGINS[0].installed).toEqual([{ name: "g16", label: "Gaussian 16", files: { macos: "g16", linux: "g16" }, path: ["{folder}"], env: { g16root: ["{parent}"], GAUSS_EXEDIR: ["{folder}"] }, places: {} }]);
    expect(WRITER_PLUGINS[0].steps.map((d) => d.kind)).toEqual(["optimise", "energy", "frequencies"]);
    // (and those that fill kinds of step: xTB, made by pixi, which reads its own program's output too - and RDKit, a 3D structure besides its roles)
    const xtb = PLUGINS.find((p) => p.id === "xtb")!;
    expect(xtb).toMatchObject({ reads: ["xtb", "xtb-g98"], roles: [], writes: [], profile: "plugin-xtb", env: "pixi", lock: "resources/plugins/xtb/pixi.lock" });
    expect(xtb.steps.map((d) => d.kind)).toEqual(["optimise", "energy", "frequencies"]);
    const crest = PLUGINS.find((p) => p.id === "crest")!;
    expect(crest).toMatchObject({ profile: "plugin-crest", env: "pixi", systems: ["macos", "linux"] });
    // (and xtb, beside it in its environment: a lone atom's energy)
    expect(crest.steps.map((d) => [d.kind, d.programs, d.takes])).toEqual([
      ["conformers", ["crest", "xtb"], ["molecules", "conformers"]],
      ["optimise", ["crest", "xtb"], undefined],
    ]);
    expect(rdkit.steps.map((d) => [d.kind, d.programs])).toEqual([
      ["conformers", ["python"]],
      ["minimise", ["python"]],
      ["check-structures", []],
      ["stereoisomers", []],
      ["descriptors", []],
    ]);
    // (and those that fill a role by running a program Meno fetches as the plugin is set up: Blender, rendering - never one installed separately)
    const blender = PLUGINS.find((p) => p.id === "blender")!;
    expect(blender).toMatchObject({ name: "Blender", roles: ["render"], rolePrograms: { render: ["blender"] }, licence: "GPL-3.0-or-later", profile: "plugin-blender" });
    // (and Render as a workflow's step, its options the role's - the same work, asked as a step)
    expect(blender.steps.map((d) => [d.kind, d.programs])).toEqual([["render", ["blender"]]]);
    expect(blender.steps[0].options.map((o) => o.id)).toEqual(blender.roleOptions.render!.map((o) => o.id));
    expect(pluginsFilling("render").map((p) => p.id)).toEqual(["blender"]);
    expect(blender.installed).toEqual([]);
    expect(blender.downloads.every((d) => d.provides === "blender")).toBe(true);
    // (and those that fill NCI: NCIPLOT from a geometry; Multiwfn from a wavefunction another plugin read - by the kinds' ids alone - or a geometry)
    const nciplot = PLUGINS.find((p) => p.id === "nciplot")!;
    expect(nciplot.steps.map((d) => [d.kind, d.programs, d.files])).toEqual([["nci", ["nciplot"], undefined]]);
    expect(nciplot.installed[0]).toMatchObject({ name: "nciplot", env: { NCIPLOT_HOME: ["{parent}"] } });
    const multiwfn = PLUGINS.find((p) => p.id === "multiwfn")!;
    expect(multiwfn.steps.map((d) => [d.kind, d.programs, d.files])).toEqual([["nci", ["multiwfn"], ["molden", "gaussian-fchk", "wfn", "wfx"]]]);
    expect(multiwfn.installed[0]).toMatchObject({ name: "multiwfn", env: { Multiwfnpath: ["{folder}"] } });
  });

  it("each reads the kinds it brings, and Meno's: none a kind only another plugin brings, which it does not know", () => {
    const nbo = pluginOf({
      id: "nbo",
      name: "NBO",
      version: "7",
      uses: [],
      description: "",
      licence: "",
      homepage: "",
      environment: "uv",
      reads: ["nbo-47", "xyz", "gaussian"],
      roles: [],
      steps: [],
      systems: [],
      installed: [],
      downloads: [],
      writes: [],
      xyzEnergies: [],
      xyzSteps: [],
      kinds: [{ id: "nbo-47", name: "NBO input", program: "NBO", extensions: [".47"], marks: [{ text: "$GENNBO" }], lines: [] }],
    });
    expect(nbo).toMatchObject({ reads: ["nbo-47", "xyz"], lock: "resources/plugins/nbo/requirements.lock", worker: "resources/plugins/nbo/worker.py" });
    // (each kind it reads one it brings, or Meno's: registered while it is added)
    registerKinds(MANIFESTS);
    for (const p of READER_PLUGINS) {
      for (const id of p.reads) expect(anyKindById(id), `${p.id} reads ${id}`).toBeDefined();
    }
    registerKinds([]);
    // (no mark of the plugins Meno carries claims a file of Meno's own)
    expect(REFUSED).toEqual([]);
  });

  it("are known by id - a molecule keeps each as its id and version - and named by it", () => {
    expect(readerIdOfLine("cclib 1.9rc1")).toBe("cclib");
    expect(readerIdOfLine("meno")).toBe("meno");
    expect(readerNameOf("pyscf")).toBe("PySCF");
    expect(readerNameOf("meno")).toBe("Meno");
    expect(readerNameOf("nbo")).toBe("nbo");
  });
});

describe("who reads a kind", () => {
  // another reader of ORCA's output, and of cubes
  const other: ReaderPlugin = { ...(READER_PLUGINS[0] as PythonPlugin), id: "orca-own", name: "Meno's ORCA reader", reads: ["orca", "cube"], profile: "plugin-orca-own" };
  const readers = [...READERS, other];

  it("is any reader that reads it, in Meno's order: Meno first, where it reads it", () => {
    expect(readersOf("orca", readers).map((p) => p.id)).toEqual(["cclib", "orca", "pyscf", "orca-own"]);
    expect(readersOf("molden", readers).map((p) => p.id)).toEqual(["pyscf"]);
    expect(readersOf("cube", readers).map((p) => p.id)).toEqual(["meno", "orca-own"]);
  });

  it("is the one chosen, where it is added; else Meno, where it reads it; else the first added", () => {
    const both = new Set(["cclib", "orca-own"]);
    expect(readerFor("orca", both, none, readers)?.id).toBe("cclib");
    expect(readerFor("orca", both, { read: { orca: "orca-own" }, also: {} }, readers)?.id).toBe("orca-own");
    // (chosen, but taken out again: the first added reads it)
    expect(readerFor("orca", new Set(["cclib"]), { read: { orca: "orca-own" }, also: {} }, readers)?.id).toBe("cclib");
    // (a choice for one kind is no choice for another)
    expect(readerFor("gaussian", both, { read: { orca: "orca-own" }, also: {} }, readers)?.id).toBe("cclib");
    // (Meno keeps its kinds, a plugin that reads it too added - unless the plugin is chosen)
    expect(readerFor("cube", both, none, readers)?.id).toBe("meno");
    expect(readerFor("cube", both, { read: { cube: "orca-own" }, also: {} }, readers)?.id).toBe("orca-own");
  });

  it("is, where none is chosen and Meno does not read it, the plugin whose own program writes it, before a reader of many programs' outputs", () => {
    // (a plugin that runs the program whose output it is, and says so in its manifest: `writtenBy`, one of its own programs)
    const own: ReaderPlugin = { ...other, id: "program-own", name: "The program's plugin", reads: ["orca"], ownKinds: ["orca"], profile: "plugin-program-own" };
    const withOwn = [...READERS, own];
    const all = new Set(["cclib", "pyscf", "program-own"]);
    expect(readerFor("orca", all, none, withOwn)?.id).toBe("program-own");
    // (chosen, another reads it: the chemist's choice stands)
    expect(readerFor("orca", all, { read: { orca: "cclib" }, also: {} }, withOwn)?.id).toBe("cclib");
    // (not added: the first added reads it, as before)
    expect(readerFor("orca", new Set(["cclib", "pyscf"]), none, withOwn)?.id).toBe("cclib");
    // (a kind it does not write is read as before)
    expect(readerFor("gaussian", all, none, withOwn)?.id).toBe("cclib");
    // (and it reads it as well, where chosen to, as any reader)
    expect(alsoReadersFor("orca", all, { read: {}, also: { orca: ["cclib"] } }, withOwn).map((p) => p.id)).toEqual(["cclib"]);
  });

  it("is none where nothing added reads it", () => {
    expect(readerFor("orca", new Set(), none, readers)).toBeNull();
    expect(readerFor("xtb", new Set(["pyscf"]), none, readers)).toBeNull();
  });

  it("reads it alone, unless others are chosen to read it as well - each added, each reading it, the reader not twice", () => {
    const all = new Set(["cclib", "pyscf", "orca-own"]);
    expect(alsoReadersFor("orca", all, none, readers)).toEqual([]);
    const also = { read: {}, also: { orca: ["pyscf", "cclib", "orca-own"], gaussian: ["orca-own"] } };
    expect(alsoReadersFor("orca", all, also, readers).map((p) => p.id)).toEqual(["pyscf", "orca-own"]);
    expect(alsoReadersFor("orca", new Set(["cclib"]), also, readers)).toEqual([]);
    // (orca-own does not read Gaussian's output)
    expect(alsoReadersFor("gaussian", all, also, readers)).toEqual([]);
  });
});
