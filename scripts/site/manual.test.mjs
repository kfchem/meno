import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ASSETS, buildManual, LANGUAGE_KEY, parsePage, pickLanguage, readManual } from "./manual.mjs";

const SOURCES = fileURLToPath(new URL("../../site/manual", import.meta.url));

// Japanese written as escapes, here as everywhere outside the manual's own pages
const A = "\u3042"; // a hiragana
const KA = "\u30ab"; // a katakana

/** A manual of two languages and two pages, as `readManual` gives one. */
function manual(over = {}) {
  const words = (language) => ({ language, title: `${language} manual`, manual: "Manual", contents: "Contents", languages: "Language", skip: "Skip", previous: "Previous", next: "Next", pager: "Pages", footer: "Free, at [GitHub](https://github.com/kfchem/meno)." });
  const page = (title) => `# ${title}\n\nWhat it is about.\n\n## One {#one}\n\nSee [two](two#two).\n\n## Two {#two}\n\nBack to [one](#one), or the [website](/#download).\n`;
  return {
    contents: { languages: ["en", "xx"], pages: ["one", "two"], words: { en: words("en"), xx: words("xx") } },
    sources: {
      en: { index: "# Manual\n\nAll of it.\n", one: page("One"), two: page("Two") },
      xx: { index: "# Manuel\n\nTout.\n", one: page("Un"), two: page("Deux") },
    },
    landing: new Set(["download"]),
    ...over,
  };
}

describe("a page of the manual", () => {
  it("has its title, its first paragraph standing out as what it is about, and its sections with their ids", () => {
    const page = parsePage("# Installing\n\nHow to put Meno\non a computer.\n\n## On a Mac {#mac}\n\nDrag it.\n\n### Once more {#again}\n\nOpen it.\n", "x.md");
    expect(page.title).toBe("Installing");
    expect(page.description).toBe("How to put Meno on a computer.");
    expect(page.headings).toEqual([
      { level: 2, id: "mac", text: "On a Mac" },
      { level: 3, id: "again", text: "Once more" },
    ]);
    expect(page.html).toBe('<p class="lead">How to put Meno on a computer.</p>\n<h2 id="mac">On a Mac</h2>\n<p>Drag it.</p>\n<h3 id="again">Once more</h3>\n<p>Open it.</p>');
  });

  it("joins Japanese broken over two lines with no space, and Latin words with one", () => {
    expect(parsePage(`# T\n\n${A}${A}\n${KA}${KA}\n`, "x.md").description).toBe(`${A}${A}${KA}${KA}`);
    expect(parsePage(`# T\n\nMeno\n${A}\n`, "x.md").description).toBe(`Meno ${A}`);
  });

  it("makes lists, numbered or not, with an item carried on over an indented line, and notes", () => {
    const page = parsePage("# T\n\nAbout.\n\n1. Open it.\n2. Choose *Open Anyway*\n   beside the line.\n\n- Mac\n- Windows\n\n> Only once.\n> Really.\n", "x.md");
    expect(page.html).toContain("<ol>\n<li>Open it.</li>\n<li>Choose <i>Open Anyway</i> beside the line.</li>\n</ol>");
    expect(page.html).toContain("<ul>\n<li>Mac</li>\n<li>Windows</li>\n</ul>");
    expect(page.html).toContain('<aside class="note"><p>Only once. Really.</p></aside>');
  });

  it("shows code as it is, and keeps what looks like HTML in it as text", () => {
    const page = parsePage("# T\n\nThe file `Meno_<version>_x64-setup.exe` *is* **it** & more.\n", "x.md");
    expect(page.html).toBe('<p class="lead">The file <code>Meno_&lt;version&gt;_x64-setup.exe</code> <i>is</i> <b>it</b> &amp; more.</p>');
  });

  it("refuses what is not in the manual's Markdown, saying where", () => {
    const refused = [
      ["About.\n\nSome <b>bold</b>.", /x\.md:5: HTML/],
      ["About.\n\n<p>A paragraph.</p>", /x\.md:5: not in the manual's Markdown/],
      ["About.\n\n| a | b |", /x\.md:5: not in the manual's Markdown/],
      ["About.\n\n```\ncode\n```", /x\.md:5: not in the manual's Markdown/],
      ["About.\n\n## No id", /a heading is ## or ###, with its \{#id\}/],
      ["About.\n\n#### Too deep {#deep}", /a heading is ## or ###/],
      ["About.\n\n1. One\n3. Three", /x\.md:6: item 2 numbered 3/],
      ["About.\n\n- One\nnot indented", /neither begins an item/],
      ["About.\nA list - here:\n- One", /x\.md:5: a heading, list or note begins after a blank line/],
      ["About *this.", /a \* with none to close it/],
      ["About `this.", /a ` with none to close it/],
      ["About.\n\n![a picture](p.png)", /not in the manual's Markdown/],
      ["Step \u2460 first.", /x\.md:3: U\+2460 shows differently/],
      ["Half-width \uff76.", /U\+FF76 shows differently/],
      ["About.\n\n\tTabbed.", /a tab/],
    ];
    for (const [body, error] of refused) expect(() => parsePage(`# T\n\n${body}\n`, "x.md"), body).toThrow(error);
    expect(() => parsePage("No title.\n", "x.md")).toThrow(/begins with its title/);
    expect(() => parsePage("# T\n\n# Again\n", "x.md")).toThrow(/one title, first/);
    expect(() => parsePage("# T\n\n## A {#a}\n\n## B {#a}\n", "x.md")).toThrow(/a second section #a/);
  });
});

describe("the manual, built", () => {
  it("is a front door, and every page in every language", () => {
    expect([...buildManual(manual()).keys()].sort()).toEqual(["en/index.html", "en/one/index.html", "en/two/index.html", "index.html", "xx/index.html", "xx/one/index.html", "xx/two/index.html"]);
  });

  it("links within the manual, to a section of the page, to the website and out of it", () => {
    const page = buildManual(manual()).get("en/one/index.html");
    expect(page).toContain('See <a href="../two/#two">two</a>.');
    expect(page).toContain('Back to <a href="#one">one</a>, or the <a href="../../../#download">website</a>.');
    expect(page).toContain('Free, at <a href="https://github.com/kfchem/meno">GitHub</a>.');
    const contents = buildManual(manual()).get("en/index.html");
    expect(contents).toContain('<a href="./one/"><b>One</b><span>What it is about.</span></a>');
  });

  it("switches language to the same page, and names the other language's page to search engines", () => {
    const page = buildManual(manual()).get("en/two/index.html");
    expect(page).toContain('<a href="../../xx/two/" hreflang="xx" lang="xx" data-lang="xx">xx</a>');
    expect(page).toContain('<span lang="en" aria-current="true">en</span>');
    expect(page).toContain('<link rel="alternate" hreflang="xx" href="https://kfchem.github.io/meno/manual/xx/two/">');
    expect(page).toContain('<html lang="en">');
  });

  it("leads on to the page before and the page after", () => {
    const page = buildManual(manual()).get("xx/one/index.html");
    expect(page).toContain('<a class="prev" href="../"><small>Previous</small>Contents</a>');
    expect(page).toContain('<a class="next" href="../two/"><small>Next</small>Deux</a>');
    expect(buildManual(manual()).get("xx/two/index.html")).not.toContain('class="next"');
    expect(buildManual(manual()).get("xx/index.html")).not.toContain('class="pager"');
  });

  it("refuses a link to nothing", () => {
    const bad = (text) => manual({ sources: { ...manual().sources, en: { ...manual().sources.en, two: `# Two\n\n${text}\n\n## One {#one}\n\n## Two {#two}\n` } } });
    expect(() => buildManual(bad("[x](three)"))).toThrow(/pages\/en\/two\.md:3: no page three/);
    expect(() => buildManual(bad("[x](one#three)"))).toThrow(/no section #three on one/);
    expect(() => buildManual(bad("[x](#three)"))).toThrow(/no section #three on this page/);
    expect(() => buildManual(bad("[x](/#nowhere)"))).toThrow(/the website's page has no #nowhere/);
    expect(() => buildManual(bad("[x](http://example.com)"))).toThrow(/a link to http:\/\/example\.com/);
    expect(() => buildManual(bad("[x](../one/)"))).toThrow(/a link to \.\.\/one\//);
  });

  it("refuses a page one language has and the other has not, and sections that differ between them", () => {
    const { xx } = manual().sources;
    expect(() => buildManual(manual({ sources: { ...manual().sources, xx: { index: xx.index, one: xx.one } } }))).toThrow(/pages\/xx\/two\.md: missing/);
    expect(() => buildManual(manual({ sources: { ...manual().sources, xx: { ...xx, three: "# Trois\n" } } }))).toThrow(/pages\/xx\/three\.md: not in contents\.json/);
    const swapped = "# Deux\n\nTout.\n\n## Deux {#two}\n\n## Un {#one}\n";
    expect(() => buildManual(manual({ sources: { ...manual().sources, xx: { ...xx, two: swapped } } }))).toThrow(/pages\/xx\/two\.md: its sections are not those of pages\/en\/two\.md/);
  });

  it("refuses words for the frame that one language lacks", () => {
    const m = manual();
    delete m.contents.words.xx.next;
    expect(() => buildManual(m)).toThrow(/the words for xx are not the same words as for en/);
  });
});

describe("the manual's front door", () => {
  it("opens the language chosen before, else the first of the browser's the manual has, else the first it has", () => {
    expect(pickLanguage("ja", ["en-GB"], ["en", "ja"])).toBe("ja");
    expect(pickLanguage(null, ["ja-JP", "en"], ["en", "ja"])).toBe("ja");
    expect(pickLanguage(null, ["fr-FR", "JA"], ["en", "ja"])).toBe("ja");
    expect(pickLanguage(null, ["en-US", "ja"], ["en", "ja"])).toBe("en");
    expect(pickLanguage("de", ["fr", "de"], ["en", "ja"])).toBe("en");
    expect(pickLanguage(null, [], ["en", "ja"])).toBe("en");
  });

  it("carries the same choice in its page, goes on to a page named after #, and offers every language without script", () => {
    const door = buildManual(manual()).get("index.html");
    expect(door).toContain(`const pick = ${pickLanguage.toString()};`);
    expect(door).toContain(`localStorage.getItem(${JSON.stringify(LANGUAGE_KEY)})`);
    expect(door).toContain('["one","two"].includes(page)');
    expect(door).toContain('<a class="btn" href="xx/" hreflang="xx" lang="xx" data-lang="xx">xx manual</a>');
  });
});

describe("the manual's own sources", () => {
  it("build, every page in both languages with the same sections, every link leading somewhere", () => {
    const files = buildManual(readManual(SOURCES));
    const { contents } = readManual(SOURCES);
    expect(contents.languages).toEqual(["en", "ja"]);
    for (const language of contents.languages) {
      expect(files.has(`${language}/index.html`)).toBe(true);
      for (const page of contents.pages) expect(files.has(`${language}/${page}/index.html`)).toBe(true);
    }
  });

  it("keep the reader's choice where the front door looks for it", () => {
    expect(ASSETS).toEqual(["manual.css", "manual.js"]);
    expect(readFileSync(`${SOURCES}/manual.js`, "utf8")).toContain(`localStorage.setItem(${JSON.stringify(LANGUAGE_KEY)}`);
  });
});
