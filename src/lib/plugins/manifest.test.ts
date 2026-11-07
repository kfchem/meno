import { describe, expect, it } from "vitest";
import { acceptManifest, CONTRACTS, folded, holdsMark, markAt, xyzStepsFile } from "./manifest";
import { MANIFESTS } from "./known";

const good = {
  id: "bondorb",
  name: "Bondorb",
  version: "7.0",
  contract: 1,
  uses: [],
  description: "Bond orbitals, made up.",
  licence: "Commercial",
  homepage: "https://example.org/bondorb",
  environment: "uv",
  kinds: [{ id: "bondorb-47", name: "Bondorb input", program: "Bondorb", extensions: [".47"], marks: [{ text: "$BONDORB", at: "line-start" }], lines: [] }],
  reads: ["orbitron", "bondorb-47"],
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
  it("is written to a plugin contract this Meno speaks: unsaid, the first; another, or none Meno takes, refused", () => {
    expect(CONTRACTS).toEqual([1]);
    expect(acceptManifest({ ...good, contract: undefined })?.contract).toBe(1);
    expect(acceptManifest({ ...good, contract: 1 })?.contract).toBe(1);
    for (const contract of [2, 0, "1", null, 1.5]) expect(acceptManifest({ ...good, contract }), String(contract)).toBeNull();
  });

  it("is read as data: what it is, what makes its environment, the kinds of file it knows and those it reads", () => {
    expect(acceptManifest(good)).toEqual(good);
    // (what it does not say, it has none of)
    const { contract: _c, uses: _uses, writes: _w, xyzEnergies: _x, xyzSteps: _xs, roles: _r, steps: _s, systems: _y, installed: _i, downloads: _d, ...said } = good;
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
        { id: "opt", file: "tbopt.log", comment: "^\\s*energy:\\s*-?\\d+\\.\\d+\\s+gradient:" },
        { id: "trj", file: "*_trj.xyz" },
        { id: "said", comment: "^Quanta step \\S+ E\\s" },
        { id: "path", file: "../x.xyz" },
        { id: "any", file: "*" },
        { id: "broken", comment: "([unclosed" },
        { id: "Bad", file: "a.xyz" },
        { id: "none" },
      ],
    })!.xyzSteps;
    expect(steps.map((d) => d.id)).toEqual(["opt", "trj", "said"]);
    const known = (name: string, comments: string[] = []) => steps.some((d) => xyzStepsFile(name, comments, d));
    expect(["opt_trj.xyz", "A_TRJ.XYZ", "opt.xyz", "opt_trj.xyz.bak", "tbopt.log", "tbopt.xyz", "tboptXlog"].map((n) => known(n))).toEqual([true, true, false, false, true, false, false]);
    // (by what each frame's comment line says, whatever its name; one frame, or one line otherwise, not)
    expect(known("opt.log", [" energy: -5.06 gradient: 0.06", " energy: -5.07 gradient: 0.0003"])).toBe(true);
    expect(known("opt.log", [" energy: -5.06 gradient: 0.06"])).toBe(false);
    expect(known("opt.log", [" energy: -5.06 gradient: 0.06", "  -5.07"])).toBe(false);
    expect(known("x.xyz", ["Quanta step job E -1", "Quanta step job E -2"])).toBe(true);
    // (what it uses: a name and a version each, once; what is not that left out)
    expect(acceptManifest({ ...good, uses: [{ name: "Bondorb", version: "7.0.9" }, { name: "Bondorb", version: "8" }, { name: "x" }, "y", { name: "", version: "1" }] })?.uses).toEqual([{ name: "Bondorb", version: "7.0.9" }]);
    // (each plugin Meno knows of, from its folder: Meno names none of them)
    expect(MANIFESTS.map((m) => m.id)).toEqual(["confsweep", "densitool", "fragswap", "lumen", "lumen-looks", "manyread", "molgen", "ncigrid", "orbitron", "picread", "picread2", "quanta", "sketchkit", "tightbind", "wavecalc"]);
    // (each saying what it does: a description too long is none)
    expect(MANIFESTS.filter((m) => !m.description).map((m) => m.id)).toEqual([]);
  });

  it("knows each kind of file in one list: those it reads told by their marks, those it only colours by their names and lines", () => {
    const kinds = (k: unknown[], reads: string[] = []) => acceptManifest({ ...good, kinds: k, reads })!;
    const coloured = { id: "bondorb-in", name: "Bondorb input", extensions: [".bdo"], lines: ["$", "!", 3], grammar: { file: "bondorb.grammar", tones: { Word: "keyword" } } };
    const read = kinds([coloured], []);
    // (a line's start as short as a letter: it claims no file)
    expect(read.kinds).toEqual([{ id: "bondorb-in", name: "Bondorb input", extensions: [".bdo"], marks: [], lines: ["$", "!"], grammar: { file: "bondorb.grammar", tones: { Word: "keyword" } } }]);
    // (a kind it reads must be told: by a mark, or by asking it)
    expect(kinds([{ ...coloured, grammar: undefined }], ["bondorb-in"])).toBeNull();
    expect(kinds([{ ...coloured, probe: true }], ["bondorb-in"]).reads).toEqual(["bondorb-in"]);
    // (the made-up Quanta's input: a text it colours, told among .qin files by what its lines begin with)
    const quanta = MANIFESTS.find((m) => m.id === "quanta")!;
    expect(quanta.kinds.map((k) => [k.id, k.lines])).toEqual([["quanta-input", ["#", "@"]], ["quanta", []]]);
    // (and Quanta's output, which its program writes: the kind it reads)
    expect(quanta.reads).toEqual(["quanta"]);
    expect(quanta.kinds.find((k) => k.id === "quanta")?.writtenBy).toBe("quanta");
  });

  it("says which of its own programs writes a kind it reads - one its steps run, by name - and no other", () => {
    const output = { id: "bondorb-out", name: "Bondorb output", program: "Bondorb", extensions: [".out"], marks: [{ text: "B O N D O R B   O R B I T A L S" }] };
    const runs = (writtenBy: unknown, steps: unknown[] = [{ kinds: ["energy"], programs: ["bondorb"] }]) =>
      acceptManifest({ ...good, kinds: [{ ...output, writtenBy }], reads: ["bondorb-out"], steps })!.kinds[0].writtenBy;
    expect(runs("bondorb")).toBe("bondorb");
    // (a program it does not run - another plugin's, or none of its steps' - is not its own: unsaid)
    expect(runs("quanta")).toBeUndefined();
    expect(runs("bondorb", [])).toBeUndefined();
    // (a name, never a path)
    expect(runs("../bin/bondorb", [{ kinds: ["energy"], programs: ["../bin/bondorb"] }])).toBeUndefined();
    expect(runs(3)).toBeUndefined();
  });

  it("may write kinds of its own: each one of its kinds, named and with its files' names as the kind says, its options as data", () => {
    const writer = {
      ...good,
      kinds: [
        { id: "bondorb-input", name: "Bondorb input", extensions: [".47", "47", ".NOT/AN/EXT"] },
        { id: "nameless", name: "No extension", extensions: [] },
      ],
      reads: [],
      writes: [
        {
          kind: "bondorb-input",
          options: [
            { id: "charge", label: "Charge", type: "number", default: 0, from: "charge" },
            { id: "bad", label: "Bad", type: "choice", choices: [{ value: "a", label: "A" }], default: "b" },
            { id: "run", label: "Run", type: "code", default: "rm -rf /" },
          ],
        },
        { kind: "bondorb-input" },
        { kind: "nameless" },
        { kind: "someone-elses" },
      ],
    };
    expect(acceptManifest(writer)?.writes).toEqual([{ id: "bondorb-input", name: "Bondorb input", extensions: [".47"], options: [{ id: "charge", label: "Charge", type: "number", default: 0, from: "charge" }] }]);
    // (the plugin online that writes Orbitron's input: read as any would be)
    const orbitron = MANIFESTS.find((m) => m.id === "orbitron")!;
    expect(orbitron.writes.map((w) => [w.id, w.extensions, !!w.grammar])).toEqual([["orbitron-input", [".orb"], true]]);
    expect(orbitron.writes[0].options.map((o) => o.id)).toEqual(["job", "method", "basis", "keywords", "charge", "multiplicity", "title", "checkpoint", "processors", "memory"]);
  });

  it("fills roles, each Meno's, once - with options only where the role takes them", () => {
    const opts = [{ id: "count", label: "Conformers sought", type: "number", default: 30, min: 1 }];
    const roles = [{ role: "conformers", options: opts }, { role: "smiles", options: [{ id: "x", label: "X", type: "switch", default: true }] }, { role: "smiles" }, { role: "Not A Role" }, "checks"];
    expect(acceptManifest({ ...good, reads: [], kinds: [], roles })?.roles).toEqual([
      { role: "conformers", programs: [], options: [{ id: "count", label: "Conformers sought", type: "number", default: 30, min: 1 }] },
      { role: "smiles", programs: [], options: [] },
    ]);
    // (a conformer search that takes how many to try: said on the conformers role alone, as true - Meno sends the number)
    const tries = [{ role: "conformers", tries: true }, { role: "smiles", tries: true }];
    expect(acceptManifest({ ...good, reads: [], kinds: [], roles: tries })?.roles).toEqual([
      { role: "conformers", programs: [], options: [], tries: true },
      { role: "smiles", programs: [], options: [] },
    ]);
    expect(acceptManifest({ ...good, reads: [], kinds: [], roles: [{ role: "conformers", tries: "yes" }] })?.roles).toEqual([{ role: "conformers", programs: [], options: [] }]);
    // (a role it does by running a program: the program by name - never a path - each once)
    const render = [{ role: "render", programs: ["lumen", "../bin/sh", "/usr/bin/lumen", "lumen"] }];
    expect(acceptManifest({ ...good, reads: [], kinds: [], roles: render })?.roles).toEqual([{ role: "render", programs: ["lumen"], options: [] }]);
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
      { id: "melt", label: "Melt", shortest: { film: 2, change: 6, loop: "long" }, fixed: [{ id: "engine", value: "traced", why: "Light traced" }, { id: "engine", value: "fast", why: "Twice" }, { id: "x", value: "y" }] },
      { id: "spin", label: "Spin", shortest: { film: -1, change: 9999 } },
    ];
    const role = acceptManifest({ ...good, reads: [], kinds: [], roles: [{ role: "render", programs: [], motions: timed }] })?.roles[0];
    expect(role?.motions).toEqual([{ id: "melt", label: "Melt", shortest: { film: 2, change: 6 }, fixed: [{ id: "engine", value: "traced", why: "Light traced" }] }, { id: "spin", label: "Spin" }]);
    // (the confidence below which a model's reading is unsure, and on what it was set - only where the role takes one, between 0 and 1, its basis said)
    const unsure = (u: unknown, role = "pictures") => acceptManifest({ ...good, reads: [], kinds: [], roles: [{ role, unsure: u }] })?.roles[0].unsure;
    expect(unsure({ below: 0.6, basis: " Set on pictures drawn for it. " })).toEqual({ below: 0.6, basis: "Set on pictures drawn for it." });
    for (const u of [{ below: 0.6 }, { below: 0.6, basis: " " }, { below: 1, basis: "b" }, { below: 0, basis: "b" }, { below: "0.6", basis: "b" }, 0.6]) expect(unsure(u)).toBeUndefined();
    expect(unsure({ below: 0.6, basis: "b" }, "smiles")).toBeUndefined();
    // (the hosts a model's plugin talks to: each a name exactly, 1 to 8 - the role none without them, and no other role naming any)
    const talks = (hosts: unknown, role = "language-model") => acceptManifest({ ...good, reads: [], kinds: [], roles: [{ role, hosts }] })?.roles[0];
    expect(talks(["api.example.com", "api.example.com", "files.example.com"])?.hosts).toEqual(["api.example.com", "files.example.com"]);
    for (const h of [undefined, [], ["*.example.com"], [".example.com"], ["API.example.com"], ["api.example.com:443"], ["127.0.0.1"], ["localhost"], ["https://api.example.com"], ["-a.example.com"], ["api.example.com", 3], Array.from({ length: 9 }, (_, i) => `h${i}.example.com`), "api.example.com"])
      expect(talks(h), JSON.stringify(h)).toBeUndefined();
    expect(talks(["api.example.com"], "smiles")).toBeUndefined();
    expect(acceptManifest({ ...good, reads: [], kinds: [], roles: [{ role: "smiles" }] })?.roles[0].hosts).toBeUndefined();
    // (Sketchkit's, as it carries them)
    const sketchkit = MANIFESTS.find((m) => m.id === "sketchkit")!;
    expect(sketchkit.roles.map((r) => r.role)).toEqual(["smiles", "checks", "stereoisomers", "configurations", "conformers", "drawing"]);
    // (how many to try is Meno's - the role says its search takes a number, and Meno sends it - the rest the plugin's)
    expect(sketchkit.roles.find((r) => r.role === "conformers")?.options.map((o) => o.id)).toEqual(["field", "iters", "seed"]);
    expect(sketchkit.roles.find((r) => r.role === "conformers")?.tries).toBe(true);
  });

  it("fills kinds of step: several in one with what they share, each Meno's and once, its programs by name - never a path - its options as data", () => {
    const level = { id: "level", label: "Level", type: "choice", choices: [{ value: "tight", label: "Tight" }], default: "tight" };
    const steps = {
      ...good,
      reads: [],
      kinds: [],
      steps: [
        { kinds: ["optimise", "energy"], programs: ["tightbind", "../bin/sh", "/usr/bin/tightbind", "tightbind"], options: [level] },
        { kinds: ["optimise"], programs: ["other"] },
        { kinds: ["Not A Kind", "frequencies"], programs: ["tightbind"] },
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
      { kind: "optimise", programs: ["tightbind"], options: [lvl] },
      { kind: "energy", programs: ["tightbind"], options: [lvl] },
      { kind: "frequencies", programs: ["tightbind"], options: [] },
      // (what it takes, of what flows: none said, all its kind takes)
      { kind: "conformers", programs: [], options: [], takes: ["molecules", "conformers"] },
    ]);
    // (the made-up Tightbind's and Quanta's)
    const tightbind = MANIFESTS.find((m) => m.id === "tightbind")!;
    expect(tightbind.steps.map((d) => [d.kind, d.programs, d.options.map((o) => o.id)])).toEqual([
      ["optimise", ["tightbind"], ["method", "solvent", "level"]],
      ["energy", ["tightbind"], ["method", "solvent"]],
      ["frequencies", ["tightbind"], ["method", "solvent"]],
    ]);
    const quanta = MANIFESTS.find((m) => m.id === "quanta")!;
    expect(quanta.steps.map((d) => d.kind)).toEqual(["optimise", "energy", "frequencies", "path-search", "reaction-path", "saddle-point"]);
    // (the kinds of file a step takes besides, by their ids - each once, never what is no id)
    const nci = acceptManifest({ ...good, reads: [], kinds: [], steps: [{ kinds: ["nci"], programs: ["densitool"], files: ["molden", "orbitron-checkpoint", "molden", "Not An Id", 3, "../x"] }] });
    expect(nci?.steps).toEqual([{ kind: "nci", programs: ["densitool"], options: [], files: ["molden", "orbitron-checkpoint"] }]);
  });

  it("may declare its program's energy lines and tables of atoms as papers quote them - each as it must be, or left out", () => {
    const energy = { id: "scf", pattern: "^\\s*SCF Final:\\s*E\\((?<method>[^)]+)\\)\\s*=\\s*(?<value>-?\\d+\\.\\d+)", name: "E", unit: "hartree" };
    const table = { id: "frame", headings: ["Frame orientation:"], heads: ["Atom Element"], columns: ["centre", "atomic-number", "type", "x", "y", "z"] };
    const read = acceptManifest({ ...good, quotedEnergies: [energy, { ...energy, id: "no-value", pattern: "E = (-?\\d+\\.\\d+)" }, { ...energy, id: "unnamed", name: " " }, { ...energy, id: "broken", pattern: "(?<value>" }], quotedTables: [table, { ...table, id: "no-z", columns: ["element", "x", "y"] }, { ...table, id: "twice", columns: ["element", "x", "x", "y", "z"] }, { ...table, id: "both", columns: ["element", "atomic-number", "x", "y", "z"] }, { ...table, id: "unheaded", headings: [] }, { ...table, id: "odd", columns: ["element", "x", "y", "z", "mass"] }] })!;
    expect(read.quotedEnergies).toEqual([energy]);
    expect(read.quotedTables).toEqual([table]);
    // (none said: none, as a plugin that quotes no line of its program's)
    expect(acceptManifest(good)!.quotedEnergies).toBeUndefined();
    // (the made-up Orbitron's and Quanta's)
    expect(MANIFESTS.filter((m) => m.quotedEnergies || m.quotedTables).map((m) => [m.id, (m.quotedEnergies ?? []).map((q) => q.id), (m.quotedTables ?? []).map((t) => t.id)])).toEqual([
      ["orbitron", ["scf-final"], ["frame"]],
      ["quanta", ["total-energy"], []],
    ]);
  });

  it("may say its program takes no lone atom - of a kind a lone atom passes through, as it came, alone: of another, it is its to refuse", () => {
    const read = acceptManifest({
      ...good,
      reads: [],
      kinds: [],
      steps: [
        { kinds: ["conformers", "optimise", "energy"], programs: ["confsweep"], noLoneAtom: true },
        { kinds: ["frequencies"], programs: ["confsweep"], noLoneAtom: "yes" },
      ],
    })!;
    expect(read.steps.map((d) => [d.kind, d.noLoneAtom])).toEqual([
      ["conformers", true],
      ["optimise", true],
      ["energy", undefined],
      ["frequencies", undefined],
    ]);
    // (the made-up Confsweep's - which stops on one atom - and no other plugin's: the others run theirs on one)
    expect(MANIFESTS.flatMap((m) => m.steps.filter((d) => d.noLoneAtom).map((d) => `${m.id} ${d.kind}`))).toEqual(["confsweep conformers", "confsweep optimise"]);
    expect(MANIFESTS.find((m) => m.id === "confsweep")!.steps.map((d) => d.programs)).toEqual([["confsweep"], ["confsweep"]]);
  });

  it("may say how its options ask for a solvation - each option it names a choice of the step's own, else it says none", () => {
    const solvent = { id: "solvent", label: "Solvent", type: "choice", choices: [{ value: "none", label: "None" }, { value: "water", label: "Water" }], default: "none" };
    const level = { id: "level", label: "Level", type: "text", default: "" };
    const of = (solvation: unknown) => acceptManifest({ ...good, reads: [], kinds: [], steps: [{ kinds: ["energy"], programs: ["tightbind"], options: [solvent, level], solvation }] })!.steps[0].solvation;
    expect(of({ says: "CONT({solvent})", none: { id: "solvent", is: "none" } })).toEqual({ says: "CONT({solvent})", none: { id: "solvent", is: "none" } });
    expect(of({ says: "CONT({level})", none: { id: "solvent", is: "none" } })).toBeUndefined();
    expect(of({ says: "CONT({gone})", none: { id: "solvent", is: "none" } })).toBeUndefined();
    expect(of({ says: "CONT", none: { id: "solvent", is: "none" } })).toBeUndefined();
    expect(of({ says: "CONT({solvent})", none: { id: "solvent", is: "vacuum" } })).toBeUndefined();
    expect(of({ says: "CONT({solvent})" })).toBeUndefined();
    expect(of(undefined)).toBeUndefined();
    // (the made-up Tightbind's and Confsweep's: each step that takes a solvent)
    expect(MANIFESTS.flatMap((m) => m.steps.filter((d) => d.solvation).map((d) => `${m.id} ${d.kind} ${d.solvation!.says}`))).toEqual([
      "confsweep conformers CONT({solvent})",
      "confsweep optimise CONT({solvent})",
      "tightbind optimise CONT({solvent})",
      "tightbind energy CONT({solvent})",
      "tightbind frequencies CONT({solvent})",
    ]);
  });

  it("asks a step of a kind that is also a role it fills, saying no options, with the role's", () => {
    const opts = [{ id: "count", label: "Conformers sought", type: "number", default: 30 }];
    const read = acceptManifest({ ...good, reads: [], kinds: [], roles: [{ role: "conformers", options: opts }], steps: [{ kinds: ["conformers"], programs: ["python"] }, { kinds: ["optimise"], options: [] }] })!;
    expect(read.steps.map((d) => [d.kind, d.options.map((o) => o.id)])).toEqual([
      ["conformers", ["count"]],
      ["optimise", []],
    ]);
    // (Sketchkit's conformer search, as a step: the options it takes as a role)
    const sketchkit = MANIFESTS.find((m) => m.id === "sketchkit")!;
    expect(sketchkit.steps.find((d) => d.kind === "conformers")?.options).toEqual(sketchkit.roles.find((r) => r.role === "conformers")?.options);
  });

  it("may declare the plugins it uses - each by id, with the versions it works with and the programs of it its jobs may run - all as they must be, or the plugin is none", () => {
    const steps = { ...good, reads: [], kinds: [], steps: [{ kinds: ["energy"], programs: ["quanta"] }] };
    const uses = { plugin: "tightbind", versions: ">=0.1.4 <0.2.0", programs: [{ program: "tightbind", env: "TBEXE" }] };
    expect(acceptManifest({ ...steps, depends: [uses] })?.depends).toEqual([{ ...uses, range: { from: "0.1.4", before: "0.2.0" } }]);
    expect(acceptManifest(steps)?.depends).toBeUndefined();
    // (one used only for some of its work)
    expect(acceptManifest({ ...steps, depends: [{ ...uses, optional: true }] })?.depends?.[0].optional).toBe(true);
    expect(acceptManifest({ ...steps, depends: [{ ...uses, optional: false }] })?.depends?.[0].optional).toBeUndefined();
    // (one whose kinds of file a step takes: each an id, once)
    expect(acceptManifest({ ...steps, depends: [{ plugin: "tightbind", versions: ">=1.0.0 <2.0.0", kinds: ["tightbind-out"] }] })?.depends?.[0].kinds).toEqual(["tightbind-out"]);
    for (const kinds of [["Bad Kind"], ["a", "a"], "a"]) expect(acceptManifest({ ...steps, depends: [{ plugin: "tightbind", versions: ">=1.0.0 <2.0.0", kinds }] }), JSON.stringify(kinds)).toBeNull();
    // (one used for no program: its presence and version alone)
    expect(acceptManifest({ ...steps, depends: [{ plugin: "tightbind", versions: ">=1.0.0 <2.0.0" }] })?.depends?.[0].programs).toEqual([]);
    // (itself, versions not as they must be, a shell, a path, a variable that finds programs, one plugin twice, one variable twice: no plugin)
    const program = (p: object) => ({ ...uses, programs: [{ ...uses.programs[0], ...p }] });
    for (const bad of [
      [{ ...uses, plugin: good.id }],
      [{ ...uses, versions: "^0.1.4" }],
      [{ ...uses, versions: undefined }],
      [program({ program: "sh" })],
      [program({ program: "bin/tightbind" })],
      [program({ env: "PATH" })],
      [program({ env: "1X" })],
      [uses, { ...uses, programs: [] }],
      [uses, { plugin: "other", versions: ">=1.0.0 <2.0.0", programs: [{ program: "tool", env: "TBEXE" }] }],
      [{ ...uses, versions: ">=0.1.4" }],
      [{ ...uses, optional: "yes" }],
      "tightbind",
    ])
      expect(acceptManifest({ ...steps, depends: bad }), JSON.stringify(bad)).toBeNull();
    // (the made-up Quanta's: the Tightbind plugin's program, in TBEXE - for some of its work alone)
    expect(MANIFESTS.find((m) => m.id === "quanta")?.depends?.map((d) => [d.plugin, d.versions, d.programs, d.optional])).toEqual([["tightbind", ">=0.2.0 <0.3.0", [{ program: "tightbind", env: "TBEXE" }], true]]);
  });

  it("may declare interfaces for other plugins to use it through, and use another's - each by id with its version or versions - all as they must be, or the plugin is none", () => {
    const steps = { ...good, reads: [], kinds: [], steps: [{ kinds: ["energy"], programs: ["quanta"] }] };
    expect(acceptManifest({ ...steps, interfaces: [{ id: "styling", version: "1.2.0" }] })?.interfaces).toEqual([{ id: "styling", version: "1.2.0" }]);
    expect(acceptManifest(steps)?.interfaces).toBeUndefined();
    const through = { plugin: "tool", versions: ">=1.0.0 <2.0.0", interfaces: [{ id: "styling", versions: ">=1.0.0 <2.0.0" }] };
    expect(acceptManifest({ ...steps, depends: [through] })?.depends?.[0].interfaces).toEqual([{ id: "styling", versions: ">=1.0.0 <2.0.0", range: { from: "1.0.0", before: "2.0.0" } }]);
    for (const bad of [
      { interfaces: [{ id: "styling", version: "1.2" }] },
      { interfaces: [{ id: "Styling", version: "1.2.0" }] },
      { interfaces: [{ id: "styling", version: "1.0.0" }, { id: "styling", version: "2.0.0" }] },
      { interfaces: { id: "styling", version: "1.0.0" } },
      { depends: [{ ...through, interfaces: [{ id: "styling", versions: "^1.0.0" }] }] },
      { depends: [{ ...through, interfaces: [{ id: "styling", versions: ">=1.0.0" }] }] },
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
    // (a studio that is itself the background says so, as a motion says what it is made with; a fixed choice not as it must be is left out)
    const fixedStudio = { id: "attic", label: "Attic", file: "attic.py", fixed: [{ id: "background", value: "white", why: "The attic is the background" }, { id: "x" }] };
    expect(acceptManifest({ ...preset, presets: { ...presets, studios: [fixedStudio] } })?.presets?.studios).toEqual([{ id: "attic", label: "Attic", file: "attic.py", fixed: [{ id: "background", value: "white", why: "The attic is the background" }] }]);
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
    const steps = { ...good, reads: [], kinds: [], steps: [{ kinds: ["conformers"], programs: ["confsweep"] }] };
    expect(acceptManifest({ ...steps, systems: ["macos", "linux", "beos"] })?.systems).toEqual(["macos", "linux"]);
    expect(acceptManifest(steps)?.systems).toEqual([]);
    // (the made-up Confsweep's: for macOS and Linux alone)
    expect(MANIFESTS.find((m) => m.id === "confsweep")?.systems).toEqual(["macos", "linux"]);
    expect(MANIFESTS.find((m) => m.id === "tightbind")?.systems).toEqual([]);
  });

  it("may run programs installed separately: each by its name, what it is called, its file on each system, and places in its installation - only those its steps run", () => {
    const steps = { ...good, reads: [], kinds: [], steps: [{ kinds: ["energy"], programs: ["quanta", "orb26"] }] };
    const installed = [
      { name: "quanta", label: "Quanta", files: { macos: "quanta", linux: "quanta", windows: "quanta.exe", beos: "quanta" }, path: "{folder}" },
      { name: "quanta", label: "Again", files: { linux: "quanta" } },
      { name: "orb26", label: "Orbitron 26", files: { linux: "orb26" }, path: ["{folder}", "{parent}/bsd"], env: { orbroot: "{parent}", ORB_EXEDIR: ["{folder}", "{folder}/bsd"] } },
      { name: "unrun", label: "Not run by a step", files: { linux: "unrun" } },
      { name: "pathed", label: "A path", files: { linux: "/usr/bin/pathed" } },
      { name: "../x", label: "X", files: { linux: "x" } },
    ];
    expect(acceptManifest({ ...steps, installed })?.installed).toEqual([
      { name: "quanta", label: "Quanta", files: { macos: "quanta", windows: "quanta.exe", linux: "quanta" }, path: ["{folder}"], env: {}, places: {} },
      { name: "orb26", label: "Orbitron 26", files: { linux: "orb26" }, path: ["{folder}", "{parent}/bsd"], env: { orbroot: ["{parent}"], ORB_EXEDIR: ["{folder}", "{folder}/bsd"] }, places: {} },
    ]);
    // (a place outside its installation, a variable it may not set: as Meno's backend, none of it)
    const orb26 = (d: Record<string, unknown>) => acceptManifest({ ...steps, installed: [{ name: "orb26", label: "Orbitron 26", files: { linux: "orb26" }, ...d }] })?.installed;
    expect(orb26({ path: ["/usr/bin"] })).toEqual([]);
    expect(orb26({ path: ["{folder}/../.."] })).toEqual([]);
    expect(orb26({ env: { PATH: "{folder}" } })).toEqual([]);
    expect(orb26({ env: { ld_preload: "{folder}" } })).toEqual([]);
    expect(orb26({ env: { OMP_NUM_THREADS: "{folder}" } })).toEqual([]);
    expect(orb26({ env: { HOME: "/root" } })).toEqual([]);
    expect(acceptManifest(steps)?.installed).toEqual([]);
    // the places it is usually installed in, on each system: from /, {home} or {programs}, a * in a folder's name - the backend's rule
    const usual = { macos: ["/Applications/Orb26.app/Contents/MacOS", "{home}/Applications/Orb26.app/Contents/MacOS"], windows: ["{programs}/Orbitron */bin"] };
    expect(orb26({ files: { linux: "orb26", macos: "orb26" }, places: usual })?.[0].places).toEqual(usual);
    for (const bad of ["Applications/orb26", "/a/../b", "{home}orb26", "{folder}/orb26", "/a/**/b", "/a/{home}", "C:\\orb26"]) expect(orb26({ places: { linux: [bad] } })).toEqual([]);
    // never a shell, an interpreter that takes code, or Python, whatever its case or ending: left out as a path is - the backend's rule (`program_file_ok`)
    for (const bad of ["sh", "bash", "zsh.exe", "cmd.exe", "PowerShell.exe", "pwsh", "env", "perl", "node.exe", "osascript", "python", "python3", "python3.12", "Python.exe", "pythonw.exe"])
      expect(orb26({ files: { linux: bad } }), bad).toEqual([]);
    expect(orb26({ files: { linux: "orb26", windows: "cmd.exe" } })?.[0].files).toEqual({ linux: "orb26" });
    // (a name that only begins like one is a program of its own)
    expect(orb26({ files: { linux: "shelxl", macos: "envelope" } })?.[0].files).toEqual({ macos: "envelope", linux: "shelxl" });
    // run by a role, not a step: kept too
    const byRole = { ...good, reads: [], kinds: [], roles: [{ role: "render", programs: ["lumen"] }], installed: [{ name: "lumen", label: "Lumen", files: { macos: "Lumen" } }] };
    expect(acceptManifest(byRole)?.installed.map((d) => d.name)).toEqual(["lumen"]);
    // (the made-up Orbitron's: found by its file alone)
    expect(MANIFESTS.find((m) => m.id === "orbitron")?.installed[0]).toMatchObject({ name: "orb26", files: { macos: "orb26", linux: "orb26", windows: "orb26.exe" }, path: [], env: {} });
  });

  it("may say the programs installed beside one installed separately, that a job may run after it - as the backend reads them", () => {
    const quanta = (beside: unknown) =>
      acceptManifest({ ...good, reads: [], kinds: [], steps: [{ kinds: ["energy"], programs: ["quanta"] }], installed: [{ name: "quanta", label: "Quanta", files: { macos: "quanta" }, beside }] })?.installed;
    expect(quanta({ quanta_conv: { macos: "quanta_conv", windows: "quanta_conv.exe" } })?.[0].beside).toEqual({ quanta_conv: { macos: "quanta_conv", windows: "quanta_conv.exe" } });
    expect(quanta(undefined)?.[0]).not.toHaveProperty("beside");
    for (const bad of [{ "../x": { macos: "x" } }, { x: { macos: "../x" } }, { x: { amiga: "x" } }, { x: "x" }, ["x"], { a: {}, b: {}, c: {}, d: {}, e: {} }]) expect(quanta(bad)).toEqual([]);
    // (never a shell or Python beside it, as the backend refuses one)
    for (const bad of [{ x: { macos: "sh" } }, { x: { windows: "cmd.exe" } }, { x: { linux: "python3" } }]) expect(quanta(bad)).toEqual([]);
    // (the made-up Quanta's: none beside it)
    expect(MANIFESTS.find((m) => m.id === "quanta")?.installed[0]).not.toHaveProperty("beside");
  });

  it("may say how a program installed separately runs in parallel - as threads, or as processes, each a core - as the backend reads it", () => {
    const quanta = (parallel: unknown) =>
      acceptManifest({ ...good, reads: [], kinds: [], steps: [{ kinds: ["energy"], programs: ["quanta"] }], installed: [{ name: "quanta", label: "Quanta", files: { macos: "quanta" }, parallel }] })?.installed;
    expect(quanta("processes")?.[0].parallel).toBe("processes");
    expect(quanta("threads")?.[0].parallel).toBe("threads");
    expect(quanta(undefined)?.[0]).not.toHaveProperty("parallel");
    for (const bad of ["mpi", "Processes", true, 4, null, ["processes"]]) expect(quanta(bad)).toEqual([]);
    // (the made-up Quanta's: as processes)
    expect(MANIFESTS.find((m) => m.id === "quanta")?.installed[0].parallel).toBe("processes");
  });

  it("may fetch a program it runs, Meno's own copy: an archive for one system, where the program is in it - as the backend takes it", () => {
    const copy = {
      file: "lumen-4.1-windows-x64.zip",
      name: "Lumen 4.1",
      licence: "GPL-3.0-or-later",
      url: "https://downloads.example.org/lumen/4.1/lumen-4.1-windows-x64.zip",
      sha256: "ab".repeat(32),
      bytes: 404_453_484,
      system: "windows",
      arch: "x86_64",
      unpack: "zip",
      program: "*/lumen.exe",
      provides: "lumen",
    };
    expect(acceptManifest({ ...good, downloads: [copy] })?.downloads).toEqual([copy]);
    for (const wrong of [
      { unpack: "rar" },
      { unpack: "dmg" },
      { program: "../lumen.exe" },
      { program: "C:\\lumen.exe" },
      { system: "amiga" },
      { arch: "ppc" },
      { provides: "../lumen" },
      { program: undefined },
      { system: undefined },
      { file: "lumen.dmg", unpack: "dmg", program: "*/Lumen" },
    ])
      expect(acceptManifest({ ...good, downloads: [{ ...copy, ...wrong }] }), JSON.stringify(wrong)).toBeNull();
    // (the made-up Lumen's: its builds for macOS on Apple silicon and Windows)
    const lumen = MANIFESTS.find((m) => m.id === "lumen")!;
    expect(lumen.installed).toEqual([]);
    expect(lumen.downloads.map((d) => [d.system, d.arch, d.unpack, d.provides])).toEqual([
      ["macos", "aarch64", "dmg", "lumen"],
      ["windows", "x86_64", "zip", "lumen"],
      ["windows", "aarch64", "zip", "lumen"],
    ]);
    expect(lumen.downloads.every((d) => d.url.startsWith("https://downloads.example.org/lumen/4.1/") && d.url.endsWith(d.file))).toBe(true);
  });

  it("may fetch a data file compressed with gzip, said how large it is unpacked, and how its makers ask to be cited - never a program", () => {
    const db = {
      file: "fragments.db.gz",
      name: "A fragment database",
      licence: "CC BY 4.0",
      url: "https://downloads.example.org/records/1/files/fragments.db.gz/content",
      sha256: "ab".repeat(32),
      bytes: 281_251_246,
      unpack: "gz",
      unpackedBytes: 2_027_749_376,
      cite: "A. Author, J. Made Up 2020, 1, 1",
    };
    expect(acceptManifest({ ...good, downloads: [db] })?.downloads).toEqual([db]);
    for (const wrong of [{ unpackedBytes: undefined }, { unpackedBytes: -1 }, { unpackedBytes: 1.5 }, { program: "fragments.db" }, { file: "fragments.db", unpack: undefined }, { cite: 7 }, { file: "fragments.gz.db" }])
      expect(acceptManifest({ ...good, downloads: [{ ...db, ...wrong }] }), JSON.stringify(wrong)).toBeNull();
    // (how large unpacked: said only of one unpacked by Meno)
    const { unpack: _u, unpackedBytes: _b, ...plain } = db;
    expect(acceptManifest({ ...good, downloads: [{ ...plain, file: "fragments.db", unpackedBytes: 5 }] })).toBeNull();
    expect(acceptManifest({ ...good, downloads: [{ ...plain, file: "fragments.db" }] })?.downloads[0].cite).toBe(db.cite);
    // (the made-up Fragswap's: its database, and a Generate step that takes seeds)
    const fragswap = MANIFESTS.find((m) => m.id === "fragswap")!;
    expect(fragswap.downloads.map((d) => [d.file, d.unpack, d.licence, d.bytes, d.unpackedBytes])).toEqual([["fragments.db.gz", "gz", "CC-BY-4.0", 200_000_000, 1_500_000_000]]);
    expect(fragswap.downloads[0].url).toBe("https://downloads.example.org/fragswap/fragments.db.gz");
    expect(fragswap.steps).toEqual([expect.objectContaining({ kind: "generate", seeds: true })]);
    expect(MANIFESTS.find((m) => m.id === "molgen")!.steps[0].seeds).toBeUndefined();
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
    const coloured = [{ id: "bondorb-in", name: "Bondorb input", extensions: [".bdo"], grammar: { file: "bondorb.grammar", tones: { Word: "keyword" } } }];
    expect(acceptManifest({ ...data, kinds: coloured, downloads: [weights] })?.downloads).toEqual([]);
  });

  it("may say how a program installed separately says its version, and the least Meno takes - as the backend reads it", () => {
    const lumen = (version: unknown) =>
      acceptManifest({ ...good, reads: [], kinds: [], roles: [{ role: "render", programs: ["lumen"] }], installed: [{ name: "lumen", label: "Lumen", files: { macos: "Lumen" }, version }] })?.installed;
    const rule = { args: ["--version"], after: "Lumen ", least: "5.0" };
    expect(lumen(rule)?.[0].version).toEqual(rule);
    expect(lumen(undefined)?.[0]).not.toHaveProperty("version");
    // (options alone - never a file or a path - text to find, a version: else none of it)
    for (const bad of [{ ...rule, args: [] }, { ...rule, args: ["/tmp/x"] }, { ...rule, args: ["--version", "file"] }, { ...rule, after: "" }, { ...rule, after: "a\nb" }, { ...rule, least: "5.x" }, { ...rule, least: "" }, "5.0"])
      expect(lumen(bad)).toEqual([]);
  });

  it("runs nothing where it says no environment: then it brings texts it colours alone - and a plugin that does nothing is none", () => {
    const data = { ...good, environment: undefined };
    expect(acceptManifest(data)).toBeNull();
    const coloured = [{ id: "bondorb-in", name: "Bondorb input", extensions: [".bdo"], grammar: { file: "bondorb.grammar", tones: { Word: "keyword" } } }];
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
    expect(acceptManifest("bondorb")).toBeNull();
  });

  it("brings no kind to read that cannot be told - a mark too short to tell anything, a pattern, no mark and no asking", () => {
    const kinds = (k: Record<string, unknown>) => acceptManifest({ ...good, reads: ["bondorb-47"], kinds: [{ ...good.kinds[0], ...k }] })?.reads ?? [];
    expect(kinds({ marks: [{ text: "N" }] })).toEqual([]);
    expect(kinds({ marks: [/BONDORB/] })).toEqual([]);
    expect(kinds({ marks: [] })).toEqual([]);
    // (told by asking its plugin: by its files' names first)
    expect(kinds({ marks: [], probe: true })).toEqual(["bondorb-47"]);
    expect(kinds({ marks: [], extensions: [], probe: true })).toEqual([]);
    // (a kind many programs write names no one program)
    const { program: _, ...anyProgram } = good.kinds[0];
    expect(acceptManifest({ ...good, kinds: [anyProgram] })?.kinds).toEqual([anyProgram]);
  });

  it("brings no guide and names no other plugin: a guide, plugins suggested and a catalogue of files are not read - and are no plugin alone", () => {
    const extra = { guide: [{ title: "Welcome", text: "Hi." }], suggests: [{ plugin: "manyread", for: "Reads outputs" }], files: [{ id: "quanta", name: "Quanta output", extensions: [".out"], marks: [{ text: "Q   U   A   N   T   A" }], suggest: ["manyread"] }] };
    const read = acceptManifest({ ...good, ...extra })!;
    expect(Object.keys(read)).not.toContain("guide");
    expect(Object.keys(read)).not.toContain("suggests");
    expect(Object.keys(read)).not.toContain("files");
    expect(acceptManifest({ id: "only-words", name: "Only words", version: "1", ...extra })).toBeNull();
  });
});

describe("a mark", () => {
  it("is text a file's start holds, runs of spaces one, anywhere or at a line's start, in its case or any", () => {
    const head = folded("title\n   ~ Q   U   A   N   T   A ~\n [Molden Format]\n");
    expect(holdsMark(head, { text: "~ Q U A N T A ~" })).toBe(true);
    expect(holdsMark(head, { text: "~  Q  U  A  N  T  A  ~" })).toBe(true);
    expect(holdsMark(head, { text: "Q U A N T A", at: "line-start" })).toBe(false);
    expect(holdsMark(head, { text: "[molden format]", at: "line-start" })).toBe(false);
    expect(holdsMark(head, { text: "[molden format]", at: "line-start", anyCase: true })).toBe(true);
  });

  it("is found where it first comes in the file: a program's banner before another's it quotes", () => {
    const head = folded("title\n   ~ Q   U   A   N   T   A ~\n [Molden Format]\n");
    expect(markAt(head, { text: "~ Q U A N T A ~" })).toBe(head.indexOf("~"));
    expect(markAt(head, { text: "[Molden Format]", at: "line-start" })).toBe(head.indexOf(" [Molden"));
    expect(markAt(head, { text: "Alphachem" })).toBe(-1);
  });
});

