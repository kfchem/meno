/**
 * A Markdown text, read for what it says (docs/PDF.md, *Markdown*): its
 * blocks - headings, paragraphs, lists, block quotes, code, tables, rules -
 * and, in each, its words with how they are set: strong, emphasised, struck
 * through, code, a link. As CommonMark 0.31.2 reads it, with GitHub's
 * tables, task lists, strikethrough and autolinks (GFM 0.29, its
 * extensions); the parsing is Lezer's (`@lezer/markdown`, MIT), what each
 * part means as the specifications say, each rule here citing its section.
 *
 * Nothing a text names is fetched: an image is its description, in a frame;
 * HTML is shown as it is written, its comments left out.
 */
import { GFM, parser as markdownParser } from "@lezer/markdown";
import type { SyntaxNode, Tree } from "@lezer/common";

/** How words are set: strong, emphasised, struck through, code; a link's address; HTML as written; an image's description. */
export type Style = { strong?: true; em?: true; strike?: true; code?: true; link?: string; html?: true; image?: true };
/** Words set one way, and where they begin in the text. A line's end that breaks it there (CommonMark 6.7) is a run of "\n". */
export type Run = { text: string; style: Style; src: number };
/** A table's column: where its cells lie in it (GFM 4.10). */
export type Align = "left" | "center" | "right" | null;

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; runs: Run[]; slug: string; src: number }
  | { kind: "paragraph"; runs: Run[]; src: number }
  | { kind: "code"; lang: string; text: string; src: number }
  | { kind: "html"; text: string; src: number }
  | { kind: "rule"; src: number }
  | { kind: "quote"; blocks: Block[]; src: number }
  | { kind: "list"; ordered: boolean; start: number; tight: boolean; items: Item[]; src: number }
  | { kind: "table"; align: Align[]; head: Run[][]; rows: Run[][][]; src: number };

/** A list's item: a task's, checked or not (GFM 5.3), or none; and its blocks. */
export type Item = { task: boolean | null; blocks: Block[]; src: number };

/** A Markdown text read. */
export type MarkdownDoc = { blocks: Block[] };

/** Whether a text's name says it is Markdown. */
export const isMarkdown = (name: string) => /\.(md|markdown)$/i.test(name);

const parser = markdownParser.configure(GFM);

/** A Markdown text read for what it says. */
export function readMarkdown(text: string): MarkdownDoc {
  const tree = parser.parse(text);
  const r = new Reader(text, tree);
  return { blocks: r.blocks(tree.topNode) };
}

/** The address a link's label stands for, as CommonMark 4.7 matches labels: case folded, its white space run together. */
const labelKey = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase().toUpperCase();

class Reader {
  /** The text's link reference definitions, the first of each label (CommonMark 4.7). */
  private refs = new Map<string, string>();
  /** The headings' names in the text so far: a name again is numbered. */
  private slugs = new Map<string, number>();

  constructor(
    private readonly text: string,
    tree: Tree,
  ) {
    tree.iterate({
      enter: (n) => {
        if (n.name !== "LinkReference") return n.name === "Document" || n.name === "Blockquote" || n.name.endsWith("List") || n.name === "ListItem";
        const label = n.node.getChild("LinkLabel");
        const url = n.node.getChild("URL");
        if (label && url) {
          const key = labelKey(this.slice(label).slice(1, -1));
          if (!this.refs.has(key)) this.refs.set(key, address(this.slice(url)));
        }
        return false;
      },
    });
  }

  private slice(n: { from: number; to: number }): string {
    return this.text.slice(n.from, n.to);
  }

  /** A container's blocks, in order. */
  blocks(parent: SyntaxNode): Block[] {
    const out: Block[] = [];
    for (let c = parent.firstChild; c; c = c.nextSibling) {
      const b = this.block(c);
      if (b) out.push(b);
    }
    return out;
  }

  private block(n: SyntaxNode): Block | null {
    const src = n.from;
    switch (n.name) {
      case "Paragraph":
        return { kind: "paragraph", runs: this.inline(n, n.from, n.to), src };
      case "ATXHeading1":
      case "ATXHeading2":
      case "ATXHeading3":
      case "ATXHeading4":
      case "ATXHeading5":
      case "ATXHeading6": {
        // (CommonMark 4.2: its words between its opening marks and any closing ones)
        const marks = n.getChildren("HeaderMark");
        const from = marks[0] && marks[0].from === n.from ? marks[0].to : n.from;
        const last = marks[marks.length - 1];
        const to = last && last.to === n.to && last !== marks[0] ? last.from : n.to;
        return this.heading(Number(n.name.slice(-1)) as 1 | 2 | 3 | 4 | 5 | 6, this.inline(n, from, to), src);
      }
      case "SetextHeading1":
      case "SetextHeading2": {
        // (CommonMark 4.3: its lines over the underline)
        const mark = n.getChild("HeaderMark");
        return this.heading(n.name.endsWith("1") ? 1 : 2, this.inline(n, n.from, mark ? mark.from : n.to), src);
      }
      case "FencedCode":
      case "CodeBlock": {
        // (CommonMark 4.5: the info string's first word names the language)
        const info = n.getChild("CodeInfo");
        return { kind: "code", lang: info ? this.slice(info).trim().split(/\s+/)[0].toLowerCase() : "", text: this.codeText(n), src };
      }
      case "HTMLBlock":
      case "ProcessingInstructionBlock":
        return { kind: "html", text: this.slice(n).replace(/\s+$/, ""), src };
      case "HorizontalRule":
        return { kind: "rule", src };
      case "Blockquote":
        return { kind: "quote", blocks: this.blocks(n), src };
      case "BulletList":
      case "OrderedList":
        return this.list(n);
      case "Table":
        return this.table(n);
      // (CommonMark 4.7: a link reference definition shows nothing; an HTML comment is not shown)
      default:
        return null;
    }
  }

  private heading(level: 1 | 2 | 3 | 4 | 5 | 6, runs: Run[], src: number): Block {
    const base = slugOf(runs.map((r) => r.text).join(""));
    const seen = this.slugs.get(base) ?? 0;
    this.slugs.set(base, seen + 1);
    return { kind: "heading", level, runs, slug: seen ? `${base}-${seen}` : base, src };
  }

  /** A code block's lines, as they are: each line's text where Lezer found it, the lines it found none on empty. */
  private codeText(n: SyntaxNode): string {
    const parts = n.getChildren("CodeText");
    if (!parts.length) return "";
    const lines: string[] = [];
    let line = 0;
    let prev = parts[0].from;
    for (const p of parts) {
      for (let i = prev; i < p.from; i++) if (this.text.charCodeAt(i) === 10) line++;
      const t = this.slice(p);
      lines[line] = (lines[line] ?? "") + t.replace(/\n$/, "");
      prev = p.from;
    }
    return Array.from(lines, (l) => l ?? "").join("\n");
  }

  private list(n: SyntaxNode): Block {
    const ordered = n.name === "OrderedList";
    const items = n.getChildren("ListItem");
    // (CommonMark 5.2: an ordered list starts at its first item's number)
    const mark = items[0]?.getChild("ListMark");
    const start = ordered && mark ? parseInt(this.slice(mark), 10) || 0 : 1;
    // (CommonMark 5.3: loose where its items are separated by a blank line, or an item holds two blocks with one between them)
    let tight = true;
    for (let i = 0; i + 1 < items.length && tight; i++) if (this.blankBetween(items[i].to, items[i + 1].from)) tight = false;
    for (const item of items) {
      if (!tight) break;
      const kids: SyntaxNode[] = [];
      for (let c = item.firstChild; c; c = c.nextSibling) if (c.name !== "ListMark") kids.push(c);
      for (let i = 0; i + 1 < kids.length; i++) if (this.blankBetween(kids[i].to, kids[i + 1].from)) tight = false;
    }
    return {
      kind: "list",
      ordered,
      start,
      tight,
      items: items.map((item) => {
        let task: boolean | null = null;
        const blocks: Block[] = [];
        for (let c = item.firstChild; c; c = c.nextSibling) {
          if (c.name === "Task") {
            // (GFM 5.3: a space between its brackets unchecked, any other letter checked)
            const marker = c.getChild("TaskMarker");
            task = !!marker && this.slice(marker).slice(1, -1).trim() !== "";
            blocks.push({ kind: "paragraph", runs: this.inline(c, marker ? marker.to : c.from, c.to), src: c.from });
          } else {
            const b = this.block(c);
            if (b) blocks.push(b);
          }
        }
        return { task, blocks, src: item.from };
      }),
      src: n.from,
    };
  }

  /** Whether a blank line lies between two places: a line holding nothing but white space and a quote's marks. */
  private blankBetween(from: number, to: number): boolean {
    const lines = this.text.slice(from, to).split("\n");
    return lines.slice(1, -1).some((l) => /^[\s>]*$/.test(l));
  }

  private table(n: SyntaxNode): Block {
    const header = n.getChild("TableHeader");
    const head = header ? header.getChildren("TableCell").map((c) => this.inline(c, c.from, c.to)) : [];
    // (GFM 4.10: the delimiter row's colons say where each column's cells lie)
    let delim: SyntaxNode | null = null;
    for (let c = n.firstChild; c; c = c.nextSibling) if (c.name === "TableDelimiter") delim = c;
    const cells = delim
      ? this.slice(delim)
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((s) => s.trim())
      : [];
    const align: Align[] = head.map((_, i) => {
      const d = cells[i] ?? "";
      const l = d.startsWith(":");
      const r = d.endsWith(":");
      return l && r ? "center" : r ? "right" : l ? "left" : null;
    });
    // (GFM 4.10: a row with fewer cells than the header has empty ones added, with more those over left out)
    const rows = n.getChildren("TableRow").map((row) => {
      const got = row.getChildren("TableCell").map((c) => this.inline(c, c.from, c.to));
      return head.map((_, i) => got[i] ?? []);
    });
    return { kind: "table", align, head, rows, src: n.from };
  }

  /**
   * The words of `n` between `from` and `to`, set as they are marked: a
   * line's end inside a paragraph a space (CommonMark 6.8), or a break
   * where it says (6.7); the white space a line begins and ends with, and a
   * quote's marks, left out (4.8).
   */
  inline(n: SyntaxNode, from: number, to: number): Run[] {
    const out: Run[] = [];
    const st = { lineStart: false };
    this.inlineInto(n, from, to, {}, out, st);
    // (the white space it ends with)
    while (out.length && !out[out.length - 1].style.code) {
      const last = out[out.length - 1];
      const t = last.text.replace(/[ \t]+$/, "");
      if (t) {
        last.text = t;
        break;
      }
      out.pop();
    }
    // (and begins with)
    while (out.length && !out[0].style.code) {
      const t = out[0].text.replace(/^[ \t]+/, "");
      if (t) {
        out[0] = { ...out[0], text: t };
        break;
      }
      out.shift();
    }
    return merged(out);
  }

  private inlineInto(n: SyntaxNode, from: number, to: number, style: Style, out: Run[], st: { lineStart: boolean }): void {
    let at = from;
    const plain = (a: number, b: number) => {
      if (b <= a) return;
      let s = this.text.slice(a, b);
      let src = a;
      // (a line's end: a space, the next line's white space left out)
      let t = "";
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === "\n") {
          t = t.replace(/[ \t]+$/, "") + " ";
          st.lineStart = true;
        } else if (st.lineStart && (ch === " " || ch === "\t")) {
          if (!t) src = a + i + 1;
        } else {
          st.lineStart = false;
          t += ch;
        }
      }
      s = t;
      if (s) out.push({ text: s, style, src });
    };
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.to <= from || c.from >= to) continue;
      plain(at, Math.max(at, c.from));
      at = Math.max(at, c.to);
      this.node(c, style, out, st);
    }
    plain(at, to);
  }

  private node(c: SyntaxNode, style: Style, out: Run[], st: { lineStart: boolean }): void {
    const src = c.from;
    const push = (text: string, s: Style = style) => {
      st.lineStart = false;
      if (text) out.push({ text, style: s, src });
    };
    switch (c.name) {
      case "Emphasis":
        return this.between(c, "EmphasisMark", { ...style, em: true }, out, st);
      case "StrongEmphasis":
        return this.between(c, "EmphasisMark", { ...style, strong: true }, out, st);
      case "Strikethrough":
        return this.between(c, "StrikethroughMark", { ...style, strike: true }, out, st);
      case "InlineCode": {
        // (CommonMark 6.1: its line ends spaces; a space at both ends, not all spaces, one taken off each)
        const marks = c.getChildren("CodeMark");
        let t = this.text.slice(marks[0]?.to ?? c.from, marks[1]?.from ?? c.to).replace(/\r?\n/g, " ");
        if (t.length > 2 && t.startsWith(" ") && t.endsWith(" ") && t.trim()) t = t.slice(1, -1);
        return push(t, { ...style, code: true });
      }
      case "Link":
      case "Image": {
        const marks = c.getChildren("LinkMark");
        const open = marks[0];
        const close = marks.find((m) => this.slice(m) === "]");
        const url = c.getChild("URL");
        const label = c.getChild("LinkLabel");
        let href: string | null = null;
        if (url) href = address(this.slice(url));
        else {
          // (CommonMark 6.3: a reference - full, collapsed or shortcut - to a definition)
          const name = label && this.slice(label) !== "[]" ? this.slice(label).slice(1, -1) : this.text.slice(open?.to ?? c.from, close?.from ?? c.to);
          href = this.refs.get(labelKey(name)) ?? null;
        }
        if (href == null) {
          // (no definition: not a link, as it is written)
          push(this.slice(c), style);
          return;
        }
        if (c.name === "Image") {
          // (CommonMark 6.4: its description's words alone)
          const words: Run[] = [];
          this.inlineInto(c, open?.to ?? c.from, close?.from ?? c.to, {}, words, st);
          return push(words.map((w) => w.text).join("") || "image", { ...style, image: true });
        }
        const inner: Run[] = [];
        this.inlineInto(c, open?.to ?? c.from, close?.from ?? c.to, { ...style, link: href }, inner, st);
        for (const r of inner) out.push(r);
        return;
      }
      case "Autolink": {
        // (CommonMark 6.5: an address, or an e-mail address mailto:)
        const url = c.getChild("URL");
        const t = url ? this.slice(url) : this.slice(c).slice(1, -1);
        return push(t, { ...style, link: /^[a-z][a-z0-9+.-]{1,31}:/i.test(t) ? t : `mailto:${t}` });
      }
      case "URL": {
        // (GFM 6.9: www. with http://, an e-mail address with mailto:)
        const t = this.slice(c);
        const href = /^www\./i.test(t) ? `http://${t}` : /^[a-z][a-z0-9+.-]{1,31}:/i.test(t) ? t : t.includes("@") ? `mailto:${t}` : t;
        return push(t, { ...style, link: style.link ?? href });
      }
      case "Escape":
        // (CommonMark 2.4: the punctuation as it is)
        return push(this.slice(c).slice(1));
      case "Entity":
        return push(entity(this.slice(c)));
      case "HardBreak":
        st.lineStart = true;
        out.push({ text: "\n", style: {}, src });
        return;
      case "HTMLTag": {
        // (shown as it is written; a line break where it says so)
        const t = this.slice(c);
        if (/^<br\s*\/?>$/i.test(t)) {
          st.lineStart = true;
          out.push({ text: "\n", style: {}, src });
          return;
        }
        return push(t, { ...style, html: true });
      }
      case "ProcessingInstruction":
        return push(this.slice(c), { ...style, html: true });
      // (a comment, a quote's mark: nothing)
      case "Comment":
      case "QuoteMark":
      case "EmphasisMark":
      case "LinkMark":
      case "CodeMark":
        return;
      default:
        return this.inlineInto(c, c.from, c.to, style, out, st);
    }
  }

  /** What lies between a span's marks, set as it says. */
  private between(c: SyntaxNode, mark: string, style: Style, out: Run[], st: { lineStart: boolean }): void {
    const marks = c.getChildren(mark);
    const first = marks[0];
    const last = marks[marks.length - 1];
    this.inlineInto(c, first && first.from === c.from ? first.to : c.from, last && last.to === c.to && last !== first ? last.from : c.to, style, out, st);
  }
}

/** Runs set alike next to one another, one. */
function merged(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && r.text !== "\n" && last.text !== "\n" && sameStyle(last.style, r.style)) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

const sameStyle = (a: Style, b: Style) =>
  a.strong === b.strong && a.em === b.em && a.strike === b.strike && a.code === b.code && a.link === b.link && a.html === b.html && a.image === b.image;

/** A link's address as written: its angle brackets off, escapes and references read (CommonMark 6.3, 2.4, 2.5). */
function address(raw: string): string {
  const t = raw.trim().replace(/^<([\s\S]*)>$/, "$1");
  return t.replace(/\\([!-/:-@[-`{-~])/g, "$1").replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g, (m) => entity(m));
}

/** The few named references read without a page to ask (in tests); in Meno, the page reads them all. */
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", copy: "\u00a9", reg: "\u00ae", deg: "\u00b0", plusmn: "\u00b1", times: "\u00d7", micro: "\u00b5", ndash: "\u2013", mdash: "\u2014", hellip: "\u2026", rarr: "\u2192", larr: "\u2190", harr: "\u2194", rlarr: "\u21c4" };

let decoder: HTMLTextAreaElement | null = null;

/**
 * An entity or a numeric character reference (CommonMark 2.5): a number,
 * decimal or hexadecimal, the letter it stands for - none, or one past the
 * last, U+FFFD; a name, HTML's letter for it, as the page reads it.
 */
export function entity(ref: string): string {
  const m = /^&#(?:([0-9]{1,7})|[xX]([0-9a-fA-F]{1,6}));$/.exec(ref);
  if (m) {
    const code = m[1] != null ? parseInt(m[1], 10) : parseInt(m[2], 16);
    return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? "\ufffd" : String.fromCodePoint(code);
  }
  const name = /^&([A-Za-z][A-Za-z0-9]{1,31});$/.exec(ref)?.[1];
  if (!name) return ref;
  if (NAMED[name]) return NAMED[name];
  if (typeof document === "undefined") return ref;
  decoder ??= document.createElement("textarea");
  decoder.innerHTML = `&${name};`;
  const t = decoder.value;
  return t === `&${name};` ? ref : t;
}

/** A heading's name in the text, to be linked to (`#name`): its words in small letters, spaces hyphens, punctuation left out - as GitHub names them. */
export function slugOf(words: string): string {
  return words
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
}
