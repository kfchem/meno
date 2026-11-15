import { describe, expect, it } from "vitest";
import { colouringFor, type Colouring } from "./colouring";
import { asksForCode, grammarParser } from "./grammars";
import { Lines } from "./editing";
import { registered } from "../io/kinds";
import { acceptManifest } from "../plugins/manifest";
import { MANIFESTS } from "../plugins/known";
import { measured } from "../../testing/timeouts";

/** The made-up test plugins, all added. */
const known = registered(MANIFESTS);

/**
 * The made-up programs' inputs' grammars, as these tests read them: each word a token of its own kind by what it begins
 * with, so that none takes another's place (a keyword, a setting's name, an element; a route's word, an element).
 */

/** A text's colouring, its grammar made: none where there is none. */
async function coloured(name: string, text: string): Promise<Colouring | null> {
  const c = colouringFor(name, text, known.kinds, known.texts);
  await c?.ready;
  return c;
}

/** The parts of a line coloured, as the words they colour. */
function toned(c: Colouring | null, text: string, line: number): [string, string][] {
  const lines = new Lines(text);
  const l = lines.line(line);
  return (c?.spans(lines, line) ?? []).map((s) => [l.slice(s.from, s.to), s.tone]);
}

/** The lines that hold something not as the grammar says - each with what is marked on it. */
function wrongs(c: Colouring | null, text: string): [number, string][] {
  const lines = new Lines(text);
  const out: [number, string][] = [];
  for (let i = 0; i < lines.count; i++) for (const w of c?.wrong(lines, i) ?? []) out.push([i, lines.line(i).slice(w.from, w.to)]);
  return out;
}

describe("a text's colours, by Lezer's grammars", () => {
  it("are a Python script's: keywords, strings, numbers, comments, what a definition names", async () => {
    const py = "def energy(x):\n    return 2.5 * x  # in hartree\nname = 'water'\n";
    const c = await coloured("run.py", py);
    expect(toned(c, py, 0)).toEqual([
      ["def", "keyword"],
      ["energy", "name"],
    ]);
    expect(toned(c, py, 1)).toEqual([
      ["return", "keyword"],
      ["2.5", "number"],
      ["# in hartree", "comment"],
    ]);
    expect(toned(c, py, 2)).toEqual([["'water'", "string"]]);
    expect(wrongs(c, py)).toEqual([]);
  });

  it("are JSON's and XML's - and what does not read as JSON is marked", async () => {
    const json = '{"charge": 0, "ok": true, "name": "w"}';
    expect(toned(await coloured("a.json", json), json, 0)).toEqual([
      ['"charge"', "property"],
      ["0", "number"],
      ['"ok"', "property"],
      ["true", "number"],
      ['"name"', "property"],
      ['"w"', "string"],
    ]);
    const xml = '<atom id="a1"/><!-- note -->';
    expect(toned(await coloured("a.xml", xml), xml, 0)).toEqual([
      ["atom", "tag"],
      ["id", "attribute"],
      ['"a1"', "string"],
      ["<!-- note -->", "comment"],
    ]);
    const broken = '{"charge": 0 "mult": 1}';
    expect(wrongs(await coloured("a.json", broken), broken).length).toBeGreaterThan(0);
  });

  it("are Markdown's: headings, code, addresses, its marks grey - its code in Python as Python's", async () => {
    const md = "# Rates *fast*\n\nSee `x` at <https://a.org>.\n\n- item\n\n```python\ndef f(): pass\n```\n";
    const c = await coloured("notes.md", md);
    expect(toned(c, md, 0)).toEqual([
      ["#", "comment"],
      [" Rates ", "name"],
      ["*", "comment"],
      ["fast", "name"],
      ["*", "comment"],
    ]);
    expect(toned(c, md, 2)).toEqual(expect.arrayContaining([["x", "string"], ["https://a.org", "property"]]));
    expect(toned(c, md, 4)).toEqual([["-", "comment"]]);
    const task = "- [x] done\n";
    expect(toned(await coloured("t.md", task), task, 0)).toEqual([
      ["-", "comment"],
      ["[x]", "comment"],
    ]);
    expect(toned(c, md, 7)).toEqual([
      ["def", "keyword"],
      ["f", "name"],
      ["pass", "keyword"],
    ]);
    expect(wrongs(c, md)).toEqual([]);
  });

  it("are a long text's as far as it is read, and again from where it changed", async () => {
    const rows = Array.from({ length: 40_000 }, (_, i) => `  {"step": ${i}, "energy": -76.4},`);
    const text = `[\n${rows.join("\n")}\n  {"step": -1}\n]\n`;
    const colouring = (await coloured("long.json", text))!;
    const lines = new Lines(text);
    expect(colouring.spans(lines, lines.count - 3).map((s) => s.tone)).toEqual(["property", "number"]);
    const typed = text.replace('"step": 0,', '"step": 0, "spin": "singlet",');
    const after = new Lines(typed);
    expect(colouring.spans(after, 1).map((s) => s.tone)).toEqual(["property", "number", "property", "string", "property", "number"]);
    expect(colouring.spans(after, after.count - 3).map((s) => s.tone)).toEqual(["property", "number"]);
  }, measured(340));
});

describe("a calculation's input, by its plugin's grammar", () => {
  // (the made-up Quanta's input: src/test/plugins/quanta/quanta-input.grammar)
  const quanta = [
    "; water, optimised",
    "# M1 DSP B-small Opt Vib",
    "@memory",
    "  cores 4",
    "  permb 3000",
    "@close",
    "@atoms",
    "  O   0.000000   0.000000   0.000000",
    "  H   0.000000   0.757000   0.587000",
    "@close",
    "",
  ].join("\n");

  it("is a program's input: keywords, sections and their settings, the atoms and their numbers", async () => {
    const c = await coloured("water.qin", quanta);
    expect(toned(c, quanta, 0)).toEqual([["; water, optimised", "comment"]]);
    expect(toned(c, quanta, 1).map((p) => p[1])).toEqual(["keyword", "keyword", "keyword", "keyword", "keyword"]);
    expect(toned(c, quanta, 2)).toEqual([["@memory", "keyword"]]);
    expect(toned(c, quanta, 3)).toEqual([
      ["cores", "property"],
      ["4", "number"],
    ]);
    expect(toned(c, quanta, 7)).toEqual([
      ["O", "tag"],
      ["0.000000", "number"],
      ["0.000000", "number"],
      ["0.000000", "number"],
    ]);
    expect(wrongs(c, quanta)).toEqual([]);
  });

  it("marks a section left open", async () => {
    const open = quanta.replace("@close\n@atoms", "@atoms");
    expect(wrongs(await coloured("water.qin", open), open).length).toBeGreaterThan(0);
    const unclosed = quanta.replace(/@close\n$/, "");
    expect(wrongs(await coloured("water.qin", unclosed), unclosed).length).toBeGreaterThan(0);
    // (a .qin that begins nothing as the program's does - another program's: not coloured as its)
    expect(colouringFor("other.qin", " $SETUP KIND=RHF $END\n", known.kinds, known.texts)).toBeNull();
  });

  it("is another's: its directives, the route, the title, the charge and multiplicity, the atoms - and marks one with no charge", async () => {
    // (the made-up Orbitron's input: src/test/plugins/orbitron/orbitron-input.grammar)
    const orb = '!checkpoint=water.ock\n> M2/B-mid Opt // tighter later\n"water"\n0 1\nO 0.0 0.0 0.0\nH 0.0 0.757 0.587\n\n';
    const c = await coloured("water.orb", orb);
    expect(toned(c, orb, 0)).toEqual([["!checkpoint=water.ock", "keyword"]]);
    expect(toned(c, orb, 1).map((p) => p[1])).toContain("comment");
    expect(toned(c, orb, 2)).toEqual([['"water"', "string"]]);
    expect(toned(c, orb, 3)).toEqual([
      ["0", "number"],
      ["1", "number"],
    ]);
    expect(toned(c, orb, 5)).toEqual([
      ["H", "tag"],
      ["0.0", "number"],
      ["0.757", "number"],
      ["0.587", "number"],
    ]);
    expect(wrongs(c, orb)).toEqual([]);
    const noCharge = '> M1/B-small\n"water"\nO 0.0 0.0 0.0\n\n';
    expect(wrongs(await coloured("water.orb", noCharge), noCharge).map(([line]) => line)).toContain(2);
  });
});

describe("a calculation's output, by its plugin's grammar", () => {
  it("is a program's: its headings, a run gone well, numbers - nothing marked", async () => {
    // (the made-up Orbitron's output: src/test/plugins/orbitron/orbitron-output.grammar)
    const log = [" Orbitron run begins, stage 0=orb26", " == Optimisation ==", " SCF Final:  E(M2) =  -115.717496310 after 10 cycles", " Orbitron run ends well"].join("\n");
    const c = await coloured("methanol.log", log);
    expect(toned(c, log, 1)).toEqual([["== Optimisation ==", "landmark"]]);
    expect(toned(c, log, 2)).toEqual([
      ["-115.717496310", "number"],
      ["10", "number"],
    ]);
    expect(toned(c, log, 3)).toEqual([["Orbitron run ends well", "success"]]);
    expect(wrongs(c, log)).toEqual([]);
  });

  it("is others': their faults, landmarks and numbers", async () => {
    const out = " ~ Q U A N T A ~\n== Energies ==\nTOTAL ENERGY       -76.408922\nFAULT: stopped in the SCF\n";
    const quanta = await coloured("water.out", out);
    expect(toned(quanta, out, 1)).toEqual([["== Energies ==", "landmark"]]);
    expect(toned(quanta, out, 2)).toEqual([["-76.408922", "number"]]);
    expect(toned(quanta, out, 3)).toEqual([["FAULT: stopped in the SCF", "error"]]);
    const tb = "      == T I G H T B I N D ==\n   energy:  -5.070 Eh\nFAULT: no convergence\ntightbind is done\n";
    const t = await coloured("tb.out", tb);
    expect(toned(t, tb, 1)).toEqual([["-5.070", "number"]]);
    expect(toned(t, tb, 2)).toEqual([["FAULT: no convergence", "error"]]);
    expect(toned(t, tb, 3)).toEqual([["tightbind is done", "success"]]);
    expect(wrongs(t, tb)).toEqual([]);
  });
});

describe("a plugin's grammar", () => {
  it("is data: one asking for code is refused, one that does not read as a grammar comes to nothing", async () => {
    expect(asksForCode('@top T { a }\n@external tokens t from "./t" { a }')).toBe(true);
    expect(asksForCode('@top T { a }\n@tokens { a { "a" } }')).toBe(false);
    expect(await grammarParser('@top T { a }\n@external tokens t from "./t" { a }')).toBeNull();
    expect(await grammarParser("@top T { ")).toBeNull();
    expect(await grammarParser('@top T { A }\n@tokens { A { "a" } }')).not.toBeNull();
  });

  it("is declared as data: its file a name in the plugin's folder, its tones Meno's", () => {
    const m = acceptManifest({
      id: "demo",
      name: "Demo",
      version: "1",
      environment: "uv",
      reads: ["demo-out"],
      kinds: [
        { id: "demo-out", name: "Demo output", extensions: [".out"], marks: [{ text: "D E M O program" }], grammar: { file: "demo.grammar", tones: { Word: "value", Odd: "glow", "bad name": "keyword" } } },
        // (texts it colours: kinds it does not read)
        { id: "demo-in", name: "Demo input", extensions: [".din"], lines: ["!"], grammar: { file: "../outside.grammar", tones: { Word: "keyword" } } },
        { id: "demo-in2", name: "Demo input", extensions: [".din"], grammar: { file: "demo-in.grammar", tones: { Word: "keyword" } } },
      ],
    })!;
    expect(m.kinds[0].grammar).toEqual({ file: "demo.grammar", tones: { Word: "value" } });
    expect(m.kinds.filter((k) => k.grammar).map((k) => k.id)).toEqual(["demo-out", "demo-in2"]);
    expect(registered([m]).texts.map((t) => t.id)).toEqual(["demo-in2"]);
  });

  it("is the first of plugins' that bring a kind, unless one says its own program writes it", () => {
    const out = { id: "demo-out", name: "Demo output", extensions: [".out"], marks: [{ text: "D E M O program" }] };
    const bringing = (id: string, writtenBy?: string) =>
      acceptManifest({
        id,
        name: id,
        version: "1",
        environment: "uv",
        reads: ["demo-out"],
        kinds: [{ ...out, writtenBy, grammar: { file: `${id}.grammar`, tones: { Word: "value" } } }],
        steps: writtenBy ? [{ kinds: ["energy"], programs: [writtenBy] }] : [],
      })!;
    const grammarOf = (ms: ReturnType<typeof bringing>[]) => registered(ms).kinds.find((k) => k.id === "demo-out")?.grammar?.plugin;
    expect(grammarOf([bringing("first"), bringing("second")])).toBe("first");
    expect(grammarOf([bringing("first"), bringing("second", "demo")])).toBe("second");
  });

  it("is the plugin's whose own program writes the kind", () => {
    // (two programs' outputs, read by a reader of many as well: each its own program's plugin's, which says its program writes it)
    expect(known.kinds.find((k) => k.id === "quanta")?.grammar).toMatchObject({ plugin: "quanta", decl: { file: "quanta-output.grammar" } });
    expect(known.kinds.find((k) => k.id === "orbitron")?.grammar).toMatchObject({ plugin: "orbitron", decl: { file: "orbitron-output.grammar" } });
    expect(known.texts.map((t) => [t.id, t.grammar.plugin])).toEqual([
      ["orbitron-input", "orbitron"],
      ["quanta-input", "quanta"],
    ]);
  });
});
