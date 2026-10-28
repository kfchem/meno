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

/** A list, `- ` or `1. ` at each item, a line carried on indented by two spaces or more; an item may begin with its `{#id}`. */
function list(block, where, link, steps) {
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
  const li = items.map((it) => {
    const m = /^\{#([a-z0-9-]+)\} /.exec(it.lines[0]);
    const html = inline(joinLines(m ? [it.lines[0].slice(m[0].length), ...it.lines.slice(1)] : it.lines), it.at, link);
    if (!m) return `<li>${html}</li>`;
    if (steps.some((s) => s.id === m[1])) fail(it.at, `a second item {#${m[1]}}`);
    steps.push({ id: m[1], html });
    return `<li id="${m[1]}">${html}</li>`;
  });
  return `<${tag}>\n${li.join("\n")}\n</${tag}>`;
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
 * - an item of a list may begin with its `{#id}`: a how-to page's steps,
 *   each the step of its recording with that id;
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
  const steps = [];
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
      html.push(list(block, where, link, steps));
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
  return { title, description, headings, steps, html: html.join("\n") };
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
 * and pages/<language>/<page>.md, with index.md for the contents; and each
 * how-to page's folder, how-to/<page>/: its words in each language
 * (<language>.md), and what its recording wrote (steps.json, shots/). The
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
  const howTo = {};
  for (const page of contents.howTo ?? []) {
    const folder = join(dir, "how-to", page);
    const read = (file) => (existsSync(join(folder, file)) ? readFileSync(join(folder, file), "utf8") : undefined);
    const recorded = read("steps.json");
    howTo[page] = {
      words: Object.fromEntries(contents.languages.map((l) => [l, read(`${l}.md`)])),
      recorded: recorded === undefined ? undefined : JSON.parse(recorded),
      shots: existsSync(join(folder, "shots")) ? readdirSync(join(folder, "shots")).filter((f) => f.endsWith(".webp")) : [],
    };
  }
  const landing = join(dir, "..", "index.html");
  return { contents, sources, howTo, landing: existsSync(landing) ? idsOf(readFileSync(landing, "utf8")) : null };
}

/**
 * The manual as files: its path within the manual's folder, and what it holds.
 * `contents` and `sources` as `readManual` gives them; `landing`, the ids of
 * the website's own page (null not to check links into it).
 */
export function buildManual({ contents, sources, howTo = {}, landing = null }) {
  const { languages, pages, words } = contents;
  const tutorials = contents.howTo ?? [];
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

  // the how-to pages: each one's recording, and its words in each language, step by step the same
  for (const page of tutorials) {
    const t = howTo[page];
    const where = `how-to/${page}`;
    if (!/^[a-z0-9-]+$/.test(page) || all.includes(page) || page === "how-to") fail("contents.json", `how-to page ${page}: a name of its own, in a-z, 0-9 and -`);
    if (!t?.recorded) fail(`${where}/steps.json`, "missing: the page's recording (scripts/gui/run.ps1 -Tutorial)");
    const { steps, size, result } = t.recorded;
    if (!Array.isArray(steps) || !steps.length || !size?.width || !size?.height || !result) fail(`${where}/steps.json`, "its steps, the size of its shots and its result");
    for (const shot of [...steps.map((st) => st.shot), result]) if (!t.shots.includes(shot)) fail(`${where}/shots/${shot}`, "missing: steps.json names it");
    for (const shot of t.shots) if (![...steps.map((st) => st.shot), result].includes(shot)) fail(`${where}/shots/${shot}`, "not in steps.json");
    for (const language of languages) {
      if (t.words[language] === undefined) fail(`${where}/${language}.md`, `missing: ${page} is in the manual`);
      const parsed = parsePage(t.words[language], `${where}/${language}.md`);
      const ids = steps.map((st) => st.id);
      if (parsed.headings.length || !/^<p class="lead">.*<\/p>\n<ol>[\s\S]*<\/ol>$/.test(parsed.html)) {
        fail(`${where}/${language}.md`, "a how-to page is its title, a paragraph on what it makes, and its steps, numbered, each with its {#id}");
      }
      if (parsed.steps.map((st) => st.id).join() !== ids.join()) {
        fail(`${where}/${language}.md`, `its steps are not those recorded (steps.json), in the same order:\n${ids.join(" ")}\n- against -\n${parsed.steps.map((st) => st.id).join(" ")}`);
      }
    }
  }

  const files = new Map();
  for (const language of languages) {
    const pagesHere = [...all, ...(tutorials.length ? ["how-to", ...tutorials.map((t) => `how-to/${t}`)] : [])];
    for (const page of pagesHere) {
      // how far up the site, the manual and its language are from the page
      const toSite = page === "index" ? 2 : page.split("/").length + 2;
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
      const footer = inline(words[language].footer, `contents.json (${language} footer)`, link);
      let parsed;
      if (page === "how-to") parsed = gallery({ contents, language, howTo, link });
      else if (page.startsWith("how-to/")) parsed = tutorial({ contents, language, page: page.slice(7), t: howTo[page.slice(7)], link, toSite });
      else parsed = parsePage(sources[language][page], `pages/${language}/${page}.md`, link);
      const html = pageHtml({ contents, language, page, parsed, titles: read, howToTitles: tutorialTitles(howTo, language), footer, toSite });
      files.set(page === "index" ? `${language}/index.html` : `${language}/${page}/index.html`, html);
    }
  }
  // the pictures, the same for every language
  for (const page of tutorials) for (const shot of howTo[page].shots) files.set(`pictures/${page}/${shot}`, { copy: `how-to/${page}/shots/${shot}` });
  files.set("index.html", frontDoor(contents));
  return files;
}

/** Each how-to page's title in a language. */
function tutorialTitles(howTo, language) {
  return Object.fromEntries(Object.entries(howTo).map(([page, t]) => [page, parsePage(t.words[language] ?? "# ?", page).title]));
}

/** "{n} steps", the number put in. */
const fill = (words, values) => escape(words).replace(/\{(\w+)\}/g, (_, k) => escape(values[k] ?? ""));

/** The how-to pages' gallery: what each makes, as its result shows it. */
function gallery({ contents, language, howTo }) {
  const w = contents.words[language];
  const cards = (contents.howTo ?? []).map((page) => {
    const t = howTo[page];
    const { size } = t.recorded;
    const h = Math.round((1760 * size.height) / size.width);
    const title = parsePage(t.words[language], page).title;
    return `  <li><a href="./${page}/"><img src="../../pictures/${page}/${t.recorded.result}" width="1760" height="${h}" alt="" loading="lazy"><b>${title}</b><span>${fill(w.stepCount, { n: t.recorded.steps.length })}</span></a></li>`;
  });
  return {
    title: escape(w.howTo),
    description: escape(w.howToLead),
    headings: [],
    html: `<p class="lead">${escape(w.howToLead)}</p>\n<ol class="gallery">\n${cards.join("\n")}\n</ol>`,
  };
}

/**
 * The mark over a step's picture, in the picture's own pixels: Meno's guide
 * ring round the part a step is done at (two for a double click, filled for
 * a long press, a dot at its corner for a right click), a ring round a point
 * of the page, a path for a drag or a chain led; a key, under the picture.
 */
export function markSvg(mark, size) {
  const pad = 8;
  const part = mark.w > 0 || mark.h > 0;
  const ring = (grow = 0) =>
    part
      ? `<rect x="${mark.x - pad - grow}" y="${mark.y - pad - grow}" width="${mark.w + 2 * (pad + grow)}" height="${mark.h + 2 * (pad + grow)}" rx="${16 + grow}"/>`
      : `<circle cx="${mark.x}" cy="${mark.y}" r="${30 + grow}"/>`;
  let shape;
  switch (mark.kind) {
    case "click":
    case "type":
      shape = ring();
      break;
    case "doubleclick":
      shape = ring() + ring(16);
      break;
    case "longpress":
      shape = ring().replace("/>", ' class="held"/>');
      break;
    case "rightclick": {
      const [cx, cy] = part ? [mark.x + mark.w + pad, mark.y - pad] : [mark.x + 21, mark.y - 21];
      shape = `${ring()}<circle cx="${cx}" cy="${cy}" r="9" class="dot"/>`;
      break;
    }
    case "drag":
    case "trace": {
      const points = mark.path.map(([x, y]) => `${x},${y}`).join(" ");
      shape = `<circle cx="${mark.path[0][0]}" cy="${mark.path[0][1]}" r="10" class="dot"/><polyline points="${points}" marker-end="url(#head)"/>`;
      break;
    }
    default:
      return "";
  }
  const head = '<defs><marker id="head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="34" markerHeight="34" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 10 5 0 10z" class="tip"/></marker></defs>';
  return `<svg class="mark" viewBox="0 0 ${size.width} ${size.height}" aria-hidden="true">${mark.kind === "drag" || mark.kind === "trace" ? head : ""}<g class="halo">${shape}</g><g class="line">${shape}</g></svg>`;
}

/**
 * The part of a step's picture shown at first: the spot and what is round
 * it, larger than the whole window could be shown - its words readable - in
 * the window's own proportions, so that a click on it opens out to the whole
 * window without the page moving. Grown, where what is marked would not fit.
 */
export function cropAround(mark, size, share = 0.55) {
  // (the spot, and what tells where it is - the dialog it is in, its row's words - where the recording kept it)
  const near = mark.near ? [[mark.near[0], mark.near[1]], [mark.near[0] + mark.near[2], mark.near[1] + mark.near[3]]] : [];
  const xs = mark.path ? mark.path.map((p) => p[0]) : mark.w !== undefined ? [mark.x, mark.x + mark.w, ...near.map((p) => p[0])] : null;
  const ys = mark.path ? mark.path.map((p) => p[1]) : mark.h !== undefined ? [mark.y, mark.y + mark.h, ...near.map((p) => p[1])] : null;
  if (!xs || !ys) return { x: 0, y: 0, width: size.width, height: size.height };
  const pad = 60;
  const [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  const k = Math.min(1, Math.max(share, (x1 - x0) / size.width, (y1 - y0) / size.height));
  const width = Math.round(size.width * k);
  const height = Math.round(size.height * k);
  const clamp = (v, most) => Math.max(0, Math.min(most, Math.round(v)));
  return { x: clamp((x0 + x1) / 2 - width / 2, size.width - width), y: clamp((y0 + y1) / 2 - height / 2, size.height - height), width, height };
}

/** A how-to page: what it makes, what it needs, and its steps - each a picture with its spot marked, and its words. */
function tutorial({ contents, language, page, t, link }) {
  const w = contents.words[language];
  const parsed = parsePage(t.words[language], `how-to/${page}/${language}.md`, link);
  const { size, steps, result, needs, meno } = t.recorded;
  const pics = `../../../pictures/${page}/`;
  const h = Math.round((1760 * size.height) / size.width);
  const words = Object.fromEntries(parsed.steps.map((st) => [st.id, st.html]));
  const items = steps.map((st) => {
    const key = st.mark.kind === "key" ? `<kbd class="key">${escape(st.mark.text)}</kbd>` : "";
    const c = cropAround(st.mark, size);
    const pct = (v) => `${+v.toFixed(3)}%`;
    const place = `width:${pct((100 * size.width) / c.width)};left:${pct((-100 * c.x) / c.width)};top:${pct((-100 * c.y) / c.height)}`;
    return `<li id="${st.id}">\n  <p><span>${words[st.id]}</span></p>\n  <figure class="shot near" style="aspect-ratio:${size.width} / ${size.height}"><div class="view" style="${place}"><img src="${pics}${st.shot}" width="1760" height="${h}" alt="" loading="lazy">${markSvg(st.mark, size)}</div>${key}</figure>\n</li>`;
  });
  const need = needs?.length ? `\n<p class="needs"><span>${escape(w.needs)}</span> ${needs.map((n) => `<b>${escape(n)}</b>`).join(" ")}</p>` : "";
  return {
    title: parsed.title,
    description: parsed.description,
    headings: [],
    html: `<p class="lead">${parsed.html.match(/^<p class="lead">(.*)<\/p>/)[1]}</p>${need}\n<figure class="shot result"><img src="${pics}${result}" width="1760" height="${h}" alt=""></figure>\n<ol class="steps">\n${items.join("\n")}\n</ol>${meno ? `\n<p class="pictures">${fill(w.pictures, { version: meno })}</p>` : ""}`,
  };
}

/** The manual's front door: on to the reader's language, at once; both, without script. */
function frontDoor({ languages, pages, words, howTo }) {
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
  location.replace(language + "/" + (${JSON.stringify([...pages, ...(howTo?.length ? ["how-to"] : [])])}.includes(page) ? page + "/" : ""));
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
function pageHtml({ contents, language, page, parsed, titles, howToTitles, footer, toSite }) {
  const { languages, pages, words } = contents;
  const tutorials = contents.howTo ?? [];
  const isHowTo = page === "how-to" || page.startsWith("how-to/");
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
  </ol>${tutorials.length ? `\n  <a class="side-how" href="${home}how-to/"${current(isHowTo)}>${escape(w.howTo)}</a>` : ""}
</nav>`;

  const switcher = `<nav class="languages" aria-label="${escape(w.languages)}">
${languages
  .map((l) => (l === language ? `      <span lang="${l}" aria-current="true">${escape(words[l].language)}</span>` : `      <a href="${manual}${l}/${here}" hreflang="${l}" lang="${l}" data-lang="${l}">${escape(words[l].language)}</a>`))
  .join("\n")}
    </nav>`;

  // the contents: every page, with what it is about
  const howToCard = tutorials.length ? `\n  <li class="how"><a href="${home}how-to/"><b>${escape(w.howTo)}</b><span>${escape(w.howToLead)}</span></a></li>` : "";
  const list =
    page === "index"
      ? `\n<ol class="sections">${howToCard}\n${pages.map((p) => `  <li><a href="${home}${p}/"><b>${titleOf(p)}</b><span>${titles[language][p].description}</span></a></li>`).join("\n")}\n</ol>`
      : "";

  // the way on, from a page: the one before it (the contents before the first) and the one after; the contents lead on by themselves
  const order = ["index", ...pages];
  const at = order.indexOf(page);
  const step = (p, cls, label) => `  <a class="${cls}" href="${p === "index" ? home : `${home}${p}/`}"><small>${escape(label)}</small>${p === "index" ? escape(w.contents) : titleOf(p)}</a>`;
  // (a how-to page: back to them all, and on to the next)
  const howStep = (p, cls, label) => `  <a class="${cls}" href="${home}how-to/${p ? `${p}/` : ""}"><small>${escape(label)}</small>${p ? howToTitles[p] : escape(w.howTo)}</a>`;
  const next = tutorials[tutorials.indexOf(page.slice(7)) + 1];
  const way =
    page === "index" || page === "how-to"
      ? []
      : isHowTo
        ? [howStep(null, "prev", w.previous), next && howStep(next, "next", w.next)].filter(Boolean)
        : [step(order[at - 1], "prev", w.previous), at < order.length - 1 && step(order[at + 1], "next", w.next)].filter(Boolean);
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
<article${isHowTo ? ' class="how"' : ""}>
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
  for (const [path, what] of files) {
    mkdirSync(dirname(join(outDir, path)), { recursive: true });
    if (typeof what === "string") writeFileSync(join(outDir, path), what);
    else cpSync(join(sourceDir, what.copy), join(outDir, path));
  }
  for (const asset of ASSETS) cpSync(join(sourceDir, asset), join(outDir, asset));
  console.log(`${outDir}: ${[...files.values()].filter((f) => typeof f === "string").length} pages`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
