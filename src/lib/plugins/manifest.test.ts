import { describe, expect, it } from "vitest";
import { acceptManifest, folded, holdsMark, markAt } from "./manifest";
import { MANIFESTS } from "./known";

const good = {
  id: "nbo",
  name: "NBO",
  version: "7.0",
  description: "Natural bond orbitals.",
  licence: "Commercial",
  homepage: "https://nbo7.chem.wisc.edu",
  environment: "uv",
  kinds: [{ id: "nbo-47", name: "NBO input", program: "NBO", extensions: [".47"], marks: [{ text: "$GENNBO", at: "line-start" }], lines: [] }],
  reads: ["gaussian", "nbo-47"],
  writes: [],
  roles: [],
  steps: [],
  systems: [],
  installed: [],
  guide: [],
  suggests: [],
  files: [],
};

describe("a plugin's manifest", () => {
  it("is read as data: what it is, what makes its environment, the kinds of file it knows and those it reads", () => {
    expect(acceptManifest(good)).toEqual(good);
    // (what it does not say, it has none of)
    const { writes: _w, roles: _r, steps: _s, systems: _y, installed: _i, guide: _g, suggests: _u, files: _f, ...said } = good;
    expect(acceptManifest(said)).toEqual(good);
    // (each plugin Meno carries, from its folder: Meno names none of them)
    expect(MANIFESTS.map((m) => m.id)).toEqual(["cclib", "crest", "gaussian", "getting-started", "orca", "pyscf", "rdkit", "xtb"]);
  });

  it("knows each kind of file in one list: those it reads told by their marks, those it only colours by their names and lines", () => {
    const kinds = (k: unknown[], reads: string[] = []) => acceptManifest({ ...good, kinds: k, reads })!;
    const coloured = { id: "nbo-in", name: "NBO input", extensions: [".nbo"], lines: ["$", "!", 3], grammar: { file: "nbo.grammar", tones: { Word: "keyword" } } };
    const read = kinds([coloured], []);
    // (a line's start as short as a letter: it claims no file)
    expect(read.kinds).toEqual([{ id: "nbo-in", name: "NBO input", extensions: [".nbo"], marks: [], lines: ["$", "!"], grammar: { file: "nbo.grammar", tones: { Word: "keyword" } } }]);
    // (a kind it reads must be told: by a mark, or by asking it)
    expect(kinds([{ ...coloured, grammar: undefined }], ["nbo-in"])).toBeNull();
    expect(kinds([{ ...coloured, probe: true }], ["nbo-in"]).reads).toEqual(["nbo-in"]);
    // (ORCA's input, as Meno carries it: a text it colours, told among .inp files by what its lines begin with)
    const orca = MANIFESTS.find((m) => m.id === "orca")!;
    expect(orca.kinds.map((k) => [k.id, k.lines])).toEqual([["orca-input", ["!", "%", "*"]]]);
    expect(orca.reads).toEqual([]);
  });

  it("may write kinds of its own: each one of its kinds, named and with its files' names as the kind says, its options as data", () => {
    const writer = {
      ...good,
      kinds: [
        { id: "nbo-input", name: "NBO input", extensions: [".47", "47", ".NOT/AN/EXT"] },
        { id: "nameless", name: "No extension", extensions: [] },
      ],
      reads: [],
      writes: [
        {
          kind: "nbo-input",
          options: [
            { id: "charge", label: "Charge", type: "number", default: 0, from: "charge" },
            { id: "bad", label: "Bad", type: "choice", choices: [{ value: "a", label: "A" }], default: "b" },
            { id: "run", label: "Run", type: "code", default: "rm -rf /" },
          ],
        },
        { kind: "nbo-input" },
        { kind: "nameless" },
        { kind: "someone-elses" },
      ],
    };
    expect(acceptManifest(writer)?.writes).toEqual([{ id: "nbo-input", name: "NBO input", extensions: [".47"], options: [{ id: "charge", label: "Charge", type: "number", default: 0, from: "charge" }] }]);
    // (the plugin Meno carries that writes Gaussian's input: read as any would be)
    const gaussian = MANIFESTS.find((m) => m.id === "gaussian")!;
    expect(gaussian.writes.map((w) => [w.id, w.extensions, !!w.grammar])).toEqual([["gaussian-input", [".gjf", ".com"], true]]);
    expect(gaussian.writes[0].options.map((o) => o.id)).toEqual(["job", "method", "basis", "dispersion", "keywords", "charge", "multiplicity", "title", "checkpoint", "processors", "memory"]);
  });

  it("fills roles, each Meno's, once - with options only where the role takes them", () => {
    const opts = [{ id: "count", label: "Conformers sought", type: "number", default: 30, min: 1 }];
    const roles = [{ role: "conformers", options: opts }, { role: "smiles", options: [{ id: "x", label: "X", type: "switch", default: true }] }, { role: "smiles" }, { role: "Not A Role" }, "checks"];
    expect(acceptManifest({ ...good, reads: [], kinds: [], roles })?.roles).toEqual([
      { role: "conformers", options: [{ id: "count", label: "Conformers sought", type: "number", default: 30, min: 1 }] },
      { role: "smiles", options: [] },
    ]);
    // (RDKit's, as it carries them)
    const rdkit = MANIFESTS.find((m) => m.id === "rdkit")!;
    expect(rdkit.roles.map((r) => r.role)).toEqual(["smiles", "checks", "stereoisomers", "conformers", "drawing"]);
    expect(rdkit.roles.find((r) => r.role === "conformers")?.options.map((o) => o.id)).toEqual(["count", "field", "iters", "same", "seed"]);
  });

  it("fills kinds of step: several in one with what they share, each Meno's and once, its programs by name - never a path - its options as data", () => {
    const level = { id: "level", label: "Level", type: "choice", choices: [{ value: "tight", label: "Tight" }], default: "tight" };
    const steps = {
      ...good,
      reads: [],
      kinds: [],
      steps: [
        { kinds: ["optimise", "energy"], programs: ["xtb", "../bin/sh", "/usr/bin/xtb", "xtb"], options: [level] },
        { kinds: ["optimise"], programs: ["other"] },
        { kinds: ["Not A Kind", "frequencies"], programs: ["xtb"] },
        { kinds: ["conformers"], takes: ["molecules", "drawings", "conformers"] },
        { kinds: ["duplicates"], takes: [] },
        { kind: "populations" },
      ],
    };
    const lvl = { id: "level", label: "Level", type: "choice", choices: [{ value: "tight", label: "Tight" }], default: "tight" };
    expect(acceptManifest(steps)?.steps).toEqual([
      { kind: "optimise", programs: ["xtb"], options: [lvl] },
      { kind: "energy", programs: ["xtb"], options: [lvl] },
      { kind: "frequencies", programs: ["xtb"], options: [] },
      // (what it takes, of what flows: none said, all its kind takes)
      { kind: "conformers", programs: [], options: [], takes: ["molecules", "conformers"] },
      { kind: "duplicates", programs: [], options: [] },
    ]);
    // (xTB's and ORCA's, as Meno carries them)
    const xtb = MANIFESTS.find((m) => m.id === "xtb")!;
    expect(xtb.steps.map((d) => [d.kind, d.programs, d.options.map((o) => o.id)])).toEqual([
      ["optimise", ["xtb"], ["method", "solvent", "level"]],
      ["energy", ["xtb"], ["method", "solvent"]],
      ["frequencies", ["xtb"], ["method", "solvent"]],
    ]);
    const orca = MANIFESTS.find((m) => m.id === "orca")!;
    expect(orca.steps.map((d) => d.kind)).toEqual(["optimise", "energy", "frequencies"]);
  });

  it("asks a step of a kind that is also a role it fills, saying no options, with the role's", () => {
    const opts = [{ id: "count", label: "Conformers sought", type: "number", default: 30 }];
    const read = acceptManifest({ ...good, reads: [], kinds: [], roles: [{ role: "conformers", options: opts }], steps: [{ kinds: ["conformers"], programs: ["python"] }, { kinds: ["optimise"], options: [] }] })!;
    expect(read.steps.map((d) => [d.kind, d.options.map((o) => o.id)])).toEqual([
      ["conformers", ["count"]],
      ["optimise", []],
    ]);
    // (RDKit's conformer search, as a step: the options it takes as a role)
    const rdkit = MANIFESTS.find((m) => m.id === "rdkit")!;
    expect(rdkit.steps.find((d) => d.kind === "conformers")?.options).toEqual(rdkit.roles.find((r) => r.role === "conformers")?.options);
  });

  it("may say the systems it can be added on - those Meno knows of; none said, every one", () => {
    const steps = { ...good, reads: [], kinds: [], steps: [{ kinds: ["conformers"], programs: ["crest"] }] };
    expect(acceptManifest({ ...steps, systems: ["macos", "linux", "beos"] })?.systems).toEqual(["macos", "linux"]);
    expect(acceptManifest(steps)?.systems).toEqual([]);
    // (CREST's, as Meno carries it: conda-forge has it for macOS and Linux)
    expect(MANIFESTS.find((m) => m.id === "crest")?.systems).toEqual(["macos", "linux"]);
    expect(MANIFESTS.find((m) => m.id === "xtb")?.systems).toEqual([]);
  });

  it("may run programs installed separately: each by its name, what it is called, its file on each system, and places in its installation - only those its steps run", () => {
    const steps = { ...good, reads: [], kinds: [], steps: [{ kinds: ["energy"], programs: ["orca", "g16"] }] };
    const installed = [
      { name: "orca", label: "ORCA", files: { macos: "orca", linux: "orca", windows: "orca.exe", beos: "orca" }, path: "{folder}" },
      { name: "orca", label: "Again", files: { linux: "orca" } },
      { name: "g16", label: "Gaussian 16", files: { linux: "g16" }, path: ["{folder}", "{parent}/bsd"], env: { g16root: "{parent}", GAUSS_EXEDIR: ["{folder}", "{folder}/bsd"] } },
      { name: "unrun", label: "Not run by a step", files: { linux: "unrun" } },
      { name: "pathed", label: "A path", files: { linux: "/usr/bin/pathed" } },
      { name: "../x", label: "X", files: { linux: "x" } },
    ];
    expect(acceptManifest({ ...steps, installed })?.installed).toEqual([
      { name: "orca", label: "ORCA", files: { macos: "orca", windows: "orca.exe", linux: "orca" }, path: ["{folder}"], env: {} },
      { name: "g16", label: "Gaussian 16", files: { linux: "g16" }, path: ["{folder}", "{parent}/bsd"], env: { g16root: ["{parent}"], GAUSS_EXEDIR: ["{folder}", "{folder}/bsd"] } },
    ]);
    // (a place outside its installation, a variable it may not set: as Meno's backend, none of it)
    const g16 = (d: Record<string, unknown>) => acceptManifest({ ...steps, installed: [{ name: "g16", label: "Gaussian 16", files: { linux: "g16" }, ...d }] })?.installed;
    expect(g16({ path: ["/usr/bin"] })).toEqual([]);
    expect(g16({ path: ["{folder}/../.."] })).toEqual([]);
    expect(g16({ env: { PATH: "{folder}" } })).toEqual([]);
    expect(g16({ env: { ld_preload: "{folder}" } })).toEqual([]);
    expect(g16({ env: { OMP_NUM_THREADS: "{folder}" } })).toEqual([]);
    expect(g16({ env: { HOME: "/root" } })).toEqual([]);
    expect(acceptManifest(steps)?.installed).toEqual([]);
    // (Gaussian's, as Meno carries it)
    expect(MANIFESTS.find((m) => m.id === "gaussian")?.installed[0]).toMatchObject({ name: "g16", path: ["{folder}"], env: { g16root: ["{parent}"], GAUSS_EXEDIR: ["{folder}"] } });
  });

  it("runs nothing where it says no environment: then it brings data alone - and a plugin that does nothing is none", () => {
    const data = { ...good, environment: undefined };
    expect(acceptManifest(data)).toBeNull();
    const guide = [{ title: "Welcome", text: "Double-click on empty space." }];
    expect(acceptManifest({ ...data, guide })).toMatchObject({ reads: [], writes: [], roles: [], steps: [], guide });
    expect(acceptManifest({ ...data, roles: [{ role: "smiles" }], steps: [{ kinds: ["energy"], programs: ["x"] }] })).toBeNull();
    expect(acceptManifest({ ...good, reads: [], kinds: [], roles: [], writes: [] })).toBeNull();
  });

  it("is none where it cannot be used: no id, no version, an environment Meno does not make", () => {
    expect(acceptManifest({ ...good, id: "Not An Id" })).toBeNull();
    expect(acceptManifest({ ...good, id: "x".repeat(41) })).toBeNull();
    expect(acceptManifest({ ...good, version: "" })).toBeNull();
    expect(acceptManifest({ ...good, environment: "conda" })).toBeNull();
    expect(acceptManifest({ ...good, environment: { maker: "uv", lock: "requirements.lock" } })).toBeNull();
    expect(acceptManifest({ ...good, environment: "pixi" })).not.toBeNull();
    expect(acceptManifest({ ...good, reads: [] })).toBeNull();
    expect(acceptManifest("nbo")).toBeNull();
  });

  it("brings no kind to read that cannot be told - a mark too short to tell anything, a pattern, no mark and no asking", () => {
    const kinds = (k: Record<string, unknown>) => acceptManifest({ ...good, reads: ["nbo-47"], kinds: [{ ...good.kinds[0], ...k }] })?.reads ?? [];
    expect(kinds({ marks: [{ text: "N" }] })).toEqual([]);
    expect(kinds({ marks: [/GENNBO/] })).toEqual([]);
    expect(kinds({ marks: [] })).toEqual([]);
    // (told by asking its plugin: by its files' names first)
    expect(kinds({ marks: [], probe: true })).toEqual(["nbo-47"]);
    expect(kinds({ marks: [], extensions: [], probe: true })).toEqual([]);
    // (a kind many programs write names no one program)
    const { program: _, ...anyProgram } = good.kinds[0];
    expect(acceptManifest({ ...good, kinds: [anyProgram] })?.kinds).toEqual([anyProgram]);
  });

  it("may bring a guide: steps of plain text, each pointing at a part Meno names and waiting for what Meno names", () => {
    const steps = [
      { title: "Welcome", text: "Double-click on empty space.", at: "page", until: "quick-add" },
      { title: "Odd", text: "Points at what Meno does not name.", at: "#save-button", until: "clicked" },
      { title: "Plugins", text: "These are a good start.", suggest: ["rdkit", "Not An Id", "cclib"] },
      { title: "", text: "No title." },
      { title: "Long", text: "x".repeat(301) },
    ];
    expect(acceptManifest({ ...good, guide: steps })?.guide).toEqual([
      { title: "Welcome", text: "Double-click on empty space.", at: "page", until: "quick-add" },
      { title: "Odd", text: "Points at what Meno does not name." },
      { title: "Plugins", text: "These are a good start.", suggest: ["rdkit", "cclib"] },
    ]);
    expect(acceptManifest({ ...good, guide: Array.from({ length: 20 }, (_, i) => ({ title: `Step ${i}`, text: "Go on." })) })?.guide).toHaveLength(12);
  });

  it("may bring a catalogue: the plugins it suggests, and kinds of file told by its own marks with the plugins it suggests for each", () => {
    const suggests = [{ plugin: "cclib", for: "Reads outputs" }, { plugin: "cclib", for: "Again" }, { plugin: "nbo", for: "Itself" }, { plugin: "pyscf" }];
    const files = [
      { id: "orca", name: "ORCA output", extensions: [".out"], marks: [{ text: "O   R   C   A", anyCase: true }], suggest: ["cclib", "pyscf"] },
      { id: "short", name: "Short", extensions: [".s"], marks: [{ text: "S" }], suggest: ["cclib"] },
      { id: "nobody", name: "Nobody", extensions: [".n"], marks: [{ text: "N O B O D Y" }], suggest: [] },
    ];
    const read = acceptManifest({ ...good, suggests, files })!;
    expect(read.suggests).toEqual([{ plugin: "cclib", for: "Reads outputs" }]);
    expect(read.files).toEqual([{ id: "orca", name: "ORCA output", extensions: [".out"], marks: [{ text: "O   R   C   A", anyCase: true }], suggest: ["cclib", "pyscf"] }]);
  });
});

describe("a mark", () => {
  it("is text a file's start holds, runs of spaces one, anywhere or at a line's start, in its case or any", () => {
    const head = folded("title\n   * O   R   C   A *\n [Molden Format]\n");
    expect(holdsMark(head, { text: "* O R C A *" })).toBe(true);
    expect(holdsMark(head, { text: "*  O  R  C  A  *" })).toBe(true);
    expect(holdsMark(head, { text: "O R C A", at: "line-start" })).toBe(false);
    expect(holdsMark(head, { text: "[molden format]", at: "line-start" })).toBe(false);
    expect(holdsMark(head, { text: "[molden format]", at: "line-start", anyCase: true })).toBe(true);
  });

  it("is found where it first comes in the file: a program's banner before another's it quotes", () => {
    const head = folded("title\n   * O   R   C   A *\n [Molden Format]\n");
    expect(markAt(head, { text: "* O R C A *" })).toBe(head.indexOf("*"));
    expect(markAt(head, { text: "[Molden Format]", at: "line-start" })).toBe(head.indexOf(" [Molden"));
    expect(markAt(head, { text: "NWChem" })).toBe(-1);
  });
});
