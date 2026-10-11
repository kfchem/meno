import { describe, expect, it } from "vitest";
import { readMarkdown } from "../../../lib/text/markdown";
import { BODY_PX, COLOURS, layOut, PAD_TOP, PAD_X, rowAt, type Measure } from "./markdownLayout";

/** Half the type's size a letter, a whole one for a Chinese or Japanese letter: near enough to lay out by. */
const measure: Measure = (text, font) => Array.from(text).reduce((w, ch) => w + (/[\u3000-\u9fff]/.test(ch) ? font.px : font.px * 0.5), 0);
const lay = (md: string, width = 400, colours = null as Parameters<typeof layOut>[3]) => layOut(readMarkdown(md).blocks, width, measure, colours);
const lines = (md: string, width = 400) =>
  lay(md, width)
    .rows.filter((r) => r.pieces.length)
    .map((r) => r.pieces.map((p) => p.text).join("|"));

describe("a Markdown text laid out", () => {
  it("breaks a paragraph's lines after words, as wide as the text, its spaces read but not drawn", () => {
    // (360 px across: 48 letters)
    const words = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda";
    const laid = lay(words);
    const rows = laid.rows.filter((r) => r.pieces.length);
    expect(rows.length).toBe(2);
    for (const r of rows) for (const p of r.pieces) expect(p.x + measure(p.text, p.font)).toBeLessThanOrEqual(400 - PAD_X + 1e-6);
    expect(rows[0].pieces[0].text.endsWith(" ")).toBe(false);
    expect(laid.plain).toBe(words);
    expect(rows[0].y).toBe(PAD_TOP);
  });

  it("breaks Japanese between its letters, never before a closing mark nor after an opening one", () => {
    const text = "これは化学反応の条件を書いた文書です。「試薬」は少なめに加え、温度は一定に保った。";
    const rows = lines(text, 2 * PAD_X + 10 * BODY_PX);
    expect(rows.join("")).toBe(text);
    for (const r of rows) {
      expect(r[0]).not.toMatch(/[、。」]/);
      expect(r[r.length - 1]).not.toBe("「");
    }
  });

  it("breaks a word wider than the text between its letters", () => {
    const rows = lines("x".repeat(100), 2 * PAD_X + 20 * (BODY_PX / 2));
    expect(rows.map((r) => r.length)).toEqual([20, 20, 20, 20, 20]);
  });

  it("sets headings larger, h1 and h2 with a rule under them, each to be gone to by its name", () => {
    const laid = lay("# Title\n\ntext\n\n### Small");
    const [h1, , h3] = laid.rows.filter((r) => r.pieces.length);
    expect(h1.pieces[0].font).toMatchObject({ px: 30, weight: 600 });
    expect(h3.pieces[0].font.px).toBeCloseTo(18.75);
    expect(laid.rows.some((r) => r.decos.some((d) => d.kind === "fill" && d.h === 1 && d.colour === COLOURS.line))).toBe(true);
    expect(laid.anchors.get("small")).toBe(h3.y);
    expect(rowAt(laid, h3.y + 1)).toBe(laid.rows.indexOf(h3));
  });

  it("sets strong, emphasised, code, links and struck words as they are marked", () => {
    const [row] = lay("**b** *i* `c` [l](https://a.org) ~~s~~").rows.filter((r) => r.pieces.length);
    const by = (t: string) => row.pieces.find((p) => p.text.trim() === t)!;
    expect(by("b").font.weight).toBe(600);
    expect(by("i").font.italic).toBe(true);
    expect(by("c").font.mono).toBe(true);
    expect(by("l")).toMatchObject({ link: "https://a.org", colour: COLOURS.link });
    expect(by("s").strike).toBe(true);
    // (code on its ground)
    expect(row.decos.some((d) => d.kind === "fill" && d.colour === COLOURS.codeInline)).toBe(true);
  });

  it("indents lists, marking each item by a disc, a ring deeper in, its number, or a task's box", () => {
    const laid = lay("- a\n  - b\n\n1. one\n2. two\n\n- [x] done");
    const rows = laid.rows.filter((r) => r.pieces.length || r.decos.length);
    expect(rows[0].decos[0]).toMatchObject({ kind: "disc" });
    expect(rows[1].decos[0]).toMatchObject({ kind: "ring" });
    expect(rows[1].pieces[0].x).toBeGreaterThan(rows[0].pieces[0].x);
    expect(rows[2].pieces.map((p) => p.text)).toEqual(["one", "1."]);
    expect(rows[4].decos[0]).toMatchObject({ kind: "check", checked: true });
    // (the number is not read with the words)
    expect(laid.plain).toBe("a\nb\none\ntwo\ndone");
  });

  it("lays quotes in grey beside a bar, code on its ground in its colours, its lines as they are", () => {
    const laid = lay("> quoted\n\n```py\nx = 1\n  y\n```", 400, (lang, text) => (lang === "py" ? text.split("\n").map((l) => (l.startsWith("x") ? [{ from: 0, to: 1, colour: "red" }] : [])) : null));
    const quote = laid.rows.find((r) => r.pieces[0]?.text === "quoted")!;
    expect(quote.pieces[0].colour).toBe(COLOURS.muted);
    expect(quote.decos[0]).toMatchObject({ kind: "fill", x: PAD_X, w: 4 });
    const code = laid.rows.filter((r) => r.pieces[0]?.font.mono);
    expect(code.map((r) => r.pieces.map((p) => p.text).join(""))).toEqual(["x = 1", "  y"]);
    expect(code[0].pieces[0]).toMatchObject({ text: "x", colour: "red" });
    expect(code[0].decos[0]).toMatchObject({ kind: "fill", colour: COLOURS.ground });
    expect(laid.plain).toBe("quoted\nx = 1\n  y");
  });

  it("lays tables in columns as wide as their cells, aligned as they say, shared out where too wide", () => {
    const laid = lay("| name | n |\n|:-|-:|\n| a | 1 |\n| bb | 22 |");
    const rows = laid.rows.filter((r) => r.pieces.length);
    expect(rows).toHaveLength(3);
    expect(rows[0].pieces[0].font.weight).toBe(600);
    // (right aligned: the shorter number further across)
    const one = rows[1].pieces.find((p) => p.text === "1")!;
    const two = rows[2].pieces.find((p) => p.text === "22")!;
    expect(one.x).toBeGreaterThan(two.x);
    expect(laid.plain).toBe("name\tn\na\t1\nbb\t22");
    const wide = lay(`| ${"word ".repeat(40)} | x |\n|-|-|\n| a | b |`, 300);
    for (const r of wide.rows) for (const p of r.pieces) expect(p.x + measure(p.text, p.font)).toBeLessThanOrEqual(300);
  });

  it("puts a rule between blocks, more room round it", () => {
    const laid = lay("a\n\n---\n\nb");
    const rule = laid.rows.find((r) => r.decos.some((d) => d.kind === "fill" && d.h === 4))!;
    const [a, b] = laid.rows.filter((r) => r.pieces.length);
    expect(rule.y - (a.y + a.h)).toBe(24);
    expect(b.y - (rule.y + rule.h)).toBe(24);
  });
});
