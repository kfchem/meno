import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ASSETS, buildManual, corners, cropAround, LANGUAGE_KEY, markSvg, parsePage, pickLanguage, readManual } from "./manual.mjs";

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

/** A how-to page's recording and words, as `readManual` gives them. */
function withHowTo(over = {}) {
  const m = manual();
  m.contents.howTo = ["film"];
  const more = { howTo: "How do I?", howToLead: "Pick one.", needs: "Needs", stepCount: "{n} steps", pictures: "Pictures from Meno {version}." };
  Object.assign(m.contents.words.en, more);
  Object.assign(m.contents.words.xx, more);
  const words = (title) => `# ${title}\n\nA film.\n\n1. {#settings} Click *Settings*.\n2. {#add} Press *Add*.\n`;
  m.howTo = {
    film: {
      words: { en: words("Film"), xx: words("Le film") },
      recorded: {
        meno: "0.1.20",
        size: { width: 2400, height: 1560 },
        needs: ["Blender"],
        steps: [
          { id: "settings", shot: "01-settings.webp", mark: { kind: "click", x: 2328, y: 12, w: 56, h: 56 } },
          { id: "add", shot: "02-add.webp", mark: { kind: "click", x: 2094, y: 740, w: 96, h: 58, near: [210, 698, 1980, 100] } },
        ],
        result: "result.webp",
      },
      shots: ["01-settings.webp", "02-add.webp", "result.webp"],
    },
    ...over,
  };
  return m;
}

describe("the how-to pages", () => {
  it("are a gallery and a page for each, in every language, and their pictures once for all", () => {
    const files = buildManual(withHowTo());
    for (const path of ["en/how-to/index.html", "en/how-to/film/index.html", "xx/how-to/film/index.html"]) expect(files.has(path)).toBe(true);
    expect(files.get("pictures/film/02-add.webp")).toEqual({ copy: "how-to/film/shots/02-add.webp" });
    const gallery = files.get("en/how-to/index.html");
    expect(gallery).toContain('<a href="./film/"><img src="../../pictures/film/result.webp"');
    expect(gallery).toContain("<b>Film</b><span>2 steps</span>");
  });

  it("put each step's words over its picture, its spot marked, and say what they need and which Meno the pictures are of", () => {
    const page = buildManual(withHowTo()).get("xx/how-to/film/index.html");
    expect(page).toContain('<li id="add">\n  <p><span>Press <i>Add</i>.</span></p>');
    expect(page).toContain('<img src="../../../pictures/film/02-add.webp"');
    expect(page).toContain('<rect x="2086" y="732" width="112" height="74" rx="16"/>');
    expect(page).toContain('<p class="needs"><span>Needs</span> <b>Blender</b></p>');
    expect(page).toContain("Pictures from Meno 0.1.20.");
  });

  it("refuse words whose steps are not the recording's, and a recording whose pictures are not there", () => {
    const off = withHowTo();
    off.howTo.film.words.xx = "# Le film\n\nUn film.\n\n1. {#add} Add.\n2. {#settings} Settings.\n";
    expect(() => buildManual(off)).toThrow(/how-to\/film\/xx\.md: its steps are not those recorded/);
    const loose = withHowTo();
    loose.howTo.film.words.en = "# Film\n\nA film.\n\n## More {#more}\n\n1. {#settings} S.\n2. {#add} A.\n";
    expect(() => buildManual(loose)).toThrow(/a how-to page is its title, a paragraph on what it makes, and its steps/);
    const lost = withHowTo();
    lost.howTo.film.shots = ["01-settings.webp", "result.webp"];
    expect(() => buildManual(lost)).toThrow(/how-to\/film\/shots\/02-add\.webp: missing/);
    const unrecorded = withHowTo();
    unrecorded.howTo.film.recorded = undefined;
    expect(() => buildManual(unrecorded)).toThrow(/how-to\/film\/steps\.json: missing/);
  });

  it("mark a click with Meno's ring, a double click with two, a point with a circle, a drag with a path to its head", () => {
    const size = { width: 2400, height: 1560 };
    expect(markSvg({ kind: "click", x: 100, y: 100, w: 50, h: 20 }, size)).toContain('<g class="line"><rect x="92" y="92" width="66" height="36" rx="16"/></g>');
    expect(markSvg({ kind: "doubleclick", x: 100, y: 100, w: 50, h: 20 }, size).match(/<rect/g)).toHaveLength(4);
    expect(markSvg({ kind: "rightclick", x: 600, y: 400, w: 0, h: 0 }, size)).toContain('<circle cx="600" cy="400" r="30"/><circle cx="621" cy="379" r="9" class="dot"/>');
    expect(markSvg({ kind: "trace", path: [[10, 10], [60, 40]] }, size)).toContain('<polyline points="10,10 60,40" marker-mid="url(#head)" marker-end="url(#head)"/>');
    expect(corners([[0, 0], [25, 0], [50, 0], [50, 25], [50, 50]])).toEqual([[0, 0], [50, 0], [50, 50]]);
    expect(markSvg({ kind: "key", text: "Enter" }, size)).toBe("");
  });

  it("show a step near its spot, with what tells where it is, in the window's proportions", () => {
    const size = { width: 2400, height: 1560 };
    expect(cropAround({ kind: "click", x: 2328, y: 12, w: 56, h: 56 }, size)).toEqual({ x: 1080, y: 0, width: 1320, height: 858 });
    const wide = cropAround({ kind: "click", x: 2094, y: 740, w: 96, h: 58, near: [210, 698, 1980, 100] }, size);
    expect(wide.x).toBeLessThanOrEqual(150);
    expect(wide.width / wide.height).toBeCloseTo(2400 / 1560, 2);
    expect(cropAround({ kind: "key", text: "Enter" }, size)).toEqual({ x: 0, y: 0, width: 2400, height: 1560 });
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
