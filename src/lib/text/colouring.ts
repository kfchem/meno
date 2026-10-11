/**
 * A text coloured by what it is (docs/PDF.md, *A text*), by a grammar:
 * a Python script, JSON, XML or Markdown by Lezer's (MIT) - Markdown's
 * code in Python, JSON or XML by theirs too; a calculation's input or
 * output by its plugin's (lib/plugins/manifest `GrammarDecl`), made into a
 * parser as it is first wanted (./grammars). Each is parsed as far as it is
 * read, and from where it was changed, the rest kept. Meno knows no
 * program's format of itself: its plugins' grammars say it.
 *
 * Each line's colours come as spans of it, each a tone (./tones); Meno
 * draws the tones (TextEditor/linePictures). What does not read as the
 * grammar says is marked, a line's parts at a time (`wrong`).
 */
import { TreeFragment, type Parser, type Tree } from "@lezer/common";
import { highlightTree, styleTags, Tag, tagHighlighter, tags as t, type Highlighter } from "@lezer/highlight";
import type { LRParser } from "@lezer/lr";
import { parser as pythonParser } from "@lezer/python";
import { parser as jsonParser } from "@lezer/json";
import { parser as xmlParser } from "@lezer/xml";
import { GFM, parseCode, parser as markdownParser } from "@lezer/markdown";
import { folded, holdsMark, type GrammarDecl } from "../plugins/manifest";
import { grammarText } from "../plugins/known";
import { extensionOf, kindOf, kinds, textKinds, type Kind, type PluginGrammar, type TextKind } from "../io/kinds";
import { grammarParser } from "./grammars";
import { isNumber, TONE_NAMES, type Tone } from "./tones";
import type { Lines } from "./editing";

export type { Tone };
/** A part of a line, in the line's offsets, and the tone it is drawn in. */
export type Span = { from: number; to: number; tone: Exclude<Tone, "value"> };
/** A part of a line that does not read as its grammar says, in the line's offsets: as wide as it is - none, where something is missing there. */
export type Wrong = { from: number; to: number };

/** A text's colouring: each line's spans, in order and apart, as the text is now; and where it does not read as it should. */
export interface Colouring {
  spans(lines: Lines, line: number): Span[];
  wrong(lines: Lines, line: number): Wrong[];
  /** Once its grammar has been made into a parser - at once, for Lezer's own. */
  readonly ready: Promise<void>;
}

/** How much further than the lines asked for a text is parsed at a time. */
const CHUNK = 128 * 1024;

/** The tones of Lezer's grammars' parts, each language's: a JSON object's keys, an XML element's names and attributes. */
const SHARED = [
  { tag: t.keyword, class: "keyword" },
  { tag: [t.string, t.character, t.attributeValue], class: "string" },
  { tag: [t.number, t.bool, t.null], class: "number" },
  { tag: t.comment, class: "comment" },
];
const PYTHON = tagHighlighter([...SHARED, { tag: [t.function(t.definition(t.variableName)), t.definition(t.className)], class: "name" }]);
const JSON_TONES = tagHighlighter([...SHARED, { tag: t.propertyName, class: "property" }]);
const XML = tagHighlighter([...SHARED, { tag: t.tagName, class: "tag" }, { tag: t.attributeName, class: "attribute" }]);
/**
 * Markdown's (docs/PDF.md, *Markdown*): its headings as what a definition
 * names, code as strings, addresses and labels as keys, its marks - a
 * heading's, a list's, a quote's, emphasis's, code's, a task's, a rule - grey; and
 * code in Python, JSON or XML as those are.
 */
const MARKDOWN = tagHighlighter([
  { tag: [t.processingInstruction, t.atom], class: "comment" },
  { tag: t.contentSeparator, class: "comment" },
  { tag: t.heading, class: "name" },
  { tag: t.monospace, class: "string" },
  { tag: [t.url, t.labelName], class: "property" },
  ...SHARED,
  { tag: [t.function(t.definition(t.variableName)), t.definition(t.className)], class: "name" },
  { tag: t.propertyName, class: "property" },
  { tag: t.tagName, class: "tag" },
  { tag: t.attributeName, class: "attribute" },
]);
/** Markdown's parser: CommonMark with GitHub's tables, task lists, strikethrough and autolinks; its code in Python, JSON or XML parsed as that. */
const MARKDOWN_PARSER = markdownParser.configure([
  ...GFM,
  parseCode({
    codeParser: (info) => {
      const lang = info.trim().split(/\s+/)[0].toLowerCase();
      return lang === "python" || lang === "py" ? pythonParser : lang === "json" ? jsonParser : lang === "xml" || lang === "svg" ? xmlParser : null;
    },
  }),
]);

/** A plugin's grammar's tones: a tag of Meno's for each, given to the parts the plugin names. */
const TONE_TAGS = Object.fromEntries(TONE_NAMES.map((n) => [n, Tag.define()])) as Record<Tone, Tag>;
const PLUGIN_TONES = tagHighlighter(TONE_NAMES.map((n) => ({ tag: TONE_TAGS[n], class: n })));

/** A plugin's grammar's parser, its parts given their tones. */
function withTones(parser: LRParser, tones: GrammarDecl["tones"]): Parser {
  return parser.configure({ props: [styleTags(Object.fromEntries(Object.entries(tones).map(([node, tone]) => [node, TONE_TAGS[tone]])))] });
}

/** A text coloured by a grammar: parsed as far as its lines are asked for, and again from where it changed. */
class GrammarColouring implements Colouring {
  private parser: Parser | null = null;
  private text: string | null = null;
  private tree: Tree | null = null;
  /** How far the tree reaches. */
  private upTo = 0;
  private fragments: readonly TreeFragment[] = [];
  readonly ready: Promise<void>;

  constructor(
    parser: Parser | Promise<Parser | null>,
    private readonly highlighter: Highlighter,
    onReady?: () => void,
    /** Whether a part takes its own tone over what it is in's - Markdown's marks in a heading - or the other way. */
    private readonly inner = false,
  ) {
    // (Lezer's own at once; a plugin's once it is made)
    if (!(parser instanceof Promise)) {
      this.parser = parser;
      this.ready = Promise.resolve();
      return;
    }
    this.ready = parser.then((p) => {
      this.parser = p;
      if (p) onReady?.();
    });
  }

  /** The text as it is now: what is the same at either end kept from the tree before. */
  private take(text: string): void {
    if (text === this.text) return;
    if (this.text != null && this.fragments.length) {
      const a = this.text;
      const most = Math.min(a.length, text.length);
      let s = 0;
      while (s < most && a.charCodeAt(s) === text.charCodeAt(s)) s++;
      let e = 0;
      while (e < most - s && a.charCodeAt(a.length - 1 - e) === text.charCodeAt(text.length - 1 - e)) e++;
      this.fragments = TreeFragment.applyChanges(this.fragments, [{ fromA: s, toA: a.length - e, fromB: s, toB: text.length - e }]);
    } else this.fragments = [];
    this.text = text;
    this.tree = null;
    this.upTo = 0;
  }

  /** The tree, reaching `pos` at least - none until the grammar is made. */
  private treeTo(lines: Lines, pos: number): Tree | null {
    if (!this.parser) return null;
    this.take(lines.text);
    const text = this.text!;
    if (this.tree && this.upTo >= Math.min(pos, text.length)) return this.tree;
    const want = Math.min(text.length, Math.max(pos, this.upTo) + CHUNK);
    const parse = this.parser.startParse(text, this.fragments);
    if (want < text.length) parse.stopAt(want);
    let tree: Tree | null = null;
    while (!(tree = parse.advance()));
    this.tree = tree;
    this.upTo = want;
    this.fragments = TreeFragment.addTree(tree, this.fragments, want < text.length);
    return tree;
  }

  spans(lines: Lines, line: number): Span[] {
    const from = lines.start(line);
    const to = lines.end(line);
    const tree = to > from ? this.treeTo(lines, to) : null;
    if (!tree) return [];
    const out: Span[] = [];
    highlightTree(
      tree,
      this.highlighter,
      (a, b, classes) => {
        const f = Math.max(a, from);
        const e = Math.min(b, to);
        if (e <= f) return;
        const all = classes.split(" ");
        const tone = (this.inner ? all[all.length - 1] : all[0]) as Tone;
        // (a value: a number where it is one, else as it is)
        if (tone === "value") {
          if (isNumber(lines.text.slice(f, e))) out.push({ from: f - from, to: e - from, tone: "number" });
        } else out.push({ from: f - from, to: e - from, tone });
      },
      from,
      to,
    );
    return out;
  }

  wrong(lines: Lines, line: number): Wrong[] {
    const from = lines.start(line);
    const to = lines.end(line);
    const tree = this.treeTo(lines, to + 1);
    if (!tree) return [];
    const out: Wrong[] = [];
    tree.iterate({
      from,
      to: to + 1,
      enter: (n) => {
        if (!n.type.isError) return;
        // (on this line: what it covers of it - or where something is missing, its line's end included)
        if (n.from > to || (n.to < from && n.from < from)) return;
        const f = Math.max(n.from, from);
        const e = Math.min(n.to, to);
        if (f <= to && !out.some((w) => w.from === f - from && w.to === Math.max(f, e) - from)) out.push({ from: f - from, to: Math.max(f, e) - from });
      },
    });
    return out;
  }
}

// --- which ------------------------------------------------------------------

/** Lezer's grammars, by the names their files go by. */
const GRAMMARS: Record<string, { parser: Parser; highlighter: Highlighter; inner?: true }> = {
  ".py": { parser: pythonParser, highlighter: PYTHON },
  ".json": { parser: jsonParser, highlighter: JSON_TONES },
  ".xml": { parser: xmlParser, highlighter: XML },
  ".md": { parser: MARKDOWN_PARSER, highlighter: MARKDOWN, inner: true },
  ".markdown": { parser: MARKDOWN_PARSER, highlighter: MARKDOWN, inner: true },
};

/** How far into a text its lines are looked at, for what a kind of text's lines begin with. */
const HEAD = 4096;

/** A plugin's grammar's colouring: its grammar read from the plugin's folder, made into a parser - none, where there is none to read. */
function pluginColouring(g: PluginGrammar, grammarOf: (plugin: string, file: string) => string | undefined, onReady?: () => void): Colouring | null {
  const text = grammarOf(g.plugin, g.decl.file);
  if (text == null) return null;
  return new GrammarColouring(
    grammarParser(text).then((p) => p && withTones(p, g.decl.tones)),
    PLUGIN_TONES,
    onReady,
  );
}

/**
 * How a text is coloured: by Lezer's grammar, where its name says it is
 * Python, JSON or XML; else by the grammar of the kind it is told to be,
 * where a plugin added brings one - by what it holds (lib/io/kinds), as a
 * file is; or, a kind of text a plugin knows by name, by its name and what
 * its first lines begin with; else not at all. `onReady`, once a plugin's
 * grammar has been made into a parser.
 */
export function colouringFor(
  name: string,
  text: string,
  among: readonly Kind[] = kinds(),
  texts: readonly TextKind[] = textKinds(),
  onReady?: () => void,
  grammarOf: (plugin: string, file: string) => string | undefined = grammarText,
): Colouring | null {
  const ext = extensionOf(name);
  const lezer = GRAMMARS[ext];
  if (lezer) return new GrammarColouring(lezer.parser, lezer.highlighter, undefined, lezer.inner);
  const kind = kindOf(name, text, among);
  if (kind?.grammar) return pluginColouring(kind.grammar, grammarOf, onReady);
  if (!ext) return null;
  const head = folded(text.slice(0, HEAD).replace(/\r\n?/g, "\n"));
  const known = texts.find((k) => k.extensions.includes(ext) && (!k.marks.length || k.marks.some((m) => holdsMark(head, m))));
  return known ? pluginColouring(known.grammar, grammarOf, onReady) : null;
}
