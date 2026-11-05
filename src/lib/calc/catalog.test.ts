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
  kindsNotTaken,
  readersUndecided,
  stepFiles,
  type PythonPlugin,
  type ReaderPlugin,
} from "./catalog";

const none = { read: {}, also: {} };

describe("the readers Meno knows of", () => {
  it("are Meno's own, then each plugin from its manifest in its folder", () => {
    expect(READERS.map((r) => r.id)).toEqual(["meno", "manyread", "orbitron", "quanta", "tightbind", "wavecalc"]);
    // (the structure files Meno reads on the page, and the cube and the WFX file, under the readers' contract - the Molden file
    // told by Meno, read by a plugin that reads it)
    expect(MENO.reads).toEqual(["meno-workspace", "rxn", "mol", "sdf", "xyz", "pdb", "cube", "wfx"]);
    const [manyread, orbitron, , , wavecalc] = READER_PLUGINS;
    expect(manyread).toMatchObject({
      name: "Manyread",
      version: "0.3.0",
      uses: [],
      profile: "plugin-manyread",
      lock: expect.stringMatching(/^plugins\/manyread\/[^/]+\/requirements\.lock$/),
      worker: expect.stringMatching(/^plugins\/manyread\/[^/]+\/worker\.py$/),
    });
    expect(manyread.env).toBeUndefined();
    // (every program's output a reader of many reads, each a kind it brings itself)
    expect(manyread.reads).toEqual(["quanta", "orbitron", "orbitron-checkpoint", "tightbind", "alphachem", "betawave"]);
    // (a program's own plugin reads its outputs: the kinds it declares itself)
    expect(orbitron).toMatchObject({ name: "Orbitron interface", reads: ["orbitron", "orbitron-checkpoint"], worker: expect.stringMatching(/^plugins\/orbitron\/[^/]+\/worker\.py$/) });
    expect(wavecalc).toMatchObject({
      name: "Wavecalc",
      profile: "plugin-wavecalc",
      lock: expect.stringMatching(/^plugins\/wavecalc\/[^/]+\/pixi\.lock$/),
      worker: expect.stringMatching(/^plugins\/wavecalc\/[^/]+\/worker\.py$/),
      env: "pixi",
      reads: ["molden"],
    });
    // (a program's plugin that reads its own program's output, the kind its manifest declares)
    expect(READER_PLUGINS.find((p) => p.id === "tightbind")).toMatchObject({
      reads: ["tightbind", "tightbind-freq"],
      ownKinds: ["tightbind", "tightbind-freq"],
      env: "pixi",
      worker: expect.stringMatching(/^plugins\/tightbind\/[^/]+\/worker\.py$/),
    });
  });

  it("are every plugin - those that read files, those that fill roles, and those that fill kinds of step - each in an environment named for it", () => {
    expect(PLUGINS.map((p) => p.id)).toEqual(["confsweep", "densitool", "fragswap", "lumen", "manyread", "molgen", "ncigrid", "orbitron", "picread", "picread2", "quanta", "sketchkit", "tightbind", "wavecalc"]);
    const sketchkit = PLUGINS.find((p) => p.id === "sketchkit")!;
    expect(sketchkit).toMatchObject({ reads: [], profile: "plugin-sketchkit", lock: expect.stringMatching(/^plugins\/sketchkit\/[^/]+\/requirements\.lock$/), worker: expect.stringMatching(/^plugins\/sketchkit\/[^/]+\/worker\.py$/) });
    expect(sketchkit.roles).toEqual(["smiles", "checks", "stereoisomers", "configurations", "conformers", "drawing"]);
    expect(READER_PLUGINS.map((p) => p.id)).toEqual(["manyread", "orbitron", "quanta", "tightbind", "wavecalc"]);
    // (a program's own output read by the plugin whose program writes it: its own kind, by its manifest's writtenBy)
    expect(READER_PLUGINS.find((p) => p.id === "quanta")).toMatchObject({ reads: ["quanta"], ownKinds: ["quanta"] });
    expect(pluginsFilling("smiles").map((p) => p.id)).toEqual(["sketchkit"]);
    expect(pluginsFilling("conformers").map((p) => p.id)).toEqual(["sketchkit"]);
    // (two that read structures from pictures, each standing alone: the chemist chooses, in Settings, Chemistry)
    expect(pluginsFilling("pictures").map((p) => p.id)).toEqual(["picread", "picread2"]);
    for (const id of ["picread", "picread2"]) {
      const p = PLUGINS.find((q) => q.id === id)!;
      expect(p).toMatchObject({ roles: ["pictures"], systems: ["macos", "windows"], lock: expect.stringMatching(new RegExp(`^plugins/${id}/[^/]+/requirements\\.lock$`)) });
      // (the confidence its model's reading is unsure below, as it declares it)
      expect(p.roleUnsure.pictures).toBeGreaterThan(0);
      expect(p.roleUnsure.pictures).toBeLessThan(1);
      // (its trained model downloaded besides, from where its makers keep it, pinned to a revision, checked by its hash)
      expect(p.downloads).toHaveLength(1);
      expect(p.downloads[0].url).toMatch(/^https:\/\/huggingface\.co\/.+\/resolve\/[0-9a-f]{40}\//);
    }
    // (and those that write files: a program's input, its plugin set up as any is)
    expect(WRITER_PLUGINS.map((p) => p.id)).toEqual(["orbitron"]);
    expect(WRITER_PLUGINS[0]).toMatchObject({ reads: ["orbitron", "orbitron-checkpoint"], roles: [], profile: "plugin-orbitron", worker: expect.stringMatching(/^plugins\/orbitron\/[^/]+\/worker\.py$/) });
    // (and those that run a program installed separately - never fetched, found)
    const quanta = PLUGINS.find((p) => p.id === "quanta")!;
    expect(quanta.steps.map((d) => [d.kind, d.programs])).toEqual([
      ["optimise", ["quanta"]],
      ["energy", ["quanta"]],
      ["frequencies", ["quanta"]],
      ["path-search", ["quanta"]],
      ["reaction-path", ["quanta"]],
      ["saddle-point", ["quanta"]],
    ]);
    expect(quanta.installed).toEqual([
      {
        name: "quanta",
        label: "Quanta",
        files: { macos: "quanta", windows: "quanta.exe", linux: "quanta" },
        path: ["{folder}"],
        env: {},
        places: {},
        parallel: "processes",
      },
    ]);
    expect(WRITER_PLUGINS[0].installed).toEqual([{ name: "orb26", label: "Orbitron 26", files: { macos: "orb26", linux: "orb26", windows: "orb26.exe" }, path: [], env: {}, places: {} }]);
    expect(WRITER_PLUGINS[0].steps.map((d) => d.kind)).toEqual(["optimise", "energy", "frequencies"]);
    // (and those that fill kinds of step: one made by pixi, which reads its own program's output too - and a role plugin, a 3D structure besides its roles)
    const tightbind = PLUGINS.find((p) => p.id === "tightbind")!;
    expect(tightbind).toMatchObject({ reads: ["tightbind", "tightbind-freq"], roles: [], writes: [], profile: "plugin-tightbind", env: "pixi", lock: expect.stringMatching(/^plugins\/tightbind\/[^/]+\/pixi\.lock$/) });
    expect(tightbind.steps.map((d) => d.kind)).toEqual(["optimise", "energy", "frequencies"]);
    const confsweep = PLUGINS.find((p) => p.id === "confsweep")!;
    expect(confsweep).toMatchObject({ profile: "plugin-confsweep", env: "pixi", systems: ["macos", "linux"] });
    // (its own program alone, and no lone atom: its program stops on one)
    expect(confsweep.steps.map((d) => [d.kind, d.programs, d.takes, d.noLoneAtom])).toEqual([
      ["conformers", ["confsweep"], ["molecules", "conformers"], true],
      ["optimise", ["confsweep"], undefined, true],
    ]);
    expect(sketchkit.steps.map((d) => [d.kind, d.programs])).toEqual([
      ["conformers", ["python"]],
      ["minimise", ["python"]],
      ["descriptors", []],
    ]);
    // (and those that fill a role by running a program Meno fetches as the plugin is set up: rendering - never one installed separately)
    const lumen = PLUGINS.find((p) => p.id === "lumen")!;
    expect(lumen).toMatchObject({ name: "Lumen", roles: ["render"], rolePrograms: { render: ["lumen"] }, licence: "GPL-3.0-or-later", profile: "plugin-lumen" });
    // (and Render as a workflow's step, its options the role's - the same work, asked as a step)
    expect(lumen.steps.map((d) => [d.kind, d.programs])).toEqual([["render", ["lumen"]]]);
    expect(lumen.steps[0].options.map((o) => o.id)).toEqual(lumen.roleOptions.render!.map((o) => o.id));
    expect(pluginsFilling("render").map((p) => p.id)).toEqual(["lumen"]);
    expect(lumen.installed).toEqual([]);
    expect(lumen.downloads.every((d) => d.provides === "lumen")).toBe(true);
    // (and those that fill NCI: one from a geometry; one from a wavefunction another plugin read - by the kinds' ids alone - or a geometry)
    const ncigrid = PLUGINS.find((p) => p.id === "ncigrid")!;
    expect(ncigrid.steps.map((d) => [d.kind, d.programs, d.files])).toEqual([["nci", ["ncigrid"], undefined]]);
    expect(ncigrid.installed[0]).toMatchObject({ name: "ncigrid", env: { NCIGRID_HOME: ["{parent}"] } });
    const densitool = PLUGINS.find((p) => p.id === "densitool")!;
    expect(densitool.steps.map((d) => [d.kind, d.programs, d.files])).toEqual([["nci", ["densitool"], ["molden", "orbitron-checkpoint", "wfx"]]]);
    // (Meno's own kinds, and another plugin's checkpoint, which it says it uses - taken only while that plugin is added)
    expect(densitool.depends?.map((d) => [d.plugin, d.kinds, d.optional])).toEqual([["orbitron", ["orbitron-checkpoint"], true]]);
    expect(stepFiles(densitool, "nci", new Set(["densitool"]))).toEqual(["molden", "wfx"]);
    expect(stepFiles(densitool, "nci", new Set(["densitool", "orbitron"]))).toEqual(["molden", "orbitron-checkpoint", "wfx"]);
    // (that plugin of a version it works with: taken, nothing said)
    expect(kindsNotTaken(densitool, new Set(["densitool", "orbitron"]))).toEqual([]);
    const orbitron = PLUGINS.find((p) => p.id === "orbitron")!;
    expect(densitool.depends?.[0].range).toEqual({ from: "0.3.0", before: "1.0.0" });
    expect(orbitron.version.startsWith("0.")).toBe(true);
    expect(densitool.installed[0]).toMatchObject({ name: "densitool", env: { DENSITOOL_HOME: ["{folder}"] } });
  });

  it("each reads the kinds it brings, and Meno's: none a kind only another plugin brings, which it does not know", () => {
    const bondorb = pluginOf({
      id: "bondorb",
      name: "Bondorb",
      version: "7",
      contract: 1,
      uses: [],
      description: "",
      licence: "",
      homepage: "",
      environment: "uv",
      reads: ["bondorb-in", "xyz", "orbitron"],
      roles: [],
      steps: [],
      systems: [],
      installed: [],
      downloads: [],
      writes: [],
      xyzEnergies: [],
      xyzSteps: [],
      kinds: [{ id: "bondorb-in", name: "Bondorb input", program: "Bondorb", extensions: [".bo"], marks: [{ text: "$BONDORB" }], lines: [] }],
    });
    expect(bondorb).toMatchObject({ reads: ["bondorb-in", "xyz"], lock: "plugins/bondorb/7/requirements.lock", worker: "plugins/bondorb/7/worker.py" });
    // (each kind it reads one it brings, or Meno's: registered while it is added)
    registerKinds(MANIFESTS);
    for (const p of READER_PLUGINS) {
      for (const id of p.reads) expect(anyKindById(id), `${p.id} reads ${id}`).toBeDefined();
    }
    registerKinds([]);
    // (no mark of the plugins Meno knows of claims a file of Meno's own)
    expect(REFUSED).toEqual([]);
  });

  it("are known by id - a molecule keeps each as its id and version - and named by it", () => {
    expect(readerIdOfLine("manyread 2.1")).toBe("manyread");
    expect(readerIdOfLine("meno")).toBe("meno");
    expect(readerNameOf("wavecalc")).toBe("Wavecalc");
    expect(readerNameOf("meno")).toBe("Meno");
    expect(readerNameOf("bondorb")).toBe("bondorb");
  });
});

describe("who reads a kind", () => {
  // another reader of Quanta's output, and of cubes
  const other: ReaderPlugin = { ...(READER_PLUGINS[0] as PythonPlugin), id: "quanta-own", name: "Meno's Quanta reader", reads: ["quanta", "cube"], profile: "plugin-quanta-own" };
  const readers = [...READERS, other];

  it("is any reader that reads it, in Meno's order: Meno first, where it reads it", () => {
    expect(readersOf("quanta", readers).map((p) => p.id)).toEqual(["manyread", "quanta", "quanta-own"]);
    expect(readersOf("molden", readers).map((p) => p.id)).toEqual(["wavecalc"]);
    expect(readersOf("cube", readers).map((p) => p.id)).toEqual(["meno", "quanta-own"]);
  });

  it("is the one chosen, where it is added; else Meno, where it reads it; else the one added - and, of several, none: the chemist chooses, never the first by its name", () => {
    const both = new Set(["manyread", "quanta-own"]);
    expect(readerFor("quanta", both, none, readers)).toBeNull();
    expect(readersUndecided("quanta", both, none, readers).map((p) => p.id)).toEqual(["manyread", "quanta-own"]);
    expect(readerFor("quanta", both, { read: { quanta: "quanta-own" }, also: {} }, readers)?.id).toBe("quanta-own");
    expect(readersUndecided("quanta", both, { read: { quanta: "quanta-own" }, also: {} }, readers)).toEqual([]);
    // (chosen, but taken out again: the one added reads it)
    expect(readerFor("quanta", new Set(["manyread"]), { read: { quanta: "quanta-own" }, also: {} }, readers)?.id).toBe("manyread");
    // (a choice for one kind is no choice for another: Orbitron's output, read by Manyread alone of the two)
    expect(readerFor("orbitron", both, { read: { quanta: "quanta-own" }, also: {} }, readers)?.id).toBe("manyread");
    // (Meno keeps its kinds, a plugin that reads it too added - unless the plugin is chosen)
    expect(readerFor("cube", both, none, readers)?.id).toBe("meno");
    expect(readerFor("cube", both, { read: { cube: "quanta-own" }, also: {} }, readers)?.id).toBe("quanta-own");
  });

  it("is, where none is chosen and Meno does not read it, the plugin whose own program writes it, before a reader of many programs' outputs", () => {
    // (a plugin that runs the program whose output it is, and says so in its manifest: `writtenBy`, one of its own programs)
    const own: ReaderPlugin = { ...other, id: "program-own", name: "The program's plugin", reads: ["quanta"], ownKinds: ["quanta"], profile: "plugin-program-own" };
    const withOwn = [...READERS, own];
    const all = new Set(["manyread", "wavecalc", "program-own"]);
    expect(readerFor("quanta", all, none, withOwn)?.id).toBe("program-own");
    // (chosen, another reads it: the chemist's choice stands)
    expect(readerFor("quanta", all, { read: { quanta: "manyread" }, also: {} }, withOwn)?.id).toBe("manyread");
    // (not added: the one added that reads it)
    expect(readerFor("quanta", new Set(["manyread", "wavecalc"]), none, withOwn)?.id).toBe("manyread");
    // (a kind it does not write is read as before)
    expect(readerFor("orbitron", all, none, withOwn)?.id).toBe("manyread");
    // (and it reads it as well, where chosen to, as any reader)
    expect(alsoReadersFor("quanta", all, { read: {}, also: { quanta: ["manyread"] } }, withOwn).map((p) => p.id)).toEqual(["manyread"]);
  });

  it("is none where nothing added reads it", () => {
    expect(readerFor("quanta", new Set(), none, readers)).toBeNull();
    expect(readerFor("tightbind", new Set(["wavecalc"]), none, readers)).toBeNull();
  });

  it("reads it alone, unless others are chosen to read it as well - each added, each reading it, the reader not twice", () => {
    const all = new Set(["manyread", "wavecalc", "quanta-own"]);
    expect(alsoReadersFor("quanta", all, none, readers)).toEqual([]);
    const also = { read: { quanta: "manyread" }, also: { quanta: ["wavecalc", "manyread", "quanta-own"], orbitron: ["quanta-own"] } };
    // (Wavecalc, chosen, does not read Quanta's output; Manyread is its reader)
    expect(alsoReadersFor("quanta", all, also, readers).map((p) => p.id)).toEqual(["quanta-own"]);
    expect(alsoReadersFor("quanta", new Set(["manyread"]), also, readers)).toEqual([]);
    // (quanta-own does not read Orbitron's output)
    expect(alsoReadersFor("orbitron", all, also, readers)).toEqual([]);
  });
});
