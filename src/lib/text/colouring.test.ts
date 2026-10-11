import { describe, expect, it } from "vitest";
import { colouringFor, type Colouring } from "./colouring";
import { asksForCode, grammarParser } from "./grammars";
import { Lines } from "./editing";
import { registered } from "../io/kinds";
import { acceptManifest } from "../plugins/manifest";
import { MANIFESTS } from "../plugins/known";

/** The plugins Meno carries, all added. */
const carried = registered(MANIFESTS);

/** A text's colouring, its grammar made: none where there is none. */
async function coloured(name: string, text: string): Promise<Colouring | null> {
  const c = colouringFor(name, text, carried.kinds, carried.texts);
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
  });
});

describe("a calculation's input, by its plugin's grammar", () => {
  const orca = [
    "# water, optimised",
    "! B3LYP D3BJ def2-SVP Opt Freq",
    "%maxcore 3000",
    "%pal nprocs 4 end",
    "%scf",
    "  MaxIter 200",
    "  SOSCF",
    "    start 0.002",
    "  end",
    "end",
    "* xyz 0 1",
    "O   0.000000   0.000000   0.000000",
    "H   0.000000   0.757000   0.587000",
    "*",
    "",
  ].join("\n");

  it("is an ORCA input's: keywords, blocks and their options, the geometry's atoms and numbers", async () => {
    const c = await coloured("water.inp", orca);
    expect(toned(c, orca, 0)).toEqual([["# water, optimised", "comment"]]);
    expect(toned(c, orca, 1).map((p) => p[1])).toEqual(["keyword", "keyword", "keyword", "keyword", "keyword"]);
    expect(toned(c, orca, 2)).toEqual([
      ["%maxcore", "keyword"],
      ["3000", "number"],
    ]);
    expect(toned(c, orca, 5)).toEqual([
      ["MaxIter", "property"],
      ["200", "number"],
    ]);
    expect(toned(c, orca, 11)).toEqual([
      ["O", "tag"],
      ["0.000000", "number"],
      ["0.000000", "number"],
      ["0.000000", "number"],
    ]);
    expect(wrongs(c, orca)).toEqual([]);
  });

  it("marks an ORCA input's block left open, and its geometry left unclosed", async () => {
    const open = orca.replace("    start 0.002\n  end\nend\n", "    start 0.002\n  end\n");
    expect(wrongs(await coloured("water.inp", open), open).map(([line]) => line)).toContain(9);
    const unclosed = orca.replace(/\*\n$/, "");
    expect(wrongs(await coloured("water.inp", unclosed), unclosed).length).toBeGreaterThan(0);
    // (an .inp that begins nothing as ORCA's does - another program's: not coloured as ORCA's)
    expect(colouringFor("other.inp", " $CONTRL SCFTYP=RHF $END\n", carried.kinds, carried.texts)).toBeNull();
  });

  it("is a Gaussian input's: Link 0, the route, the charge and multiplicity, the atoms - and marks one with no charge", async () => {
    const gjf = "%Chk=water.chk\n#p B3LYP/6-31G(d) Opt ! tighter later\n\nwater\n\n0 1\nO 0.0 0.0 0.0\nH 0.0 0.757 0.587\n\n";
    const c = await coloured("water.gjf", gjf);
    expect(toned(c, gjf, 0)).toEqual([["%Chk", "keyword"]]);
    expect(toned(c, gjf, 1)).toEqual([
      ["#p", "keyword"],
      ["B3LYP/6-31G(d)", "keyword"],
      ["Opt", "keyword"],
      ["! tighter later", "comment"],
    ]);
    expect(toned(c, gjf, 5)).toEqual([
      ["0", "number"],
      ["1", "number"],
    ]);
    expect(toned(c, gjf, 7)).toEqual([
      ["H", "tag"],
      ["0.0", "number"],
      ["0.757", "number"],
      ["0.587", "number"],
    ]);
    expect(wrongs(c, gjf)).toEqual([]);
    const noCharge = "#p HF/6-31G(d)\n\nwater\n\nO 0.0 0.0 0.0\n\n";
    expect(wrongs(await coloured("water.gjf", noCharge), noCharge).map(([line]) => line)).toContain(4);
  });
});

describe("a calculation's output, by its plugin's grammar", () => {
  it("is Gaussian's: what a reader looks for, a run gone well, a warning - nothing marked", async () => {
    const log = [
      " Entering Gaussian System, Link 0=g16",
      " Warning -- explicit consideration of degrees of freedom",
      " SCF Done:  E(RB3LYP) =  -115.717496310     A.U. after   10 cycles",
      " Maximum Force            0.000012     0.000450     YES",
      "    -- Stationary point found.",
      " Normal termination of Gaussian 16",
    ].join("\n");
    const c = await coloured("methanol.log", log);
    expect(toned(c, log, 1)).toEqual([["Warning -- explicit consideration of degrees of freedom", "warning"]]);
    expect(toned(c, log, 2)).toEqual([
      ["SCF Done:", "landmark"],
      ["-115.717496310", "number"],
      ["10", "number"],
    ]);
    expect(toned(c, log, 3).slice(-1)).toEqual([["YES", "success"]]);
    expect(toned(c, log, 4)).toEqual([
      ["--", "comment"],
      ["Stationary point found.", "success"],
    ]);
    expect(toned(c, log, 5)).toEqual([
      ["Normal termination of Gaussian", "success"],
      ["16", "number"],
    ]);
    expect(wrongs(c, log)).toEqual([]);
  });

  it("is ORCA's and xTB's: their errors, warnings and landmarks", async () => {
    const out = " * O R C A *\nFINAL SINGLE POINT ENERGY       -76.408922\nORCA finished by error termination in SCF\n";
    const orca = await coloured("water.out", out);
    expect(toned(orca, out, 1)).toEqual([
      ["FINAL SINGLE POINT ENERGY", "landmark"],
      ["-76.408922", "number"],
    ]);
    expect(toned(orca, out, 2)).toEqual([["ORCA finished by error termination in SCF", "error"]]);
    const xtb = "      | x T B |\n          | TOTAL ENERGY             -5.070 Eh   |\n[WARNING] Runtime exception occurred\nERROR STOP\n";
    const x = await coloured("xtb.out", xtb);
    expect(toned(x, xtb, 1).slice(0, 2)).toEqual([
      ["TOTAL ENERGY", "landmark"],
      ["-5.070", "number"],
    ]);
    expect(toned(x, xtb, 2)).toEqual([["[WARNING] Runtime exception occurred", "warning"]]);
    expect(toned(x, xtb, 3)).toEqual([["ERROR STOP", "error"]]);
    expect(wrongs(x, xtb)).toEqual([]);
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

  it("is the first of two plugins' that bring a kind: cclib's before PySCF's", () => {
    expect(carried.kinds.find((k) => k.id === "orca")?.grammar).toMatchObject({ plugin: "cclib", decl: { file: "orca-output.grammar" } });
    expect(carried.texts.map((t) => [t.id, t.grammar.plugin])).toEqual([
      ["gaussian-input", "gaussian"],
      ["orca-input", "orca"],
    ]);
  });
});
