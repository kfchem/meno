import { describe, expect, it } from "vitest";
import { acceptManifest, folded, holdsMark, markAt, xyzStepsFile } from "./manifest";
import { MANIFESTS } from "./known";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const good = {
  id: "nbo",
  name: "NBO",
  version: "7.0",
  uses: [],
  description: "Natural bond orbitals.",
  licence: "Commercial",
  homepage: "https://nbo7.chem.wisc.edu",
  environment: "uv",
  kinds: [{ id: "nbo-47", name: "NBO input", program: "NBO", extensions: [".47"], marks: [{ text: "$GENNBO", at: "line-start" }], lines: [] }],
  reads: ["gaussian", "nbo-47"],
  writes: [],
  roles: [],
  xyzEnergies: [],
  xyzSteps: [],
  steps: [],
  systems: [],
  installed: [],
  downloads: [],
};

describe("a plugin's manifest", () => {
  it("is read as data: what it is, what makes its environment, the kinds of file it knows and those it reads", () => {
    expect(acceptManifest(good)).toEqual(good);
    // (what it does not say, it has none of)
    const { uses: _uses, writes: _w, xyzEnergies: _x, xyzSteps: _xs, roles: _r, steps: _s, systems: _y, installed: _i, downloads: _d, ...said } = good;
    expect(acceptManifest(said)).toEqual(good);
    // (how a program writes an XYZ frame's energy: a pattern with one capture group and a unit; what is not that is left out)
    const declared = acceptManifest({
      ...good,
      xyzEnergies: [
        { id: "one", pattern: "energy:\\s*(-?\\d+\\.\\d+)", unit: "eV" },
        { id: "two", pattern: "no group here", unit: "hartree" },
        { id: "three", pattern: "(a)(b)" },
        { id: "Bad Id", pattern: "(\\d+)" },
        { id: "four", pattern: "([unclosed" },
        { id: "five", pattern: "^(\\d+)", unit: "furlongs" },
      ],
    })?.xyzEnergies;
    expect(declared).toEqual([
      { id: "one", pattern: "energy:\\s*(-?\\d+\\.\\d+)", unit: "eV" },
      { id: "five", pattern: "^(\\d+)", unit: "hartree" },
    ]);
    // (an XYZ file of an optimisation's steps: an id and a file's name, `*` any run; what is not that is left out)
    const steps = acceptManifest({
      ...good,
      xyzSteps: [
        { id: "opt", file: "xtbopt.log", comment: "^\\s*energy:\\s*-?\\d+\\.\\d+\\s+gnorm:" },
        { id: "trj", file: "*_trj.xyz" },
        { id: "said", comment: "^Coordinates from \\S+ E\\s" },
        { id: "path", file: "../x.xyz" },
        { id: "any", file: "*" },
        { id: "broken", comment: "([unclosed" },
        { id: "Bad", file: "a.xyz" },
        { id: "none" },
      ],
    })!.xyzSteps;
    expect(steps.map((d) => d.id)).toEqual(["opt", "trj", "said"]);
    const known = (name: string, comments: string[] = []) => steps.some((d) => xyzStepsFile(name, comments, d));
    expect(["opt_trj.xyz", "A_TRJ.XYZ", "opt.xyz", "opt_trj.xyz.bak", "xtbopt.log", "xtbopt.xyz", "xtboptXlog"].map((n) => known(n))).toEqual([true, true, false, false, true, false, false]);
    // (by what each frame's comment line says, whatever its name; one frame, or one line otherwise, not)
    expect(known("opt.log", [" energy: -5.06 gnorm: 0.06", " energy: -5.07 gnorm: 0.0003"])).toBe(true);
    expect(known("opt.log", [" energy: -5.06 gnorm: 0.06"])).toBe(false);
    expect(known("opt.log", [" energy: -5.06 gnorm: 0.06", "  -5.07"])).toBe(false);
    expect(known("x.xyz", ["Coordinates from job E -1", "Coordinates from job E -2"])).toBe(true);
    // (what it uses: a name and a version each, once; what is not that left out)
    expect(acceptManifest({ ...good, uses: [{ name: "NBO", version: "7.0.9" }, { name: "NBO", version: "8" }, { name: "x" }, "y", { name: "", version: "1" }] })?.uses).toEqual([{ name: "NBO", version: "7.0.9" }]);
    // (each plugin Meno carries, from its folder: Meno names none of them)
    expect(MANIFESTS.map((m) => m.id)).toEqual(["blender", "cclib", "crem", "crest", "gaussian", "molnextr", "molscribe", "multiwfn", "nciplot", "orca", "pyscf", "rdkit", "reinvent", "wfx", "xtb"]);
    // (each saying what it does: a description too long is none)
    expect(MANIFESTS.filter((m) => !m.description).map((m) => m.id)).toEqual([]);
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
    expect(orca.kinds.map((k) => [k.id, k.lines])).toEqual([["orca-input", ["!", "%", "*"]], ["orca", []]]);
    // (and ORCA's output, which its program writes: the kind it reads)
    expect(orca.reads).toEqual(["orca"]);
    expect(orca.kinds.find((k) => k.id === "orca")?.writtenBy).toBe("orca");
  });

  it("says which of its own programs writes a kind it reads - one its steps run, by name - and no other", () => {
    const output = { id: "nbo-out", name: "NBO output", program: "NBO", extensions: [".out"], marks: [{ text: "N A T U R A L   A T O M I C" }] };
    const runs = (writtenBy: unknown, steps: unknown[] = [{ kinds: ["energy"], programs: ["nbo"] }]) =>
      acceptManifest({ ...good, kinds: [{ ...output, writtenBy }], reads: ["nbo-out"], steps })!.kinds[0].writtenBy;
    expect(runs("nbo")).toBe("nbo");
    // (a program it does not run - another plugin's, or none of its steps' - is not its own: unsaid)
    expect(runs("orca")).toBeUndefined();
    expect(runs("nbo", [])).toBeUndefined();
    // (a name, never a path)
    expect(runs("../bin/nbo", [{ kinds: ["energy"], programs: ["../bin/nbo"] }])).toBeUndefined();
    expect(runs(3)).toBeUndefined();
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
      { role: "conformers", programs: [], options: [{ id: "count", label: "Conformers sought", type: "number", default: 30, min: 1 }] },
      { role: "smiles", programs: [], options: [] },
    ]);
    // (a role it does by running a program: the program by name - never a path - each once)
    const render = [{ role: "render", programs: ["blender", "../bin/sh", "/usr/bin/blender", "blender"] }];
    expect(acceptManifest({ ...good, reads: [], kinds: [], roles: render })?.roles).toEqual([{ role: "render", programs: ["blender"], options: [] }]);
    // (looks, each declared in full: an id, a label, parts from Meno's vocabulary or own; the canvas's look is Meno's and not declarable; what is not understood left out)
    const looks = [
      { id: "jelly", label: "Jelly", description: "See-through.", own: true, seeThrough: true, parts: { sticks: "stopped", molecules: "not-a-material", band: 5, shading: "toon" } },
      { id: "meno", label: "Not allowed" },
      { id: "No Id", label: "Bad id" },
      { id: "plain" },
      { id: "jelly", label: "Twice" },
    ];
    const declared = acceptManifest({ ...good, reads: [], kinds: [], roles: [{ role: "render", programs: [], looks }] })?.roles[0].looks;
    expect(declared).toEqual([{ id: "jelly", label: "Jelly", description: "See-through.", parts: { shading: "toon", sticks: "stopped" }, own: true, seeThrough: true }]);
    // (motions, each declared in full: an id - none of Meno's own -, a label, a description; what is not understood left out)
    const motions = [{ id: "ripple", label: "Ripple", description: "A ripple." }, { id: "turn", label: "Meno's own" }, { id: "No Id", label: "Bad" }, { id: "plain" }, { id: "ripple", label: "Twice" }];
    expect(acceptManifest({ ...good, reads: [], kinds: [], roles: [{ role: "render", programs: [], motions }] })?.roles[0].motions).toEqual([{ id: "ripple", label: "Ripple", description: "A ripple." }]);
    // (how short each can be, in seconds - a whole film's, a Loop's, each change's - what is not a number of seconds left out; and
    // the choices each is always made with, each an id, a value and why)
    const timed = [
      { id: "melt", label: "Melt", shortest: { film: 2, change: 6, loop: "long" }, fixed: [{ id: "engine", value: "cycles", why: "Light traced" }, { id: "engine", value: "eevee", why: "Twice" }, { id: "x", value: "y" }] },
      { id: "spin", label: "Spin", shortest: { film: -1, change: 9999 } },
    ];
    const role = acceptManifest({ ...good, reads: [], kinds: [], roles: [{ role: "render", programs: [], motions: timed }] })?.roles[0];
    expect(role?.motions).toEqual([{ id: "melt", label: "Melt", shortest: { film: 2, change: 6 }, fixed: [{ id: "engine", value: "cycles", why: "Light traced" }] }, { id: "spin", label: "Spin" }]);
    // (the confidence below which a model's reading is unsure, and on what it was set - only where the role takes one, between 0 and 1, its basis said)
    const unsure = (u: unknown, role = "pictures") => acceptManifest({ ...good, reads: [], kinds: [], roles: [{ role, unsure: u }] })?.roles[0].unsure;
    expect(unsure({ below: 0.6, basis: " Set on pictures drawn for it. " })).toEqual({ below: 0.6, basis: "Set on pictures drawn for it." });
    for (const u of [{ below: 0.6 }, { below: 0.6, basis: " " }, { below: 1, basis: "b" }, { below: 0, basis: "b" }, { below: "0.6", basis: "b" }, 0.6]) expect(unsure(u)).toBeUndefined();
    expect(unsure({ below: 0.6, basis: "b" }, "smiles")).toBeUndefined();
    // (RDKit's, as it carries them)
    const rdkit = MANIFESTS.find((m) => m.id === "rdkit")!;
    expect(rdkit.roles.map((r) => r.role)).toEqual(["smiles", "checks", "stereoisomers", "configurations", "conformers", "drawing"]);
    expect(rdkit.roles.find((r) => r.role === "conformers")?.options.map((o) => o.id)).toEqual(["sought", "count", "field", "iters", "seed"]);
    // (how many are sought is the molecule's to say unless a number is asked for: the number is shown only then)
    expect(rdkit.roles.find((r) => r.role === "conformers")?.options.find((o) => o.id === "count")?.when).toEqual({ id: "sought", in: ["fixed"] });
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
        { kinds: ["conformers"], takes: ["molecules", "drawings", "conformers", "chart"] },
        // (Meno's judgements - which are the same, which kept, how many, how weighted - never a plugin's: the plugin
        //  boundary, 2026-10-31. A plugin fills only kinds that run its program)
        { kinds: ["duplicates"], takes: [] },
        { kinds: ["energy-window", "filter", "rank", "choose"], takes: ["table", "number"] },
        { kinds: ["populations", "ensemble", "barrier", "as-conformers"] },
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
    ]);
    // (xTB's and ORCA's, as Meno carries them)
    const xtb = MANIFESTS.find((m) => m.id === "xtb")!;
    expect(xtb.steps.map((d) => [d.kind, d.programs, d.options.map((o) => o.id)])).toEqual([
      ["optimise", ["xtb"], ["method", "solvent", "level"]],
      ["energy", ["xtb"], ["method", "solvent"]],
      ["frequencies", ["xtb"], ["method", "solvent"]],
    ]);
    const orca = MANIFESTS.find((m) => m.id === "orca")!;
    expect(orca.steps.map((d) => d.kind)).toEqual(["optimise", "energy", "frequencies", "path-search", "reaction-path", "saddle-point"]);
    // (the kinds of file a step takes besides, by their ids - each once, never what is no id)
    const nci = acceptManifest({ ...good, reads: [], kinds: [], steps: [{ kinds: ["nci"], programs: ["multiwfn"], files: ["molden", "gaussian-fchk", "molden", "Not An Id", 3, "../x"] }] });
    expect(nci?.steps).toEqual([{ kind: "nci", programs: ["multiwfn"], options: [], files: ["molden", "gaussian-fchk"] }]);
  });

  it("may declare its program's energy lines and tables of atoms as papers quote them - each as it must be, or left out", () => {
    const energy = { id: "scf", pattern: "^\\s*SCF Done:\\s*E\\((?<method>[^)]+)\\)\\s*=\\s*(?<value>-?\\d+\\.\\d+)", name: "E", unit: "hartree" };
    const table = { id: "orientation", headings: ["Standard orientation:"], heads: ["Center Atomic"], columns: ["centre", "atomic-number", "type", "x", "y", "z"] };
    const read = acceptManifest({ ...good, quotedEnergies: [energy, { ...energy, id: "no-value", pattern: "E = (-?\\d+\\.\\d+)" }, { ...energy, id: "unnamed", name: " " }, { ...energy, id: "broken", pattern: "(?<value>" }], quotedTables: [table, { ...table, id: "no-z", columns: ["element", "x", "y"] }, { ...table, id: "twice", columns: ["element", "x", "x", "y", "z"] }, { ...table, id: "both", columns: ["element", "atomic-number", "x", "y", "z"] }, { ...table, id: "unheaded", headings: [] }, { ...table, id: "odd", columns: ["element", "x", "y", "z", "mass"] }] })!;
    expect(read.quotedEnergies).toEqual([energy]);
    expect(read.quotedTables).toEqual([table]);
    // (none said: none, as a plugin that quotes no line of its program's)
    expect(acceptManifest(good)!.quotedEnergies).toBeUndefined();
    // (Gaussian's and ORCA's, as Meno carries them)
    expect(MANIFESTS.filter((m) => m.quotedEnergies || m.quotedTables).map((m) => [m.id, (m.quotedEnergies ?? []).map((q) => q.id), (m.quotedTables ?? []).map((t) => t.id)])).toEqual([
      ["gaussian", ["scf-done"], ["orientation"]],
      ["orca", ["final-single-point"], []],
    ]);
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

  it("may declare the plugins it uses - each by id, with the versions it works with and the programs of it its jobs may run - all as they must be, or the plugin is none", () => {
    const steps = { ...good, reads: [], kinds: [], steps: [{ kinds: ["energy"], programs: ["orca"] }] };
    const uses = { plugin: "xtb", versions: ">=0.1.4 <0.2.0", programs: [{ program: "xtb", env: "XTBEXE" }] };
    expect(acceptManifest({ ...steps, depends: [uses] })?.depends).toEqual([{ ...uses, range: { from: "0.1.4", before: "0.2.0" } }]);
    expect(acceptManifest(steps)?.depends).toBeUndefined();
    // (one used only for some of its work)
    expect(acceptManifest({ ...steps, depends: [{ ...uses, optional: true }] })?.depends?.[0].optional).toBe(true);
    expect(acceptManifest({ ...steps, depends: [{ ...uses, optional: false }] })?.depends?.[0].optional).toBeUndefined();
    // (one used for no program: its presence and version alone)
    expect(acceptManifest({ ...steps, depends: [{ plugin: "xtb", versions: ">=1.0.0" }] })?.depends?.[0].programs).toEqual([]);
    // (itself, versions not as they must be, a shell, a path, a variable that finds programs, one plugin twice, one variable twice: no plugin)
    const program = (p: object) => ({ ...uses, programs: [{ ...uses.programs[0], ...p }] });
    for (const bad of [
      [{ ...uses, plugin: good.id }],
      [{ ...uses, versions: "^0.1.4" }],
      [{ ...uses, versions: undefined }],
      [program({ program: "sh" })],
      [program({ program: "bin/xtb" })],
      [program({ env: "PATH" })],
      [program({ env: "1X" })],
      [uses, { ...uses, programs: [] }],
      [uses, { plugin: "other", versions: ">=1.0.0", programs: [{ program: "tool", env: "XTBEXE" }] }],
      [{ ...uses, optional: "yes" }],
      "xtb",
    ])
      expect(acceptManifest({ ...steps, depends: bad }), JSON.stringify(bad)).toBeNull();
    // (ORCA's, as Meno carries it: the xTB plugin's xtb, in XTBEXE - for its xTB methods alone)
    expect(MANIFESTS.find((m) => m.id === "orca")?.depends?.map((d) => [d.plugin, d.versions, d.programs, d.optional])).toEqual([["xtb", ">=0.1.4 <0.2.0", [{ program: "xtb", env: "XTBEXE" }], true]]);
  });

  it("may declare interfaces for other plugins to use it through, and use another's - each by id with its version or versions - all as they must be, or the plugin is none", () => {
    const steps = { ...good, reads: [], kinds: [], steps: [{ kinds: ["energy"], programs: ["orca"] }] };
    expect(acceptManifest({ ...steps, interfaces: [{ id: "styling", version: "1.2.0" }] })?.interfaces).toEqual([{ id: "styling", version: "1.2.0" }]);
    expect(acceptManifest(steps)?.interfaces).toBeUndefined();
    const through = { plugin: "tool", versions: ">=1.0.0", interfaces: [{ id: "styling", versions: ">=1.0.0 <2.0.0" }] };
    expect(acceptManifest({ ...steps, depends: [through] })?.depends?.[0].interfaces).toEqual([{ id: "styling", versions: ">=1.0.0 <2.0.0", range: { from: "1.0.0", before: "2.0.0" } }]);
    for (const bad of [
      { interfaces: [{ id: "styling", version: "1.2" }] },
      { interfaces: [{ id: "Styling", version: "1.2.0" }] },
      { interfaces: [{ id: "styling", version: "1.0.0" }, { id: "styling", version: "2.0.0" }] },
      { interfaces: { id: "styling", version: "1.0.0" } },
      { depends: [{ ...through, interfaces: [{ id: "styling", versions: "^1.0.0" }] }] },
      { depends: [{ ...through, interfaces: [through.interfaces[0], through.interfaces[0]] }] },
      { depends: [{ ...through, interfaces: "styling" }] },
    ])
      expect(acceptManifest({ ...steps, ...bad }), JSON.stringify(bad)).toBeNull();
  });

  it("may bring another plugin presets through that one's interface - running nothing itself - each as a render role declares its own, with a file in its folder", () => {
    const presets = {
      interface: "styling",
      looks: [{ id: "chalk", label: "Chalk", description: "Dusty.", parts: { molecules: "matte" }, file: "look_chalk.py" }],
      studios: [{ id: "attic", label: "Attic", file: "attic.py" }],
      motions: [{ id: "wobble", label: "Wobble", shortest: { film: 3 }, file: "wobble.py" }],
      files: ["shared.py"],
      options: [{ id: "grain", label: "Grain", type: "choice", choices: [{ value: "fine", label: "Fine" }], default: "fine", section: "look", when: { id: "look", in: ["chalk"] } }],
    };
    const preset = { id: "tool-looks", name: "Tool looks", version: "1.0.0", depends: [{ plugin: "tool", versions: ">=1.0.0 <2.0.0", interfaces: [{ id: "styling", versions: ">=1.0.0 <2.0.0" }] }], presets };
    const read = acceptManifest(preset);
    expect(read?.environment).toBeUndefined();
    expect(read?.presets).toEqual({
      interface: "styling",
      for: "tool",
      looks: [{ id: "chalk", label: "Chalk", description: "Dusty.", parts: { molecules: "matte" }, file: "look_chalk.py" }],
      studios: [{ id: "attic", label: "Attic", file: "attic.py" }],
      motions: [{ id: "wobble", label: "Wobble", shortest: { film: 3 }, file: "wobble.py" }],
      files: ["shared.py"],
      options: [expect.objectContaining({ id: "grain", section: "look", when: { id: "look", in: ["chalk"] } })],
    });
    // (one with its looks alone; and a plugin that brings nothing and does nothing is none)
    expect(acceptManifest({ ...preset, presets: { interface: "styling", looks: presets.looks } })?.presets?.studios).toEqual([]);
    expect(acceptManifest({ ...preset, presets: undefined })).toBeNull();
    // (through an interface it does not use, an item without a file or one not as it must be, a file outside its folder, the plain studio's id, nothing at all, too many files: none)
    const many = Array.from({ length: 64 }, (_, i) => `f${i}.py`);
    for (const bad of [
      { interface: "other" },
      { looks: [{ id: "chalk", label: "Chalk" }] },
      { looks: [...presets.looks, { id: "Bad Id", label: "Bad", file: "bad.py" }] },
      { looks: [{ ...presets.looks[0], file: "../tool/manifest.json" }] },
      { looks: [{ ...presets.looks[0], file: "/etc/hosts" }] },
      { files: ["manifest.json"] },
      { files: ["Manifest.JSON"] },
      { files: ["Worker.py"] },
      { files: ["looks/chalk.py"] },
      { files: ["shared.py", "shared.py"] },
      { studios: [{ id: "asked", label: "As asked", file: "asked.py" }] },
      { looks: [], studios: [], motions: [] },
      { files: many },
    ])
      expect(acceptManifest({ ...preset, presets: { ...presets, ...bad } }), JSON.stringify(bad).slice(0, 80)).toBeNull();
    expect(acceptManifest({ ...preset, depends: [{ plugin: "tool", versions: ">=1.0.0" }] })).toBeNull();
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
      { name: "orca", label: "ORCA", files: { macos: "orca", windows: "orca.exe", linux: "orca" }, path: ["{folder}"], env: {}, places: {} },
      { name: "g16", label: "Gaussian 16", files: { linux: "g16" }, path: ["{folder}", "{parent}/bsd"], env: { g16root: ["{parent}"], GAUSS_EXEDIR: ["{folder}", "{folder}/bsd"] }, places: {} },
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
    // the places it is usually installed in, on each system: from /, {home} or {programs}, a * in a folder's name - the backend's rule
    const usual = { macos: ["/Applications/G16.app/Contents/MacOS", "{home}/Applications/G16.app/Contents/MacOS"], windows: ["{programs}/Gaussian */bin"] };
    expect(g16({ files: { linux: "g16", macos: "g16" }, places: usual })?.[0].places).toEqual(usual);
    for (const bad of ["Applications/g16", "/a/../b", "{home}g16", "{folder}/g16", "/a/**/b", "/a/{home}", "C:\\g16"]) expect(g16({ places: { linux: [bad] } })).toEqual([]);
    // never a shell, an interpreter that takes code, or Python, whatever its case or ending: left out as a path is - the backend's rule (`program_file_ok`)
    for (const bad of ["sh", "bash", "zsh.exe", "cmd.exe", "PowerShell.exe", "pwsh", "env", "perl", "node.exe", "osascript", "python", "python3", "python3.12", "Python.exe", "pythonw.exe"])
      expect(g16({ files: { linux: bad } }), bad).toEqual([]);
    expect(g16({ files: { linux: "g16", windows: "cmd.exe" } })?.[0].files).toEqual({ linux: "g16" });
    // (a name that only begins like one is a program of its own)
    expect(g16({ files: { linux: "shelxl", macos: "envelope" } })?.[0].files).toEqual({ macos: "envelope", linux: "shelxl" });
    // run by a role, not a step: kept too
    const byRole = { ...good, reads: [], kinds: [], roles: [{ role: "render", programs: ["blender"] }], installed: [{ name: "blender", label: "Blender", files: { macos: "Blender" } }] };
    expect(acceptManifest(byRole)?.installed.map((d) => d.name)).toEqual(["blender"]);
    // (Gaussian's, as Meno carries it)
    expect(MANIFESTS.find((m) => m.id === "gaussian")?.installed[0]).toMatchObject({ name: "g16", path: ["{folder}"], env: { g16root: ["{parent}"], GAUSS_EXEDIR: ["{folder}"] } });
  });

  it("may say the programs installed beside one installed separately, that a job may run after it - as the backend reads them", () => {
    const orca = (beside: unknown) =>
      acceptManifest({ ...good, reads: [], kinds: [], steps: [{ kinds: ["energy"], programs: ["orca"] }], installed: [{ name: "orca", label: "ORCA", files: { macos: "orca" }, beside }] })?.installed;
    expect(orca({ orca_2mkl: { macos: "orca_2mkl", windows: "orca_2mkl.exe" } })?.[0].beside).toEqual({ orca_2mkl: { macos: "orca_2mkl", windows: "orca_2mkl.exe" } });
    expect(orca(undefined)?.[0]).not.toHaveProperty("beside");
    for (const bad of [{ "../x": { macos: "x" } }, { x: { macos: "../x" } }, { x: { amiga: "x" } }, { x: "x" }, ["x"], { a: {}, b: {}, c: {}, d: {}, e: {} }]) expect(orca(bad)).toEqual([]);
    // (never a shell or Python beside it, as the backend refuses one)
    for (const bad of [{ x: { macos: "sh" } }, { x: { windows: "cmd.exe" } }, { x: { linux: "python3" } }]) expect(orca(bad)).toEqual([]);
    // (ORCA's, as Meno carries it)
    expect(MANIFESTS.find((m) => m.id === "orca")?.installed[0].beside).toEqual({ orca_2mkl: { macos: "orca_2mkl", linux: "orca_2mkl", windows: "orca_2mkl.exe" } });
  });

  it("may say how a program installed separately runs in parallel - as threads, or as processes, each a core - as the backend reads it", () => {
    const orca = (parallel: unknown) =>
      acceptManifest({ ...good, reads: [], kinds: [], steps: [{ kinds: ["energy"], programs: ["orca"] }], installed: [{ name: "orca", label: "ORCA", files: { macos: "orca" }, parallel }] })?.installed;
    expect(orca("processes")?.[0].parallel).toBe("processes");
    expect(orca("threads")?.[0].parallel).toBe("threads");
    expect(orca(undefined)?.[0]).not.toHaveProperty("parallel");
    for (const bad of ["mpi", "Processes", true, 4, null, ["processes"]]) expect(orca(bad)).toEqual([]);
    // (ORCA's, as Meno carries it: as processes - its %pal)
    expect(MANIFESTS.find((m) => m.id === "orca")?.installed[0].parallel).toBe("processes");
  });

  it("may fetch a program it runs, Meno's own copy: an archive for one system, where the program is in it - as the backend takes it", () => {
    const copy = {
      file: "blender-5.2.2-windows-x64.zip",
      name: "Blender 5.2.2 LTS",
      licence: "GPL-3.0-or-later",
      url: "https://download.blender.org/release/Blender5.2/blender-5.2.2-windows-x64.zip",
      sha256: "ab".repeat(32),
      bytes: 404_453_484,
      system: "windows",
      arch: "x86_64",
      unpack: "zip",
      program: "*/blender.exe",
      provides: "blender",
    };
    expect(acceptManifest({ ...good, downloads: [copy] })?.downloads).toEqual([copy]);
    for (const wrong of [
      { unpack: "rar" },
      { unpack: "dmg" },
      { program: "../blender.exe" },
      { program: "C:\\blender.exe" },
      { system: "amiga" },
      { arch: "ppc" },
      { provides: "../blender" },
      { program: undefined },
      { system: undefined },
      { file: "blender.dmg", unpack: "dmg", program: "*/Blender" },
    ])
      expect(acceptManifest({ ...good, downloads: [{ ...copy, ...wrong }] }), JSON.stringify(wrong)).toBeNull();
    // (Blender's, as Meno carries it: the official builds for macOS on Apple silicon and Windows)
    const blender = MANIFESTS.find((m) => m.id === "blender")!;
    expect(blender.installed).toEqual([]);
    expect(blender.downloads.map((d) => [d.system, d.arch, d.unpack, d.provides])).toEqual([
      ["macos", "aarch64", "dmg", "blender"],
      ["windows", "x86_64", "zip", "blender"],
      ["windows", "aarch64", "zip", "blender"],
    ]);
    expect(blender.downloads.every((d) => d.url.startsWith("https://download.blender.org/release/Blender5.2/") && d.url.endsWith(d.file))).toBe(true);
  });

  it("may fetch a data file compressed with gzip, said how large it is unpacked, and how its makers ask to be cited - never a program", () => {
    const db = {
      file: "fragments.db.gz",
      name: "A fragment database",
      licence: "CC BY 4.0",
      url: "https://zenodo.org/api/records/1/files/fragments.db.gz/content",
      sha256: "ab".repeat(32),
      bytes: 281_251_246,
      unpack: "gz",
      unpackedBytes: 2_027_749_376,
      cite: "Polishchuk, J. Cheminform. 2020, 12, 28",
    };
    expect(acceptManifest({ ...good, downloads: [db] })?.downloads).toEqual([db]);
    for (const wrong of [{ unpackedBytes: undefined }, { unpackedBytes: -1 }, { unpackedBytes: 1.5 }, { program: "fragments.db" }, { file: "fragments.db", unpack: undefined }, { cite: 7 }, { file: "fragments.gz.db" }])
      expect(acceptManifest({ ...good, downloads: [{ ...db, ...wrong }] }), JSON.stringify(wrong)).toBeNull();
    // (how large unpacked: said only of one unpacked by Meno)
    const { unpack: _u, unpackedBytes: _b, ...plain } = db;
    expect(acceptManifest({ ...good, downloads: [{ ...plain, file: "fragments.db", unpackedBytes: 5 }] })).toBeNull();
    expect(acceptManifest({ ...good, downloads: [{ ...plain, file: "fragments.db" }] })?.downloads[0].cite).toBe(db.cite);
    // (CReM's, as Meno carries it: its database from Zenodo, and a Generate step that takes seeds)
    const crem = MANIFESTS.find((m) => m.id === "crem")!;
    expect(crem.downloads.map((d) => [d.file, d.unpack, d.licence, d.bytes, d.unpackedBytes])).toEqual([["chembl33_sa2_f5.db.gz", "gz", "CC BY 4.0", 281_251_246, 2_027_749_376]]);
    expect(crem.downloads[0].url).toBe("https://zenodo.org/api/records/16909329/files/chembl33_sa2_f5.db.gz/content");
    expect(crem.steps).toEqual([expect.objectContaining({ kind: "generate", seeds: true })]);
    expect(MANIFESTS.find((m) => m.id === "reinvent")!.steps[0].seeds).toBeUndefined();
  });

  it("may need files downloaded besides its environment: each as it must be - HTTPS, its hash and size, a name not a path - or the plugin is none", () => {
    const weights = { file: "model.pth", name: "Its trained model", licence: "MIT", url: "https://huggingface.co/a/b/resolve/0123abc/model.pth", sha256: "ab".repeat(32), bytes: 1_134_173_494 };
    expect(acceptManifest({ ...good, downloads: [weights] })?.downloads).toEqual([weights]);
    for (const wrong of [
      { file: "../model.pth" },
      { file: "Model.pth" },
      { file: "model.pth.part" },
      { url: "http://huggingface.co/model.pth" },
      { url: "https://user@host/model.pth" },
      { url: "https://host/a model.pth" },
      { sha256: "AB".repeat(32) },
      { sha256: "ab" },
      { bytes: 0 },
      { bytes: 1.5 },
      { bytes: 3e10 },
      { name: "" },
      { licence: undefined },
    ])
      expect(acceptManifest({ ...good, downloads: [{ ...weights, ...wrong }] }), JSON.stringify(wrong)).toBeNull();
    expect(acceptManifest({ ...good, downloads: [weights, weights] })).toBeNull();
    expect(acceptManifest({ ...good, downloads: weights })).toBeNull();
    // (a plugin that runs nothing uses none)
    const { environment: _e, reads: _r, kinds: _k, ...data } = good;
    const coloured = [{ id: "nbo-in", name: "NBO input", extensions: [".nbo"], grammar: { file: "nbo.grammar", tones: { Word: "keyword" } } }];
    expect(acceptManifest({ ...data, kinds: coloured, downloads: [weights] })?.downloads).toEqual([]);
  });

  it("may say how a program installed separately says its version, and the least Meno takes - as the backend reads it", () => {
    const blender = (version: unknown) =>
      acceptManifest({ ...good, reads: [], kinds: [], roles: [{ role: "render", programs: ["blender"] }], installed: [{ name: "blender", label: "Blender", files: { macos: "Blender" }, version }] })?.installed;
    const rule = { args: ["--version"], after: "Blender ", least: "5.0" };
    expect(blender(rule)?.[0].version).toEqual(rule);
    expect(blender(undefined)?.[0]).not.toHaveProperty("version");
    // (options alone - never a file or a path - text to find, a version: else none of it)
    for (const bad of [{ ...rule, args: [] }, { ...rule, args: ["/tmp/x"] }, { ...rule, args: ["--version", "file"] }, { ...rule, after: "" }, { ...rule, after: "a\nb" }, { ...rule, least: "5.x" }, { ...rule, least: "" }, "5.0"])
      expect(blender(bad)).toEqual([]);
  });

  it("runs nothing where it says no environment: then it brings texts it colours alone - and a plugin that does nothing is none", () => {
    const data = { ...good, environment: undefined };
    expect(acceptManifest(data)).toBeNull();
    const coloured = [{ id: "nbo-in", name: "NBO input", extensions: [".nbo"], grammar: { file: "nbo.grammar", tones: { Word: "keyword" } } }];
    expect(acceptManifest({ ...data, kinds: coloured })).toMatchObject({ reads: [], writes: [], roles: [], steps: [] });
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

  it("brings no guide and names no other plugin: a guide, plugins suggested and a catalogue of files are not read - and are no plugin alone", () => {
    const extra = { guide: [{ title: "Welcome", text: "Hi." }], suggests: [{ plugin: "cclib", for: "Reads outputs" }], files: [{ id: "orca", name: "ORCA output", extensions: [".out"], marks: [{ text: "O   R   C   A" }], suggest: ["cclib"] }] };
    const read = acceptManifest({ ...good, ...extra })!;
    expect(Object.keys(read)).not.toContain("guide");
    expect(Object.keys(read)).not.toContain("suggests");
    expect(Object.keys(read)).not.toContain("files");
    expect(acceptManifest({ id: "only-words", name: "Only words", version: "1", ...extra })).toBeNull();
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

// (a bundled plugin whose manifest does not read is none: never left to vanish unsaid)
describe("the plugins Meno carries", () => {
  const root = join(__dirname, "../../../src-tauri/resources/plugins");
  const folders = readdirSync(root).filter((f) => statSync(join(root, f)).isDirectory());

  it("each read, by its folder's name - none of them refused", () => {
    expect(MANIFESTS.map((m) => m.id)).toEqual([...folders].sort((a, b) => a.localeCompare(b)));
  });

  it("each with every file its presets name there, in its folder itself - what Meno carries of it", () => {
    for (const m of MANIFESTS.filter((x) => x.presets)) {
      const p = m.presets!;
      for (const f of [...p.looks, ...p.studios, ...p.motions].map((x) => x.file).concat(p.files)) expect(existsSync(join(root, m.id, f)), `${m.id}: ${f}`).toBe(true);
    }
  });
});
