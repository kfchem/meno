import { describe, expect, it } from "vitest";
import { entity, isMarkdown, readMarkdown, slugOf, type Block, type Run } from "./markdown";

const words = (runs: Run[]) => runs.map((r) => r.text).join("");
const first = (text: string) => readMarkdown(text).blocks[0];
const runsOf = (b: Block) => (b.kind === "paragraph" || b.kind === "heading" ? b.runs : []);

describe("a Markdown text read", () => {
  it("is told by its name", () => {
    expect(isMarkdown("README.md")).toBe(true);
    expect(isMarkdown("notes.Markdown")).toBe(true);
    expect(isMarkdown("notes.txt")).toBe(false);
  });

  it("has headings of six levels, ATX and setext, each named to be linked to, a name again numbered", () => {
    const b = readMarkdown("# One *two*\n\n## Three ##\n\nFour\n----\n\n# One two\n").blocks;
    expect(b.map((x) => (x.kind === "heading" ? [x.level, words(x.runs), x.slug] : x.kind))).toEqual([
      [1, "One two", "one-two"],
      [2, "Three", "three"],
      [2, "Four", "four"],
      [1, "One two", "one-two-1"],
    ]);
    expect(slugOf("Rates & yields (2026)")).toBe("rates--yields-2026");
    expect(slugOf("反応の条件")).toBe("反応の条件");
  });

  it("sets words strong, emphasised, struck through and as code, a line's end a space or a break", () => {
    const b = first("Some **bold *both*** and ~~gone~~ and ` co de ` and `` a`b ``\nnext  \nbroken\\\nagain");
    const runs = runsOf(b);
    expect(words(runs)).toBe("Some bold both and gone and co de and a`b next\nbroken\nagain");
    expect(runs.find((r) => r.text === "both")?.style).toEqual({ strong: true, em: true });
    expect(runs.find((r) => r.text === "gone")?.style).toEqual({ strike: true });
    expect(runs.find((r) => r.text === "co de")?.style).toEqual({ code: true });
    expect(runs.filter((r) => r.text === "\n")).toHaveLength(2);
  });

  it("reads links inline, by reference and bare, escapes and references, and leaves comments out", () => {
    const b = first('[Meno](https://example.org/a\\_b "t") [doc][r] [r] <https://x.org> www.y.org me@z.org \\*not\\* &amp; &#x3B1; &#0; <b>h</b><!-- c --><br>end\n\n[r]: <https://ref.org>');
    const runs = runsOf(b);
    expect(runs.find((r) => r.text === "Meno")?.style.link).toBe("https://example.org/a_b");
    expect(runs.find((r) => r.text === "doc")?.style.link).toBe("https://ref.org");
    expect(runs.find((r) => r.text === "r")?.style.link).toBe("https://ref.org");
    expect(runs.find((r) => r.text === "https://x.org")?.style.link).toBe("https://x.org");
    expect(runs.find((r) => r.text === "www.y.org")?.style.link).toBe("http://www.y.org");
    expect(runs.find((r) => r.text === "me@z.org")?.style.link).toBe("mailto:me@z.org");
    expect(words(runs)).toContain("*not* & α � <b>h</b>\nend");
    expect(runs.find((r) => r.text === "<b>")?.style).toEqual({ html: true });
    // (a reference to nothing: as written)
    expect(words(runsOf(first("[none] here")))).toBe("[none] here");
    // (the definition shows nothing)
    expect(readMarkdown("[r]: https://a.org\n").blocks).toEqual([]);
  });

  it("shows an image as its description, nothing fetched", () => {
    const runs = runsOf(first("![a *ring* drawn](ring.png) and ![](x.png)"));
    expect(runs.filter((r) => r.style.image).map((r) => r.text)).toEqual(["a ring drawn", "image"]);
  });

  it("has lists, ordered from their first number, tight or loose, with tasks", () => {
    const [a, b, c] = readMarkdown("- [ ] to do\n- [x] done\n  - inner\n\n3. three\n4. four\n\n<!-- -->\n\n* a\n\n* b\n").blocks;
    expect(a).toMatchObject({ kind: "list", ordered: false, tight: true });
    if (a.kind !== "list") throw new Error();
    expect(a.items.map((i) => i.task)).toEqual([false, true]);
    expect(words(runsOf(a.items[0].blocks[0]))).toBe("to do");
    expect(a.items[1].blocks[1]).toMatchObject({ kind: "list" });
    expect(b).toMatchObject({ kind: "list", ordered: true, start: 3, tight: true });
    expect(c).toMatchObject({ kind: "list", tight: false });
  });

  it("has block quotes, their lines' marks left out", () => {
    const q = first("> one\n> two\n>\n> three");
    expect(q.kind).toBe("quote");
    if (q.kind !== "quote") throw new Error();
    expect(q.blocks.map((x) => words(runsOf(x)))).toEqual(["one two", "three"]);
  });

  it("has code, its language named by its info string, its lines as they are, in lists and quotes too", () => {
    expect(first("```Python extra\nx = 1\n\n  y\n```")).toMatchObject({ kind: "code", lang: "python", text: "x = 1\n\n  y" });
    expect(first("    a\n      b")).toMatchObject({ kind: "code", lang: "", text: "a\n  b" });
    const list = first("- item\n\n  ```js\n  a\n    b\n  ```");
    if (list.kind !== "list") throw new Error();
    expect(list.items[0].blocks[1]).toMatchObject({ kind: "code", lang: "js", text: "a\n  b" });
    const quote = first("> ```\n> q1\n> q2\n> ```");
    if (quote.kind !== "quote") throw new Error();
    expect(quote.blocks[0]).toMatchObject({ kind: "code", text: "q1\nq2" });
  });

  it("has tables, their columns aligned as their delimiter row says, rows made as wide as the header", () => {
    const t = first("| a | b | c |\n|:-|-:|:-:|\n| 1 \\| x | 2 |\n| 3 | 4 | 5 | 6 |");
    if (t.kind !== "table") throw new Error();
    expect(t.align).toEqual(["left", "right", "center"]);
    expect(t.head.map(words)).toEqual(["a", "b", "c"]);
    expect(t.rows.map((r) => r.map(words))).toEqual([
      ["1 | x", "2", ""],
      ["3", "4", "5"],
    ]);
  });

  it("has rules, and HTML blocks as written", () => {
    const [r, h] = readMarkdown("***\n\n<div>\nblock\n</div>\n").blocks;
    expect(r).toMatchObject({ kind: "rule" });
    expect(h).toMatchObject({ kind: "html", text: "<div>\nblock\n</div>" });
  });

  it("reads references by number, and those it knows by name", () => {
    expect(entity("&#35;")).toBe("#");
    expect(entity("&#X22;")).toBe('"');
    expect(entity("&#1114112;")).toBe("�");
    expect(entity("&deg;")).toBe("°");
  });
});
