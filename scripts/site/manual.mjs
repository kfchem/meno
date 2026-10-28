// Builds Meno's manual for GitHub Pages from its sources (site/manual/,
// docs/MANUAL.md): each page a Markdown file in English and another in
// Japanese, made into HTML in the website's own look, with a switch between
// the two languages. The manual's front door (/manual/) sends a reader on to
// their language: the one they chose before, else their browser's.
//
//   node scripts/site/manual.mjs <manual sources> <out dir>
//
// The pages are written in a small Markdown (`parsePage`), and anything
// outside it is refused, so that they stay plain and alike. Refused as well:
// a page one language has and the other has not, sections that differ between
// the two, a link to nothing, and a character that shows differently from one
// system to another. The website's tests build the real sources the same way
// (manual.test.mjs), so a page that would be refused here fails there first.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Where the website is published. */
export const SITE_URL = "https://kfchem.github.io/meno/";
/** Where a reader's choice of language is kept: written by manual.js, read by the front door. */
export const LANGUAGE_KEY = "meno-manual-language";
/** The files beside the pages, copied as they are. */
export const ASSETS = ["manual.css", "manual.js"];

/**
 * Characters that show differently, or not at all, from one system to
 * another: circled and parenthesised numbers and letters, Roman numerals as
 * one character, the squared units and enclosed signs of Japanese fonts, and
 * half-width katakana.
 */
const UNSTABLE = /[\u2160-\u217f\u2460-\u24ff\u2776-\u2793\u3200-\u33ff\uff61-\uff9f]/u;
/** Japanese and Chinese characters and their punctuation: a line broken between two of them joins up with no space. */
const WIDE = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff01-\uff60]/u;

const escape = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** HTML's words alone, for a title or a description. */
const plain = (html) => html.replace(/<[^>]+>/g, "");

function fail(at, message) {
  throw new Error(`${at}: ${message}`);
}

/** The lines of a paragraph or an item as one: a space between them, none between two wide characters. */
function joinLines(lines) {
  return lines.reduce((out, line) => (WIDE.test(out.at(-1)) && WIDE.test(line[0]) ? out + line : `${out} ${line}`));
}

/** *Italic* (the names of things on screen) and **bold**; a lone `*` is refused, and so is HTML. */
function emphasis(text, at) {
  if (/<[a-z/!]/i.test(text)) fail(at, "HTML is not in the manual's Markdown");
  const out = escape(text)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>");
  if (out.includes("*")) fail(at, "a * with none to close it");
  if (out.includes("](")) fail(at, "a link the manual's Markdown does not read");
  return out;
}

/** Links, `[words](target)`, the target made a link by `link`; the rest emphasis. */
function prose(text, at, link) {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    out += emphasis(text.slice(last, m.index), at);
    out += `<a href="${escape(link(m[2], at))}">${emphasis(m[1], at)}</a>`;
    last = m.index + m[0].length;
  }
  return out + emphasis(text.slice(last), at);
}

/** A line's words as HTML: `code` shown as it is, the rest prose. */
export function inline(text, at, link = (target) => target) {
  const parts = text.split("`");
  if (parts.length % 2 === 0) fail(at, "a ` with none to close it");
  return parts.map((p, i) => (i % 2 ? `<code>${escape(p)}</code>` : prose(p, at, link))).join("");
}

/** The lines between blank lines, each run with the number of its first line. */
function blocks(source, where) {
  const out = [];
  let run = null;
  source.split("\n").forEach((text, i) => {
    if (text.includes("\t")) fail(`${where}:${i + 1}`, "a tab: indent with spaces");
    if (text.trim() === "") {
      run = null;
      return;
    }
    if (!run) out.push((run = { line: i + 1, lines: [] }));
    run.lines.push(text.trimEnd());
  });
  return out;
}

/** A list, `- ` or `1. ` at each item, a line carried on indented by two spaces or more. */
function list(block, where, link) {
  const ordered = /^\d+\. /.test(block.lines[0]);
  const marker = ordered ? /^(\d+)\. / : /^- /;
  const items = [];
  block.lines.forEach((text, i) => {
    const at = `${where}:${block.line + i}`;
    const m = marker.exec(text);
    if (m) {
      if (ordered && Number(m[1]) !== items.length + 1) fail(at, `item ${items.length + 1} numbered ${m[1]}`);
      items.push({ at, lines: [text.slice(m[0].length)] });
    } else if (/^ {2,}\S/.test(text)) {
      items.at(-1).lines.push(text.trim());
    } else {
      fail(at, `a line in a list that neither begins an item (${ordered ? "1. 2. ..." : "- "}) nor carries one on, indented`);
    }
  });
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>\n${items.map((it) => `<li>${inline(joinLines(it.lines), it.at, link)}</li>`).join("\n")}\n</${tag}>`;
}

/**
 * A page's Markdown made into HTML. What the manual's Markdown is:
 *
 * - the page's title, `# Title`, first and once;
 * - sections, `## Heading {#id}` and `### Heading {#id}`, each with the id
 *   it is linked to by - the same in both languages, so that the switch
 *   between them keeps the reader's place;
 * - paragraphs, lists (`- ` or `1. ` at each item, a line carried on
 *   indented by two spaces or more) and notes (`> ` at each line), each
 *   block between blank lines;
 * - within them, `code`, *italic* for the names of things on screen,
 *   **bold**, and links: `[words](https://...)`, to another page of the
 *   manual by its name and a section if wanted (`installing#mac`), to a
 *   section of this page (`#mac`), and to the website (`/`, `/#download`).
 *
 * The first paragraph says what the page is about: it stands out under the
 * title and is the page's description. `link(target, at)` gives a link's
 * href, refusing it where it leads nowhere.
 */
export function parsePage(source, where, link = (target) => target) {
  const unstable = source.split("\n").findIndex((line) => UNSTABLE.test(line));
  if (unstable >= 0) {
    const c = source.split("\n")[unstable].match(UNSTABLE)[0];
    fail(`${where}:${unstable + 1}`, `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")} shows differently from one system to another`);
  }
  let title;
  let description = "";
  const headings = [];
  const html = [];
  for (const block of blocks(source, where)) {
    const first = block.lines[0];
    const at = `${where}:${block.line}`;
    let m;
    if (first.startsWith("# ")) {
      if (title !== undefined || html.length) fail(at, "a page has one title, first");
      if (block.lines.length > 1) fail(at, "a title is a line of its own");
      title = inline(first.slice(2).trim(), at, link);
      continue;
    }
    if (title === undefined) fail(at, "a page begins with its title: # ...");
    if ((m = /^(#{2,3}) (.+?) \{#([a-z0-9-]+)\}$/.exec(first))) {
      if (block.lines.length > 1) fail(at, "a heading is a line of its own");
      const level = m[1].length;
      const text = inline(m[2], at, link);
      if (headings.some((h) => h.id === m[3])) fail(at, `a second section #${m[3]}`);
      headings.push({ level, id: m[3], text });
      html.push(`<h${level} id="${m[3]}">${text}</h${level}>`);
    } else if (first.startsWith("#")) {
      fail(at, "a heading is ## or ###, with its {#id} after it");
    } else if (/^(- |\d+\. )/.test(first)) {
      html.push(list(block, where, link));
    } else if (first.startsWith(">")) {
      block.lines.forEach((text, i) => {
        if (!text.startsWith("> ")) fail(`${where}:${block.line + i}`, "each line of a note begins > ");
      });
      html.push(`<aside class="note"><p>${inline(joinLines(block.lines.map((t) => t.slice(2))), at, link)}</p></aside>`);
    } else {
      block.lines.forEach((text, i) => {
        if (/^(\s|#|- |\d+\. |> |```|~~~|<|\||\* |\+ |---|___|!\[)/.test(text)) {
          fail(`${where}:${block.line + i}`, i === 0 ? "not in the manual's Markdown" : "a heading, list or note begins after a blank line");
        }
      });
      const p = inline(joinLines(block.lines), at, link);
      if (!description) {
        description = plain(p);
        html.push(`<p class="lead">${p}</p>`);
      } else html.push(`<p>${p}</p>`);
    }
  }
  if (title === undefined) fail(`${where}:1`, "a page begins with its title: # ...");
  return { title, description, headings, html: html.join("\n") };
}

/** Which language to open the manual in: the one chosen before, else the first of the browser's the manual has, else the first the manual has. */
export function pickLanguage(chosen, preferred, languages) {
  if (languages.includes(chosen)) return chosen;
  for (const tag of preferred) {
    const language = String(tag).toLowerCase().split("-")[0];
    if (languages.includes(language)) return language;
  }
  return languages[0];
}

/** The ids of a page's elements, for links to the website. */
function idsOf(html) {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
}

/**
 * The manual's sources as they are on disk: contents.json - its languages,
 * its pages in order, and the words of the pages' frame in each language -
 * and pages/<language>/<page>.md, with index.md for the contents. The
 * website's own page beside them, if there, for the links into it.
 */
export function readManual(dir) {
  const contents = JSON.parse(readFileSync(join(dir, "contents.json"), "utf8"));
  const sources = {};
  for (const language of contents.languages) {
    const folder = join(dir, "pages", language);
    const there = readdirSync(folder).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
    sources[language] = Object.fromEntries(there.map((page) => [page, readFileSync(join(folder, `${page}.md`), "utf8")]));
  }
  const landing = join(dir, "..", "index.html");
  return { contents, sources, landing: existsSync(landing) ? idsOf(readFileSync(landing, "utf8")) : null };
}

/**
 * The manual as files: its path within the manual's folder, and what it holds.
 * `contents` and `sources` as `readManual` gives them; `landing`, the ids of
 * the website's own page (null not to check links into it).
 */
export function buildManual({ contents, sources, landing = null }) {
  const { languages, pages, words } = contents;
  if (!languages?.length || !Array.isArray(pages) || !words) fail("contents.json", "it names the languages, the pages in order, and the words in each language");
  if (new Set(pages).size !== pages.length || pages.includes("index")) fail("contents.json", "each page named once, and none index");
  const all = ["index", ...pages];
  const keys = Object.keys(words[languages[0]] ?? {}).sort().join();
  for (const language of languages) {
    if (Object.keys(words[language] ?? {}).sort().join() !== keys) fail("contents.json", `the words for ${language} are not the same words as for ${languages[0]}`);
    for (const page of all) if (sources[language]?.[page] === undefined) fail(`pages/${language}/${page}.md`, `missing: ${page} is in the manual`);
    for (const page of Object.keys(sources[language])) if (!all.includes(page)) fail(`pages/${language}/${page}.md`, "not in contents.json");
  }

  // first the titles and sections of every page, then each page with its links followed
  const read = {};
  for (const language of languages) {
    read[language] = {};
    for (const page of all) read[language][page] = parsePage(sources[language][page], `pages/${language}/${page}.md`);
  }
  for (const page of all) {
    const outline = (language) => read[language][page].headings.map((h) => `${"#".repeat(h.level)} {#${h.id}}`).join("\n");
    for (const language of languages.slice(1)) {
      if (outline(language) !== outline(languages[0])) {
        fail(`pages/${language}/${page}.md`, `its sections are not those of pages/${languages[0]}/${page}.md, in the same order with the same ids:\n${outline(languages[0])}\n- against -\n${outline(language)}`);
      }
    }
  }
  const sections = (language, page) => new Set(read[language][page].headings.map((h) => h.id));

  const files = new Map();
  for (const language of languages) {
    for (const page of all) {
      // how far up the site, the manual and its language are from the page
      const toSite = page === "index" ? 2 : 3;
      const up = (n) => "../".repeat(n) || "./";
      const link = (target, at) => {
        let m;
        if (/^https:\/\/\S+$/.test(target)) return target;
        if ((m = /^#([a-z0-9-]+)$/.exec(target))) {
          if (!sections(language, page).has(m[1])) fail(at, `no section #${m[1]} on this page`);
          return target;
        }
        if ((m = /^\/(?:#([a-z0-9-]+))?$/.exec(target))) {
          if (m[1] && landing && !landing.has(m[1])) fail(at, `the website's page has no #${m[1]}`);
          return up(toSite) + (m[1] ? `#${m[1]}` : "");
        }
        if ((m = /^([a-z0-9-]+)(?:#([a-z0-9-]+))?$/.exec(target))) {
          if (!pages.includes(m[1])) fail(at, `no page ${m[1]} in the manual`);
          if (m[2] && !sections(language, m[1]).has(m[2])) fail(at, `no section #${m[2]} on ${m[1]}`);
          return `${up(toSite - 2)}${m[1]}/${m[2] ? `#${m[2]}` : ""}`;
        }
        fail(at, `a link to ${target}: the manual links to https://..., to its own pages by name (installing#mac), to sections of the page (#mac) and to the website (/, /#download)`);
      };
      const where = `pages/${language}/${page}.md`;
      const parsed = parsePage(sources[language][page], where, link);
      const footer = inline(words[language].footer, `contents.json (${language} footer)`, link);
      const html = pageHtml({ contents, language, page, parsed, titles: read, footer, toSite });
      files.set(page === "index" ? `${language}/index.html` : `${language}/${page}/index.html`, html);
    }
  }
  files.set("index.html", frontDoor(contents));
  return files;
}

/** The manual's front door: on to the reader's language, at once; both, without script. */
function frontDoor({ languages, pages, words }) {
  const alternates = languages.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE_URL}manual/${l}/">`);
  return `<!doctype html>
<html lang="${languages[0]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escape(words[languages[0]].title)}</title>
<meta name="color-scheme" content="light dark">
${alternates.join("\n")}
<link rel="alternate" hreflang="x-default" href="${SITE_URL}manual/">
<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="manual.css">
<script>
(() => {
  const pick = ${pickLanguage.toString()};
  let chosen = null;
  try { chosen = localStorage.getItem(${JSON.stringify(LANGUAGE_KEY)}); } catch { /* none kept */ }
  const language = pick(chosen, navigator.languages || [navigator.language || ""], ${JSON.stringify(languages)});
  const page = location.hash.slice(1);
  location.replace(language + "/" + (${JSON.stringify(pages)}.includes(page) ? page + "/" : ""));
})();
</script>
</head>
<body>
<main class="door">
${languages.map((l) => `  <a class="btn" href="${l}/" hreflang="${l}" lang="${l}" data-lang="${l}">${escape(words[l].title)}</a>`).join("\n")}
</main>
<script src="manual.js" defer></script>
</body>
</html>
`;
}

/** A page of the manual in its frame: the bar, the column of pages, the page, the way on, the footer. */
function pageHtml({ contents, language, page, parsed, titles, footer, toSite }) {
  const { languages, pages, words } = contents;
  const w = words[language];
  const site = "../".repeat(toSite);
  const manual = "../".repeat(toSite - 1);
  const home = "../".repeat(toSite - 2) || "./";
  const here = page === "index" ? "" : `${page}/`;
  const titleOf = (p) => titles[language][p].title;
  const title = page === "index" ? plain(parsed.title) : `${plain(parsed.title)} - ${escape(w.title)}`;
  const current = (yes) => (yes ? ' aria-current="page"' : "");

  const sections = parsed.headings.filter((h) => h.level === 2);
  const side = `<nav class="side" aria-label="${escape(w.contents)}">
  <a class="side-home" href="${home}"${current(page === "index")}>${escape(w.contents)}</a>
  <ol>
${pages
  .map((p) => {
    const inner = p === page && sections.length ? `\n      <ol class="here">\n${sections.map((h) => `        <li><a href="#${h.id}">${h.text}</a></li>`).join("\n")}\n      </ol>\n    ` : "";
    return `    <li><a href="${home}${p}/"${current(p === page)}>${titleOf(p)}</a>${inner}</li>`;
  })
  .join("\n")}
  </ol>
</nav>`;

  const switcher = `<nav class="languages" aria-label="${escape(w.languages)}">
${languages
  .map((l) => (l === language ? `      <span lang="${l}" aria-current="true">${escape(words[l].language)}</span>` : `      <a href="${manual}${l}/${here}" hreflang="${l}" lang="${l}" data-lang="${l}">${escape(words[l].language)}</a>`))
  .join("\n")}
    </nav>`;

  // the contents: every page, with what it is about
  const list =
    page === "index"
      ? `\n<ol class="sections">\n${pages.map((p) => `  <li><a href="${home}${p}/"><b>${titleOf(p)}</b><span>${titles[language][p].description}</span></a></li>`).join("\n")}\n</ol>`
      : "";

  // the way on, from a page: the one before it (the contents before the first) and the one after; the contents lead on by themselves
  const order = ["index", ...pages];
  const at = order.indexOf(page);
  const step = (p, cls, label) => `  <a class="${cls}" href="${p === "index" ? home : `${home}${p}/`}"><small>${escape(label)}</small>${p === "index" ? escape(w.contents) : titleOf(p)}</a>`;
  const way = page === "index" ? [] : [step(order[at - 1], "prev", w.previous), at < order.length - 1 && step(order[at + 1], "next", w.next)].filter(Boolean);
  const pager = way.length ? `\n<nav class="pager" aria-label="${escape(w.pager)}">\n${way.join("\n")}\n</nav>` : "";

  const alternates = languages.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE_URL}manual/${l}/${here}">`);
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${parsed.description}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6fafc" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e1217" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${SITE_URL}manual/${language}/${here}">
${alternates.join("\n")}
<link rel="alternate" hreflang="x-default" href="${SITE_URL}manual/${page === "index" ? "" : `${languages[0]}/${here}`}">
<link rel="icon" href="${site}assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="${site}assets/fonts/IBMPlexSans-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${manual}manual.css">
</head>
<body>
<a class="skip" href="#page">${escape(w.skip)}</a>
<div class="honeycomb" aria-hidden="true"></div>

<header class="top">
  <div class="wrap">
    <div class="names">
      <a class="brand" href="${site}" aria-label="Meno">
        <svg viewBox="0 0 2464 399" aria-hidden="true"><use href="${site}assets/wordmark.svg#mark"/></svg>
      </a>
      <a class="crumb" href="${home}">${escape(w.manual)}</a>
    </div>
    ${switcher}
  </div>
</header>

<div class="wrap layout">
${side}
<main id="page">
<article>
<h1>${parsed.title}</h1>
${parsed.html}${list}
</article>${pager}
</main>
</div>

<footer>
  <div class="wrap">
    <svg class="foot-mark" viewBox="0 0 2464 399" role="img" aria-label="Meno"><use href="${site}assets/wordmark.svg#mark"/></svg>
    <p>${footer}</p>
  </div>
</footer>

<script src="${manual}manual.js" defer></script>
</body>
</html>
`;
}

function main([sourceDir, outDir]) {
  if (!sourceDir || !outDir) {
    console.error("usage: node scripts/site/manual.mjs <manual sources> <out dir>");
    process.exit(1);
  }
  const files = buildManual(readManual(sourceDir));
  // (the folder as release.mjs copied it holds the sources: the manual replaces them)
  rmSync(outDir, { recursive: true, force: true });
  for (const [path, html] of files) {
    mkdirSync(dirname(join(outDir, path)), { recursive: true });
    writeFileSync(join(outDir, path), html);
  }
  for (const asset of ASSETS) cpSync(join(sourceDir, asset), join(outDir, asset));
  console.log(`${outDir}: ${files.size} pages`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
