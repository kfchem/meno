import { describe, expect, it } from "vitest";
import { broughtBy, cataloguedKinds, extensionOf, kindOf, kinds, offeredKinds, probeCandidates, quotedEnergies, quotedTables, registerKinds, registered } from "./kinds";
import { acceptManifest, type Manifest } from "../plugins/manifest";
import type { CatalogueEntry } from "../plugins/catalogue";
import { MANIFESTS } from "../plugins/known";
import { pluginOf, readerFor, type ReaderPlugin } from "../calc/catalog";
import sampleSdf from "../../samples/cholesterol.sdf?raw";
import sampleRxn from "../../samples/diels-alder.rxn?raw";
import sampleXyz from "../../samples/cholesterol.xyz?raw";
import samplePdb from "../../samples/cholesterol.pdb?raw";

const id = (name: string, text: string) => kindOf(name, text)?.id ?? null;
// (with the made-up test plugins added: the kinds they bring registered)
const added = registered(MANIFESTS).kinds;
const idAdded = (name: string, text: string) => kindOf(name, text, added)?.id ?? null;

// Ethane as a V2000 molfile, its title a bare number, as PubChem's are
const numericTitleMol = [
  "6324",
  "  -OEChem-09162612002D",
  "",
  "  2  1  0     0  0  0  0  0  0999 V2000",
  "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "  1  2  1  0  0  0  0",
  "M  END",
].join("\n");

// (the banners of made-up programs, as their test plugins bring them: src/test/plugins)
const QUANTA = "\n\n                                 ~ Q   U   A   N   T   A ~\n";
const ORBITRON = " Orbitron run begins, stage 0=orb26\n";

describe("what a file is", () => {
  it("is a structure's file by what it holds", () => {
    expect(id("cholesterol.sdf", sampleSdf)).toBe("sdf");
    expect(id("diels-alder.rxn", sampleRxn)).toBe("rxn");
    expect(id("cholesterol.xyz", sampleXyz)).toBe("xyz");
    expect(id("frame.txt", sampleXyz)).toBe("xyz");
    expect(id("", "1\ncomment\n6 0.0 0.0 0.0")).toBe("xyz");
    expect(id("", "0\nempty frame")).toBe("xyz");
  });

  it("is a PDB file by its records: a record name first, and an atom's coordinates in their columns", () => {
    expect(id("cholesterol.pdb", samplePdb)).toBe("pdb");
    expect(id("structure.txt", samplePdb)).toBe("pdb");
    expect(id("", "REMARK   1 MADE BY HAND\n" + samplePdb)).toBe("pdb");
    // (a record name first, but no atom's record whose coordinates read)
    expect(id("", "REMARK   1 NOTHING HERE\nEND\n")).toBeNull();
    expect(id("notes.txt", "ATOM bomb\nHETATM? no\n")).toBeNull();
    // (its name, where what it holds says nothing: then it reads as no molecule, and says so)
    expect(id("empty.pdb", "")).toBe("pdb");
    expect(id("1abc.pdb", "HEADER    PROTEIN\nATOM      1  N   ALA A   1\n")).toBe("pdb");
  });

  it("is a molfile, not an XYZ file, when its title is a bare number", () => {
    expect(id("6324.sdf", numericTitleMol)).toBe("sdf");
    expect(id("6324.mol", numericTitleMol)).toBe("mol");
    expect(id("", numericTitleMol)).toBe("mol");
    expect(id("download.txt", numericTitleMol + "\n$$$$\n")).toBe("mol");
  });

  it("is a calculation's output by its program's banner, whatever it is called - where a plugin added brings the kind", () => {
    expect(idAdded("job.out", QUANTA)).toBe("quanta");
    expect(idAdded("run.log", ORBITRON)).toBe("orbitron");
    expect(idAdded("", "title\nSP        M2     B-mid\nAtom count                            I               20\n")).toBe("orbitron-checkpoint");
    expect(idAdded("", "     ==             T I G H T B I N D             ==     \n")).toBe("tightbind");
    expect(idAdded("", "   tightbind release 1.0.0 (abc1234)\n")).toBe("tightbind");
    // (a Molden file, by its first section)
    expect(idAdded("", "[Molden Format]\n[Atoms] AU\nO 1 8 0 0 0\n")).toBe("molden");
    expect(idAdded("water.txt", "  [MOLDEN FORMAT]\n")).toBe("molden");
    // (and the other programs a reader of many reads, by their banners - one in any case)
    expect(idAdded("", "              Alphachem Energy Program 7.0.2\n")).toBe("alphachem");
    expect(idAdded("output.bwo", "    Betawave: wavefunctions by the book\n")).toBe("betawave");
  });

  it("is no program's output where no plugin added brings its kind: Meno knows no program", () => {
    expect(kinds().map((k) => k.id)).toEqual(["meno-workspace", "meno-record", "rxn", "mol", "sdf", "xyz", "pdb", "cube", "wfx", "molden"]);
    expect(id("job.out", QUANTA)).toBeNull();
    expect(id("run.log", ORBITRON)).toBeNull();
  });

  it("is a WFX file or a Molden file by what starts its sections, any case: kinds programs of every kind write, which Meno knows itself", () => {
    expect(id("water.wfx", "<Title>\n water\n</Title>\n<number of primitives>\n 7\n</Number of Primitives>\n")).toBe("wfx");
    expect(id("", "[Molden Format]\n[Atoms] AU\n")).toBe("molden");
    expect(id("orbitals.input", "[MOLDEN FORMAT]\n")).toBe("molden");
  });

  it("is the program's whose banner comes first, where an output holds another's too", () => {
    expect(idAdded("job.log", ORBITRON + " basis read from the ALPHACHEM ENERGY PROGRAM library\n")).toBe("orbitron");
    expect(idAdded("job.out", " ALPHACHEM ENERGY PROGRAM V7.5.1\n Orbitron run begins, stage 0=\n")).toBe("alphachem");
  });

  it("is Meno's own record by what it says it is", () => {
    expect(id("work.json", '{"format":"meno-workspace","version":1,"atoms":[]}')).toBe("meno-workspace");
    expect(id("", ' {"format": "meno-structure", "version": 1, "atoms": []}')).toBe("meno-record");
    // (a workspace file that says nothing it can be told by: by its name)
    expect(id("work.meno", "{}")).toBe("meno-workspace");
  });

  it("takes the strongest evidence first: a banner over a molfile's markers, a cube's layout over an XYZ file's", () => {
    // an output that echoes a molfile, or a word like one
    expect(idAdded("job.out", QUANTA + "  input read from x.mol (V2000)\nM  END\n")).toBe("quanta");
    expect(idAdded("ethane.mol", ORBITRON + numericTitleMol)).toBe("orbitron");
    // a cube whose comment is a number: its third line reads as an XYZ file's first atom
    const cube = ["2", "density", "    1    0.000000    0.000000    0.000000", "   -2    0.5 0.0 0.0", "   -2    0.0 0.5 0.0", "   -2    0.0 0.0 0.5", "    2    2.0 0.25 0.25 0.25", ""].join("\n");
    expect(id("", cube)).toBe("cube");
  });

  it("is decided by its name only where what it holds says nothing", () => {
    expect(id("x.xyz", "2\n\nC 0 0 0\nC 1.5 0 0")).toBe("xyz");
    expect(id("notes.mol", "hello")).toBe("mol");
    expect(id("broken.rxn", "nothing here")).toBe("rxn");
    // (an output's names are text's too: no banner, no output)
    expect(id("build.log", "compiled in 3 s\n")).toBeNull();
  });

  it("is nothing Meno reads: text, a SMILES, a kind nothing reads yet", () => {
    expect(id("notes.txt", "42\nthe answer\nis not a molecule")).toBeNull();
    expect(id("Saturday.txt", "Saturday: ran the column\n")).toBeNull();
    expect(id("", "CCO")).toBeNull();
    expect(id("reaction.ket", '{"root":{"nodes":[]}}')).toBeNull();
  });
});

describe("the kinds", () => {
  it("are Meno's own, and those the plugins added bring while they are added, each named, every one once", () => {
    registerKinds(MANIFESTS);
    const ids = kinds().map((k) => k.id);
    expect(ids).toEqual(expect.arrayContaining(["meno-workspace", "meno-record", "rxn", "mol", "sdf", "xyz", "pdb", "quanta", "orbitron", "orbitron-checkpoint", "tightbind", "molden", "cube", "betawave"]));
    expect(new Set(ids).size).toBe(ids.length);
    expect(kinds().filter((k) => k.output).map((k) => k.id)).not.toContain("xyz");
    registerKinds([]);
    expect(kinds().map((k) => k.id)).not.toContain("quanta");
  });

  it("give a file's extension, lower case, with its dot", () => {
    expect(extensionOf("Ethanol.MOL")).toBe(".mol");
    expect(extensionOf("a.b/c.sdf")).toBe(".sdf");
    expect(extensionOf("README")).toBe("");
  });
});

describe("kinds a plugin registers", () => {
  // (a made-up plugin, Bondorb, with the kinds a test gives it)
  const bondorb = (kinds: unknown[]): Manifest =>
    acceptManifest({
      id: "bondorb",
      name: "Bondorb",
      version: "7",
      environment: "uv",
      // (every kind it brings, read: one it only colours is no file Meno takes in)
      reads: ["orbitron", ...kinds.map((k) => (k as { id: string }).id)],
      kinds,
    })!;

  it("are told by their marks, as Meno's are, so that a program Meno does not know can be read", () => {
    const { kinds: all, refused } = registered([
      bondorb([{ id: "bondorb-out", name: "Bondorb output", program: "Bondorb", extensions: [".bo"], marks: [{ text: "B O N D O R B   O R B I T A L S" }] }]),
    ]);
    expect(refused).toEqual([]);
    const k = all.find((x) => x.id === "bondorb-out")!;
    expect(k).toMatchObject({ name: "Bondorb output", extensions: [".bo"], output: { program: "Bondorb" } });
    expect(kindOf("job.out", "\n   B O N D O R B    O R B I T A L S   B Y   A T O M\n", all)?.id).toBe("bondorb-out");
    // (and a kind it does not bring is not told by it: Meno knows no program)
    expect(kindOf("job.out", " Orbitron run begins, stage 0=\n", all)).toBeNull();
  });

  it("are one kind with another plugin's of the same id - the first's name, their marks and file names put together", () => {
    const manyread = MANIFESTS.find((m) => m.id === "manyread")!;
    const { kinds: all } = registered([
      manyread,
      bondorb([{ id: "quanta", name: "Quanta", program: "Quanta", extensions: [".qnt"], marks: [{ text: "Quanta Version 6", at: "line-start" }] }]),
    ]);
    const quanta = all.filter((x) => x.id === "quanta");
    expect(quanta).toHaveLength(1);
    expect(quanta[0].name).toBe("Quanta output");
    expect(quanta[0].extensions).toEqual([".out", ".log", ".qnt"]);
    expect(kindOf("x", "  Quanta Version 6.0.1\n", all)?.id).toBe("quanta");
    expect(kindOf("x", QUANTA, all)?.id).toBe("quanta");
  });

  it("are coloured by the grammar of the plugin whose own program writes them, else by the first's", () => {
    const grammar = { file: "quanta-output.grammar", tones: { Heading: "landmark" } };
    const own = (writtenBy?: string, id = "program-own") =>
      acceptManifest({
        id,
        name: "The program's plugin",
        version: "1",
        environment: "uv",
        reads: ["quanta"],
        kinds: [{ id: "quanta", name: "Quanta output", program: "Quanta", extensions: [".out"], marks: [{ text: "~ Q U A N T A ~" }], grammar, ...(writtenBy ? { writtenBy } : {}) }],
        steps: [{ kinds: ["energy"], programs: ["quanta"] }],
      })!;
    // (a plugin that brings the kind and its grammar, and says nothing of who writes it)
    const first = own(undefined, "first");
    const quantaOf = (ms: Manifest[]) => registered(ms).kinds.find((x) => x.id === "quanta")!;
    // (its own program's plugin's, whichever comes first)
    expect(quantaOf([first, own("quanta")]).grammar?.plugin).toBe("program-own");
    expect(quantaOf([own("quanta"), first]).grammar?.plugin).toBe("program-own");
    // (no plugin says its program writes it: the first's, as before)
    expect(quantaOf([first, own()]).grammar?.plugin).toBe("first");
    // (two say so: the first's, in Meno's order - the plugin that reads it by default)
    const second = own("quanta", "program-other");
    expect(quantaOf([first, own("quanta"), second]).grammar?.plugin).toBe("program-own");
    expect(quantaOf([second, own("quanta")]).grammar?.plugin).toBe("program-other");
    const both = new Set(["program-own", "program-other"]);
    const asReader = (p: Manifest) => pluginOf(p) as ReaderPlugin;
    expect(readerFor("quanta", both, { read: {}, also: {} }, [asReader(own("quanta")), asReader(second)])?.id).toBe("program-own");
    expect(readerFor("quanta", both, { read: {}, also: {} }, [asReader(second), asReader(own("quanta"))])?.id).toBe("program-other");
  });

  it("are Meno's, where a plugin brings a kind of the id of one of Meno's", () => {
    const { kinds: all } = registered([bondorb([{ id: "xyz", name: "Bondorb's XYZ", program: "Bondorb", extensions: [".boxyz"], marks: [{ text: "BONDORB XYZ FRAME" }] }])]);
    expect(all.filter((x) => x.id === "xyz")).toEqual([{ id: "xyz", name: "XYZ file", extensions: [".xyz"] }]);
  });

  it("may not take one of Meno's own files for theirs: a mark one of them holds is refused, and said", () => {
    const { kinds: all, refused } = registered([
      bondorb([
        { id: "greedy", name: "Greedy", program: "G", extensions: [], marks: [{ text: "HETATM    1  C1" }, { text: "cholesterol", at: "line-start" }] },
        { id: "fair", name: "Fair", program: "F", extensions: [], marks: [{ text: "cholesterol", at: "line-start" }, { text: "FAIR BANNER" }] },
      ]),
    ]);
    expect(refused).toEqual([
      { plugin: "bondorb", kind: "greedy", mark: "HETATM    1  C1" },
      { plugin: "bondorb", kind: "greedy", mark: "cholesterol" },
      { plugin: "bondorb", kind: "fair", mark: "cholesterol" },
    ]);
    // (left with no way to be told, the greedy kind is not registered; the fair one keeps its own mark)
    expect(all.find((x) => x.id === "greedy")).toBeUndefined();
    expect(all.find((x) => x.id === "fair")?.marks).toEqual([{ text: "FAIR BANNER" }]);
    expect(kindOf("cholesterol.sdf", sampleSdf, all)?.id).toBe("sdf");
  });

  it("may not be told by marks too short to tell anything: what a molfile holds, say", () => {
    // (marks that short are not read; a kind it reads that is told no other way is not read either)
    const short = bondorb([{ id: "short", name: "Short", program: "S", extensions: [], marks: [{ text: "V2000" }, { text: "M  END" }] }]);
    expect(short.kinds[0].marks).toEqual([]);
    expect(short.reads).toEqual(["orbitron"]);
    expect(registered([short]).kinds.map((k) => k.id)).not.toContain("short");
  });

  it("told only by asking their plugin, are asked about only for files of their names", () => {
    const { kinds: all } = registered([bondorb([{ id: "bondorb-in", name: "Bondorb input", program: "Bondorb", extensions: [".boi"], marks: [], probe: true }])]);
    expect(kindOf("job.boi", "$BONDORB ATOMS=3 $END", all)).toBeNull();
    expect(probeCandidates("job.boi", all).map((k) => k.id)).toEqual(["bondorb-in"]);
    expect(probeCandidates("job.out", all)).toEqual([]);
  });
});

describe("kinds only plugins not added read", () => {
  // (a made-up plugin that reads one kind: Meno knows none of these names)
  // (its program, run by a step: the one whose output a kind of it may say it is, `writtenBy`)
  const reader = (id: string, kind: unknown): Manifest => acceptManifest({ id, name: id, version: "1", environment: "uv", reads: [(kind as { id: string }).id], kinds: [kind], steps: [{ kinds: ["energy"], programs: [id] }] })!;
  const out = { id: "bondorb-out", name: "Bondorb output", extensions: [".bo"], marks: [{ text: "B O N D O R B   O R B I T A L S" }] };

  it("are told by their own marks, each with the plugins not added that read it - the one its program's own first - worked out from what each says it reads", () => {
    const offered = [reader("lite", out), reader("bondorb", { ...out, writtenBy: "bondorb" }), reader("other", { id: "other-out", name: "Other", extensions: [".o"], marks: [{ text: "O T H E R   P R O G" }] })];
    const kinds = offeredKinds(offered, []);
    expect(kinds.map((k) => [k.id, k.suggest])).toEqual([
      ["bondorb-out", ["bondorb", "lite"]],
      ["other-out", ["other"]],
    ]);
    // (one a plugin added reads is no longer to be suggested for: that plugin reads it)
    expect(offeredKinds(offered, [offered[2]]).map((k) => k.id)).toEqual(["bondorb-out"]);
    expect(offeredKinds(offered, [offered[0]]).map((k) => k.id)).toEqual(["other-out"]);
  });

  it("are none told by asking alone - no plugin not added is asked - nor any that would take one of Meno's own files", () => {
    const asked = reader("asks", { id: "asked", name: "Asked", extensions: [".a"], marks: [], probe: true });
    const greedy = reader("greedy", { id: "greedy", name: "Greedy", extensions: [], marks: [{ text: "HETATM    1  C1" }] });
    expect(offeredKinds([asked, greedy], [])).toEqual([]);
  });

  it("are told by those of the plugins on offer online, not got, as their entries say them - the plugins here first", () => {
    const onOffer = (id: string, kind: Record<string, unknown>) => ({ id, name: id, reads: [kind.id], fileKinds: [kind], quotedTables: [] }) as unknown as CatalogueEntry;
    const online = [onOffer("bondorb", { ...out, writtenBy: "bondorb" }), onOffer("far", { id: "far-out", name: "Far output", extensions: [".far"], marks: [{ text: "F A R   P R O G R A M" }] })];
    registerKinds([], [reader("lite", out)], online);
    expect(cataloguedKinds().map((k) => [k.id, k.suggest, k.extensions])).toEqual([
      ["bondorb-out", ["bondorb", "lite"], [".bo"]],
      ["far-out", ["far"], [".far"]],
    ]);
    // (an output: read by its readers, once one is added)
    expect(kindOf("x", "head\nF A R   P R O G R A M\n", cataloguedKinds())?.output).toEqual({});
    // (one here as well as on offer: the one here is the one told by)
    registerKinds([], [reader("far", { id: "far-out", name: "Far, here", extensions: [".far"], marks: [{ text: "F A R   P R O G R A M" }] })], online.slice(1));
    // (once: its entry online is not a second plugin that reads it)
    expect(cataloguedKinds().map((k) => [k.name, k.suggest])).toEqual([["Far, here", ["far"]]]);
    // (and none suggested for a kind a plugin added reads)
    expect(offeredKinds(online.map(broughtBy), [reader("x", { ...out, id: "far-out" })]).map((k) => k.id)).toEqual(["bondorb-out"]);
    registerKinds([]);
  });

  it("say whose a table of atoms is that only a plugin on offer online declares - its entry's name - one here first", () => {
    const table = { id: "orientation", headings: ["Far orientation:"], heads: [], columns: ["element", "x", "y", "z"] as ("element" | "x" | "y" | "z")[] };
    const entry = { id: "far", name: "Far interface", reads: [], fileKinds: [], quotedTables: [table] } as unknown as CatalogueEntry;
    registerKinds([], [], [entry]);
    expect(quotedTables().offered).toEqual([{ ...table, plugin: "Far interface" }]);
    const here = acceptManifest({ id: "far", name: "Far, here", version: "1", environment: "uv", reads: ["far-out"], kinds: [{ id: "far-out", name: "Far output", extensions: [".far"], marks: [{ text: "F A R   P R O G R A M" }] }], quotedTables: [table] })!;
    registerKinds([], [here], [entry]);
    expect(quotedTables().offered.map((t) => t.plugin)).toEqual(["Far, here"]);
    // (added - whether or not among those here - its entry's tables are not said to be another's)
    registerKinds([here], [], [entry]);
    expect([quotedTables().offered, quotedTables().added.map((t) => t.plugin)]).toEqual([[], ["Far, here"]]);
    registerKinds([here], [here], [entry]);
    expect([quotedTables().offered, quotedTables().added.map((t) => t.plugin)]).toEqual([[], ["Far, here"]]);
    registerKinds([]);
  });

  it("of the plugins Meno knows of, name for each output a plugin added does not read the plugins that read it", () => {
    registerKinds([], MANIFESTS);
    const quanta = offeredKinds(MANIFESTS, []).find((k) => k.id === "quanta");
    expect(quanta?.suggest).toEqual(["quanta", "manyread"]);
    for (const id of quanta!.suggest!) expect(MANIFESTS.find((m) => m.id === id)?.reads).toContain("quanta");
    registerKinds([]);
  });
});

describe("a program's lines and tables of atoms, as papers quote them", () => {
  it("are those of the plugins added, read; and of those only offered, each with its plugin's name - to say whose a table is", () => {
    const orbitron = MANIFESTS.find((m) => m.id === "orbitron")!;
    const quanta = MANIFESTS.find((m) => m.id === "quanta")!;
    registerKinds([quanta], [orbitron, quanta]);
    expect(quotedEnergies().map((q) => q.id)).toEqual(["total-energy"]);
    expect(quotedTables().added).toEqual([]);
    expect(quotedTables().offered.map((t) => [t.id, t.plugin])).toEqual([["frame", orbitron.name]]);
    registerKinds([orbitron, quanta], [orbitron, quanta]);
    expect(quotedEnergies().map((q) => q.id)).toEqual(["scf-final", "total-energy"]);
    expect(quotedTables().added.map((t) => t.plugin)).toEqual([orbitron.name]);
    expect(quotedTables().offered).toEqual([]);
    registerKinds([]);
    expect([quotedEnergies(), quotedTables()]).toEqual([[], { added: [], offered: [] }]);
  });
});
