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
    expect(READERS.map((r) => r.id)).toEqual(["meno", "cclib", "pyscf"]);
    // (the structure files Meno reads on the page, and the cube, under the readers' contract)
    expect(MENO.reads).toEqual(["meno-workspace", "rxn", "mol", "sdf", "xyz", "pdb", "cube"]);
    const [cclib, pyscf] = READER_PLUGINS;
    expect(cclib).toMatchObject({
      name: "cclib",
      version: "1.9rc1",
      profile: "plugin-cclib",
      lock: "resources/plugins/cclib/requirements.lock",
      worker: "resources/plugins/cclib/worker.py",
    });
    expect(cclib.env).toBeUndefined();
    // (every program cclib reads, each a kind it brings itself)
    expect(cclib.reads).toEqual(expect.arrayContaining(["orca", "gaussian", "gaussian-fchk", "xtb", "nwchem", "psi4", "qchem", "gamess", "molpro"]));
    expect(cclib.reads.length).toBeGreaterThan(15);
    expect(pyscf).toMatchObject({
      name: "PySCF",
      profile: "plugin-pyscf",
      lock: "resources/plugins/pyscf/pixi.lock",
      worker: "resources/plugins/pyscf/worker.py",
      env: "pixi",
      reads: ["orca", "gaussian", "gaussian-fchk", "molden"],
    });
  });

  it("are every plugin - those that read files, those that fill roles, as RDKit does, and those that fill kinds of step - each in an environment named for it", () => {
    expect(PLUGINS.map((p) => p.id)).toEqual(["cclib", "crest", "gaussian", "orca", "pyscf", "rdkit", "xtb"]);
    const rdkit = PLUGINS.find((p) => p.id === "rdkit")!;
    expect(rdkit).toMatchObject({ reads: [], profile: "plugin-rdkit", lock: "resources/plugins/rdkit/requirements.lock", worker: "resources/plugins/rdkit/worker.py" });
    expect(rdkit.roles).toEqual(["smiles", "checks", "stereoisomers", "conformers", "drawing"]);
    expect(READER_PLUGINS.map((p) => p.id)).toEqual(["cclib", "pyscf"]);
    expect(pluginsFilling("smiles").map((p) => p.id)).toEqual(["rdkit"]);
    expect(pluginsFilling("conformers").map((p) => p.id)).toEqual(["rdkit"]);
    // (and those that write files: Gaussian's input, its plugin set up as any is)
    expect(WRITER_PLUGINS.map((p) => p.id)).toEqual(["gaussian"]);
    expect(WRITER_PLUGINS[0]).toMatchObject({ reads: [], roles: [], profile: "plugin-gaussian", worker: "resources/plugins/gaussian/worker.py" });
    // (and those that run a program installed separately: ORCA, and Gaussian besides writing its input - never fetched, found)
    const orca = PLUGINS.find((p) => p.id === "orca")!;
    expect(orca.steps.map((d) => [d.kind, d.programs])).toEqual([
      ["optimise", ["orca"]],
      ["energy", ["orca"]],
      ["frequencies", ["orca"]],
    ]);
    expect(orca.installed).toEqual([{ name: "orca", label: "ORCA", files: { macos: "orca", windows: "orca.exe", linux: "orca" }, path: ["{folder}"], env: {} }]);
    expect(WRITER_PLUGINS[0].installed).toEqual([{ name: "g16", label: "Gaussian 16", files: { macos: "g16", linux: "g16" }, path: ["{folder}"], env: { g16root: ["{parent}"], GAUSS_EXEDIR: ["{folder}"] } }]);
    expect(WRITER_PLUGINS[0].steps.map((d) => d.kind)).toEqual(["optimise", "energy", "frequencies"]);
    // (and those that fill kinds of step: xTB, made by pixi - and RDKit, a 3D structure besides its roles)
    const xtb = PLUGINS.find((p) => p.id === "xtb")!;
    expect(xtb).toMatchObject({ reads: [], roles: [], writes: [], profile: "plugin-xtb", env: "pixi", lock: "resources/plugins/xtb/pixi.lock" });
    expect(xtb.steps.map((d) => d.kind)).toEqual(["optimise", "energy", "frequencies"]);
    const crest = PLUGINS.find((p) => p.id === "crest")!;
    expect(crest).toMatchObject({ profile: "plugin-crest", env: "pixi", systems: ["macos", "linux"] });
    expect(crest.steps.map((d) => [d.kind, d.programs, d.takes])).toEqual([
      ["conformers", ["crest"], ["molecules", "conformers"]],
      ["optimise", ["crest"], undefined],
    ]);
    expect(rdkit.steps.map((d) => [d.kind, d.programs])).toEqual([
      ["conformers", ["python"]],
      ["duplicates", []],
    ]);
  });

  it("each reads the kinds it brings, and Meno's: none a kind only another plugin brings, which it does not know", () => {
    const nbo = pluginOf({
      id: "nbo",
      name: "NBO",
      version: "7",
      description: "",
      licence: "",
      homepage: "",
      environment: "uv",
      reads: ["nbo-47", "xyz", "gaussian"],
      roles: [],
      steps: [],
      systems: [],
      installed: [],
      writes: [],
      guide: [],
      suggests: [],
      files: [],
      kinds: [{ id: "nbo-47", name: "NBO input", program: "NBO", extensions: [".47"], marks: [{ text: "$GENNBO" }], lines: [] }],
    });
    expect(nbo).toMatchObject({ reads: ["nbo-47", "xyz"], lock: "resources/plugins/nbo/requirements.lock", worker: "resources/plugins/nbo/worker.py" });
    // (each kind it reads one it brings, or Meno's: registered while it is added)
    registerKinds(MANIFESTS);
    for (const p of READER_PLUGINS) {
      for (const id of p.reads) expect(anyKindById(id), `${p.id} reads ${id}`).toBeDefined();
    }
    registerKinds([]);
    // (no mark of the plugins Meno carries - their kinds', their catalogues' - claims a file of Meno's own)
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
    expect(readersOf("orca", readers).map((p) => p.id)).toEqual(["cclib", "pyscf", "orca-own"]);
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
