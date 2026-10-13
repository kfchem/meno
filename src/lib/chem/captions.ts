/**
 * Words on the page - a reaction's reagents and conditions over its arrow,
 * or anything else (docs/EDITOR-2D.md, *Text*): set as the drawing sets a
 * label, a formula's counts low and a prefix's t- in italics, the rest as
 * typed; line under line, each centred - or to the left, to the right, or
 * spread to both edges, as it is set - broken into lines as wide as it is
 * made, where it is given a width; and, put near an arrow, set over it or
 * under it, clear of it, to go where it goes.
 */
import { italicUnits, labelUnits, unitRuns } from "./abbreviations";
import { ACS_LABEL_SET, labelBox, runsPlaces, runsWidth, type LabelSet, type TextItem, type TextRun } from "./layout2d";
import { wordsLine, type SchemeArrow } from "./reactionScheme";
import { letterStarts } from "../text/editing";
import type { ArrowCorner } from "./reactionArrow";

/** How far apart a caption's lines are, baseline to baseline, in ems. */
export const CAPTION_LINE = 1.25;

/**
 * The size words on the page are set at: their own, in points - a title's
 * 28, say (docs/EDITOR-2D.md, *Text*) - or, given none, the drawing's
 * labels' (`fontPx`, in the drawing's units, as `pointPx` is a point).
 */
export function wordsFontPx(c: { size?: number }, opts: { fontPx: number; pointPx?: number }): number {
  return c.size != null && c.size > 0 && opts.pointPx != null ? c.size * opts.pointPx : opts.fontPx;
}

/** The sizes words on the page are offered in, in points, and what each is for: the drawing's labels' (none of their own), a talk's text, its headings and its titles. */
export const WORDS_SIZES: readonly { name: string; pt: number | null }[] = [
  { name: "Label", pt: null },
  { name: "Text", pt: 14 },
  { name: "Heading", pt: 20 },
  { name: "Title", pt: 28 },
];
/** The least and the most a size of their own may be, in points. */
export const WORDS_SIZE_RANGE: readonly [number, number] = [4, 288];
/** The sizes Ctrl/Cmd+Shift+> and < go up and down through, in points. */
export const WORDS_STEPS: readonly number[] = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 44, 54, 66, 80, 96];

/**
 * A word of a caption as a formula is set (lib/chem/abbreviations
 * `labelRuns`): K2CO3 with its counts low, Pd2(dba)3 likewise, t-BuOK with
 * its t in italics, a sign at its end - NH4+ - a charge. A prefix is only
 * one at the word's start, or after a bracket: the o of co-solvent is no
 * ortho. Words with no letter in them - 60, +, (1:1) - stay as typed.
 */
function wordRuns(word: string): TextRun[] {
  if (!/\p{L}/u.test(word)) return [{ text: word }];
  const charge = /[a-zA-Z0-9)\]][+−-]$/.test(word) ? word.slice(-1) : null;
  const body = charge ? word.slice(0, -1) : word;
  const units = labelUnits(body);
  const italic = italicUnits(units).map((it, k) => it && (k === 0 || /[([,]$/.test(units[k - 1])));
  const runs = unitRuns(units, italic);
  if (charge) runs.push({ text: charge.replace("-", "−"), sup: true });
  return runs;
}

/**
 * How some of a caption's letters are set otherwise than the rest, as the
 * chemist marked them: bold, in italics, in a colour, raised or lowered
 * (docs/EDITOR-2D.md, *Text*). A formula's counts stay low, and its
 * prefixes in italics, whatever is marked.
 */
export type WordsStyle = { bold?: true; italic?: true; color?: string; script?: "sup" | "sub" };
/** Letters `[from, to)` of a caption's text set as `WordsStyle` says: a caption's marks, apart and in order. */
export type WordsMark = WordsStyle & { from: number; to: number };

const sameStyle = (a: WordsStyle | undefined, b: WordsStyle | undefined) =>
  !!a?.bold === !!b?.bold && !!a?.italic === !!b?.italic && (a?.color ?? null) === (b?.color ?? null) && (a?.script ?? null) === (b?.script ?? null);
const isPlain = (s: WordsStyle | undefined) => !s || (!s.bold && !s.italic && !s.color && !s.script);

/** Each letter's style, by its place in a text `length` letters long, as `marks` mark them. */
export function stylesOf(length: number, marks: readonly WordsMark[] | undefined): (WordsStyle | undefined)[] {
  const out: (WordsStyle | undefined)[] = new Array(length).fill(undefined);
  for (const m of marks ?? []) {
    const { from, to, ...style } = m;
    for (let i = Math.max(0, from); i < Math.min(length, to); i++) out[i] = { ...(out[i] ?? {}), ...style };
  }
  return out;
}

/** The marks that set letters as `styles` says: one for each run of letters set alike, and none for those set plainly. */
export function marksOf(styles: readonly (WordsStyle | undefined)[]): WordsMark[] {
  const out: WordsMark[] = [];
  for (let i = 0; i < styles.length; i++) {
    const st = styles[i];
    if (isPlain(st)) continue;
    const last = out[out.length - 1];
    if (last && last.to === i && sameStyle(last, st)) last.to = i + 1;
    else out.push({ from: i, to: i + 1, ...(st!.bold ? { bold: true } : {}), ...(st!.italic ? { italic: true } : {}), ...(st!.color ? { color: st!.color } : {}), ...(st!.script ? { script: st!.script } : {}) });
  }
  return out;
}

/** A style with one of its sides turned on or off - or, `color` null, its colour taken off. */
export type Restyle = { bold?: boolean; italic?: boolean; script?: "sup" | "sub" | null; color?: string | null };

/** `s` restyled as `r` says, none where nothing is left of it. */
export function restyled(s: WordsStyle | undefined, r: Restyle): WordsStyle | undefined {
  const out: WordsStyle = { ...(s ?? {}) };
  if (r.bold !== undefined) {
    if (r.bold) out.bold = true;
    else delete out.bold;
  }
  if (r.italic !== undefined) {
    if (r.italic) out.italic = true;
    else delete out.italic;
  }
  if (r.script !== undefined) {
    if (r.script) out.script = r.script;
    else delete out.script;
  }
  if (r.color !== undefined) {
    if (r.color) out.color = r.color;
    else delete out.color;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * What a toggle of `side` does to letters set as `styles` are: on, unless
 * every one of them has it already - then off. `script` toggles a raised
 * or lowered setting.
 */
export function toggled(styles: readonly (WordsStyle | undefined)[], side: "bold" | "italic" | "sup" | "sub"): Restyle {
  if (side === "sup" || side === "sub") return { script: styles.length && styles.every((s) => s?.script === side) ? null : side };
  return { [side]: !(styles.length && styles.every((s) => s?.[side])) };
}

/**
 * A line of a caption as the drawing sets it: each word as a formula is,
 * what is between them as typed - and, given each letter's style
 * (`styles`, by its place in the line), those letters set as they were
 * marked.
 */
export function captionRuns(line: string, styles?: readonly (WordsStyle | undefined)[], cut?: Cut): TextRun[] {
  const runs: TextRun[] = [];
  const push = (r: TextRun) => {
    const last = runs[runs.length - 1];
    if (
      last &&
      !!last.sub === !!r.sub &&
      !!last.sup === !!r.sup &&
      !!last.italic === !!r.italic &&
      !!last.bold === !!r.bold &&
      (last.color ?? null) === (r.color ?? null) &&
      !last.mark &&
      !r.mark
    )
      last.text += r.text;
    else runs.push({ ...r });
  };
  const formula: TextRun[] = [];
  const pieces = line.split(/([\s,;/]+)/);
  const isWord = (piece: string) => !!piece && !/^[\s,;/]+$/.test(piece);
  const firstWord = pieces.findIndex(isWord);
  const lastWord = pieces.length - 1 - [...pieces].reverse().findIndex(isWord);
  pieces.forEach((piece, k) => {
    if (!piece) return;
    // (what is left of a word broken on the line before, or the part of one broken after it: as typed, not read as a formula - its hyphen no charge, a locant no count)
    if (!isWord(piece) || (cut?.first && k === firstWord) || (cut?.last && k === lastWord)) formula.push({ text: piece });
    else formula.push(...wordRuns(piece));
  });
  if (!styles?.some((st) => !isPlain(st))) {
    for (const r of formula) push(r);
    return runs;
  }
  // (each run cut where the letters' styles change, each piece set as its letters were marked)
  let at = 0;
  for (const r of formula) {
    let k = 0;
    while (k < r.text.length) {
      const st = styles[at + k];
      let j = k + 1;
      while (j < r.text.length && sameStyle(styles[at + j], st)) j++;
      const raised = st?.script === "sup";
      const lowered = st?.script === "sub";
      push({
        ...r,
        text: r.text.slice(k, j),
        ...(raised ? { sup: true, sub: false } : lowered ? { sub: true, sup: false } : {}),
        ...(st?.italic ? { italic: true } : {}),
        ...(st?.bold ? { bold: true } : {}),
        ...(st?.color ? { color: st.color } : {}),
      });
      k = j;
    }
    at += r.text.length;
  }
  return runs;
}

/** A number - or a range - and a unit after one: kept together on a line, as 60 °C, 12 h, 2 equiv, 10 mol%, 0–25 °C are. */
const NUMBER = /^[−-]?\d+([.,]\d+)?([–-][−-]?\d+([.,]\d+)?)?$/;
const UNIT = /^(°\S*|[\p{L}%µ][\p{L}%µ]{0,4}[.,;)]?)$/u;

/** How a caption's lines lie in its width: to its left edge, about its middle, to its right edge, or spread to both - each line a typed line ends, to the left. */
export type CaptionAlign = "left" | "center" | "right" | "justify";

/**
 * A list's item: a typed line that begins - after a tab for each level it
 * is in - with a bullet or a number and a space (docs/EDITOR-2D.md,
 * *Text*). Its lines after the first hang under its words.
 */
const ITEM = /^(\t*)([•◦▪–]|\d{1,3}[.)])( +)/u;
/** How far in a level of a list is, in ems of the words. */
export const LIST_INDENT = 1.5;

/** A typed line's list item, if it is one: how many levels in, and how long its bullet or number is with the space after it. */
export function listItem(line: string): { level: number; mark: string; head: number } | null {
  const m = ITEM.exec(line);
  return m ? { level: m[1].length, mark: m[2], head: m[1].length + m[2].length + m[3].length } : null;
}

/**
 * A line of a caption as it is laid: its letters as they are set - its
 * words one space apart - each letter's place in the caption's text
 * (`src`), whether a typed line ends with it, and how far in from the
 * width's edge it begins (`indent`: a list's level, and under an item's
 * first line, its bullet).
 */
type Laid = { text: string; src: number[]; ends: boolean; indent: number; cut?: Cut; hang?: number };

/**
 * Where a line's words were broken (the maintainer, 2026-10-13): whether
 * its first word is what is left of a word broken on the line before
 * (`first`), and whether its last is the part of one broken after it
 * (`last`) - each set as typed (captionRuns).
 */
export type Cut = { first?: boolean; last?: boolean };

/** Of a line's letters `[from, to)`, the ends of a broken word they hold: none, if they hold neither end of the line's words. */
function cutOf(l: { text: string; cut?: Cut }, from: number, to: number): Cut | undefined {
  if (!l.cut) return undefined;
  const lead = l.text.search(/\S/);
  const end = l.text.trimEnd().length;
  const first = !!l.cut.first && lead >= 0 && from <= lead && to > lead;
  const last = !!l.cut.last && to >= end && from < end;
  return first || last ? { first, last } : undefined;
}

/** A typed line's words as they are kept on a line - a number with the unit after it as one - each with where it begins in the caption's text. */
function unbreakable(para: string, at: number): { text: string; src: number[] }[] {
  const out: { text: string; src: number[] }[] = [];
  for (const m of para.matchAll(/\S+/g)) {
    const word = m[0];
    const from = at + m.index!;
    const src = [...word].flatMap((_, k, all) => {
      // (a letter of two code units: both places)
      const off = all.slice(0, k).join("").length;
      return all[k].length === 2 ? [from + off, from + off + 1] : [from + off];
    });
    const last = out[out.length - 1];
    if (last && NUMBER.test(last.text.split(" ").slice(-1)[0]) && UNIT.test(word)) {
      // (the space between them: the first of those typed there)
      const gap = last.src[last.src.length - 1] + 1;
      last.text = `${last.text} ${word}`;
      last.src = [...last.src, gap, ...src];
    } else out.push({ text: word, src });
  }
  return out;
}

/** Where a word too wide for its line may be broken, as a chemical name is: after a hyphen, a comma or a closing bracket, or before an opening one. */
const BREAKS_AFTER = /[-\u2010,)\]}]/u;
const BREAKS_BEFORE = /[([{]/u;

/**
 * Where to break a word - or a number and its unit, or a bullet and its
 * first word - too wide for the `room` its line has (the maintainer,
 * 2026-10-13): as late as its letters fit, at the space between a number
 * and its unit, after a hyphen, a comma or a closing bracket, or before an
 * opening one, where one falls in that much and after `keep` - else at the
 * room's edge; never before its first letter. The place in its text, and
 * whether the break is at a space, which goes.
 */
function breakIn(w: { text: string }, room: number, wide: (to: number) => number, keep: number): { at: number; space: boolean } {
  // (the places between its letters, as the reader sees them: an emoji with its modifiers, a letter with its accents, one)
  const ends = [...letterStarts(w.text).slice(1), w.text.length];
  let lo = 0;
  let hi = ends.length - 1;
  // (as many letters as fit - one at least)
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (wide(ends[mid]) <= room) lo = mid;
    else hi = mid - 1;
  }
  const fits = ends[lo];
  for (let k = lo; k >= 0; k--) {
    const at = ends[k];
    if (at <= keep || at >= w.text.length) continue;
    if (w.text[at] === " ") return { at, space: true };
    if (BREAKS_AFTER.test(w.text[at - 1]) || BREAKS_BEFORE.test(w.text[at])) return { at, space: false };
  }
  // (at the edge - where that falls at a space, or just after one, the space going with the break: no line of a space alone, nor one ending in it)
  if (w.text[fits] === " ") return { at: fits, space: true };
  if (fits > 1 && w.text[fits - 1] === " ") return { at: fits - 1, space: true };
  return { at: fits, space: false };
}

/** A caption's lines as they are laid: as typed - or, given a `width`, each typed line broken into lines no wider than it - and each letter's style, by its place in the text. */
function linesOf(text: string, fontSize: number, set: LabelSet, width: number | undefined, styles: readonly (WordsStyle | undefined)[]): Laid[] {
  const out: Laid[] = [];
  const runsOf = (t: string, src: readonly number[]) => captionRuns(t, src.map((i) => styles[i]));
  let at = 0;
  for (const typed of text.split("\n")) {
    const item = listItem(typed);
    const level = item ? item.level * LIST_INDENT * fontSize : 0;
    const words = unbreakable(typed, at);
    // (an item's bullet and the space after it: its first word, and the room its lines after the first hang in)
    let hang = 0;
    if (item && words.length) {
      const head = words[0];
      hang = runsWidth(runsOf(`${head.text} `, [...head.src, head.src[head.src.length - 1] + 1]), fontSize, set);
    }
    const wraps = width != null && width > 0;
    let line: { text: string; src: number[] } | null = null;
    let first = true;
    // (the line begins with what is left of a word broken on the line before)
    let tail = false;
    // (a list's level and hang no more than half the width: its lines in it, however deep the list)
    const inset = (isFirst: boolean) => {
      const i = level + (isFirst ? 0 : hang);
      return wraps ? Math.min(i, width! / 2) : i;
    };
    const flush = (ends: boolean, head = false) => {
      out.push({ text: line?.text ?? "", src: line?.src ?? [], ends, indent: inset(first), ...(tail || head ? { cut: { first: tail, last: head } } : {}), ...(item && first ? { hang } : {}) });
      first = false;
      tail = false;
      line = null;
    };
    const room = () => width! - inset(first);
    const wide = (l: { text: string; src: readonly number[] }, to = l.text.length, cut?: Cut) => runsWidth(captionRuns(l.text.slice(0, to), l.src.slice(0, to).map((i) => styles[i]), cut), fontSize, set);
    // (a line begun with a word - or a bullet and its word, kept together for `keep` letters - too wide for its room: broken, a line for each piece but the last, which the line goes on from)
    const begin = (w: { text: string; src: number[] }, keep = 0) => {
      let rest = { text: w.text, src: [...w.src] };
      while (wraps && wide(rest, undefined, { first: tail }) > room()) {
        const cut = breakIn(rest, room(), (to) => wide(rest, to, { first: tail, last: true }), keep);
        // (a letter alone too wide: a line of its own, as it is)
        if (cut.at >= rest.text.length) break;
        line = { text: rest.text.slice(0, cut.at), src: rest.src.slice(0, cut.at) };
        flush(false, true);
        const from = cut.at + (cut.space ? 1 : 0);
        rest = { text: rest.text.slice(from), src: rest.src.slice(from) };
        tail = true;
        keep = 0;
      }
      line = rest;
    };
    for (const w of words) {
      if (!line) {
        begin(w);
        continue;
      }
      const was: { text: string; src: number[] } = line;
      const gap = was.src[was.src.length - 1] + 1;
      const next: { text: string; src: number[] } = { text: `${was.text} ${w.text}`, src: [...was.src, gap, ...w.src] };
      // (an item's bullet stays with its first word)
      const bulletAlone = item && first && was.src.length && was.src[was.src.length - 1] < at + item.head;
      if (bulletAlone) begin(next, was.text.length + 1);
      else if (!wraps || wide(next, undefined, { first: tail }) <= room()) line = next;
      else {
        flush(false);
        begin(w);
      }
    }
    flush(true);
    at += typed.length + 1;
  }
  return out;
}

/**
 * A caption's lines: as typed - or, given a `width`, each typed line broken
 * at its spaces into lines no wider than it, as many words on each as fit,
 * a number never parted from the unit after it but where the two are wider
 * than it; a word wider than it broken at its edge - after a hyphen, a
 * comma or a closing bracket, or before an opening one, where one fits
 * (breakIn).
 */
export function captionLines(text: string, fontSize: number, set: LabelSet = ACS_LABEL_SET, width?: number): string[] {
  return linesOf(text, fontSize, set, width, []).map((l) => l.text);
}

/** A caption set: its lines - or words - each a text the drawing draws as it draws a label, and how far its ink reaches either way of its middle. */
export type CaptionSet = { items: TextItem[]; halfW: number; halfH: number };

/** A caption set word by word: each word where it lies in its line, as `captionSet` sets the line, and where it starts and how far it runs. */
export type CaptionWords = CaptionSet & { words: { x: number; y: number; w: number }[] };

/**
 * A caption's text set about (x, y), its middle: line under line
 * `CAPTION_LINE` ems apart, at `fontSize` - a label's size, or its own -
 * in the typeface `set` measures in, broken into lines as wide as `width`
 * where it is given one; each line lying in that width - or the widest
 * line's - as `align` says, a list's lines in from its edge; its letters
 * set as `marks` mark them. Blank lines keep their room.
 */
export function captionSet(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  set: LabelSet = ACS_LABEL_SET,
  width?: number,
  align: CaptionAlign = "center",
  marks?: readonly WordsMark[],
): CaptionSet {
  const { items, halfW, halfH } = setWords(text, x, y, fontSize, set, width, align, false, marks);
  return { items, halfW, halfH };
}

/**
 * A caption set as `captionSet` sets it, but each word a text of its own,
 * where it falls in its line: for words that move on their own as they come
 * (components/WordsFlight). Each word's start, its line's middle and how far
 * it runs are said with it.
 */
export function captionWords(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  set: LabelSet = ACS_LABEL_SET,
  width?: number,
  align: CaptionAlign = "center",
  marks?: readonly WordsMark[],
): CaptionWords {
  return setWords(text, x, y, fontSize, set, width, align, true, marks);
}

/** Each laid line's letters across: where each place in it lies - before each letter, and at its end - and where it begins, as `align` lays it in `box` about `x`. */
function across(laid: readonly Laid[], x: number, box: number, fontSize: number, set: LabelSet, align: CaptionAlign, styles: readonly (WordsStyle | undefined)[]): number[][] {
  const runsOf = (l: Laid, from: number, to: number) => captionRuns(l.text.slice(from, to), l.src.slice(from, to).map((i) => styles[i]), cutOf(l, from, to));
  const wide = (l: Laid, from = 0, to = l.text.length) => runsWidth(runsOf(l, from, to), fontSize, set);
  return laid.map((l) => {
    const words = [...l.text.matchAll(/\S+/g)];
    const w = wide(l);
    // (a list's lines in from the width's edge - where they lie to the left)
    const inset = align === "left" || align === "justify" ? l.indent : 0;
    const lineStart = align === "left" || align === "justify" ? x - box / 2 + inset : align === "right" ? x + box / 2 - w : x - w / 2;
    let starts: number[];
    if (align === "justify" && !l.ends && words.length > 1) {
      const widths = words.map((m) => wide(l, m.index!, m.index! + m[0].length));
      // (a list item's bullet where its line begins, the words after it spread from where its lines hang)
      const lead = l.hang != null && words.length > 2 ? 1 : 0;
      const hung = lead ? l.hang! : 0;
      const gap = (box - inset - hung - widths.slice(lead).reduce((a, b) => a + b, 0)) / (words.length - lead - 1);
      let at = lineStart + hung;
      starts = [
        ...(lead ? [lineStart] : []),
        ...widths.slice(lead).map((ww) => {
          const st = at;
          at += ww + gap;
          return st;
        }),
      ];
    } else starts = words.map((m) => lineStart + (m.index ? wide(l, 0, m.index) : 0));
    const xs: (number | undefined)[] = new Array(l.text.length + 1);
    words.forEach((m, k) => {
      const places = runsPlaces(runsOf(l, m.index!, m.index! + m[0].length), fontSize, set);
      for (let j = 0; j <= m[0].length; j++) xs[m.index! + j] = starts[k] + (places[j] ?? places[places.length - 1]);
    });
    // (what lies between them, where the setting keeps it: on from the word before - an empty line, where it begins)
    for (let c = 0; c < xs.length; c++) xs[c] ??= c === 0 ? lineStart : xs[c - 1];
    return xs as number[];
  });
}

/** How wide the caption's lines lie: as wide as it was made, or as its widest line reaches. */
function boxOf(laid: readonly Laid[], fontSize: number, set: LabelSet, width: number | undefined, styles: readonly (WordsStyle | undefined)[]): number {
  if (width != null && width > 0) return width;
  // (the widest - as many lines as there are, not spread into a call)
  return laid.reduce((most, l) => Math.max(most, l.indent + runsWidth(captionRuns(l.text, l.src.map((i) => styles[i]), l.cut), fontSize, set)), 0);
}

function setWords(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  set: LabelSet,
  width: number | undefined,
  align: CaptionAlign,
  byWord: boolean,
  marks?: readonly WordsMark[],
): CaptionWords {
  const styles = stylesOf(text.length, marks);
  const lines = linesOf(text, fontSize, set, width, styles);
  const step = fontSize * CAPTION_LINE;
  const top = ((lines.length - 1) / 2) * step;
  const box = boxOf(lines, fontSize, set, width, styles);
  const xs = across(lines, x, box, fontSize, set, align, styles);
  // (how far it reaches: half a line's height at the least, half its width, and its ink - a subscript's drop, a capital's height)
  let halfW = box / 2;
  let halfH = fontSize / 2 + top;
  const items: TextItem[] = [];
  const words: { x: number; y: number; w: number }[] = [];
  const put = (l: Laid, from: number, to: number, start: number, lineY: number) => {
    const t = l.text.slice(from, to);
    const runs = captionRuns(t, l.src.slice(from, to).map((i) => styles[i]), cutOf(l, from, to));
    if (!runs.length) return;
    words.push({ x: start, y: lineY, w: runsWidth(runs, fontSize, set) });
    // (placeLabel centres the first letter on x: the start, and half of it)
    const first = runsWidth([{ ...runs[0], text: [...runs[0].text][0] ?? " " }], fontSize, set);
    const item: TextItem = { x: start + first / 2, y: lineY, text: t, fontPx: fontSize, runs, anchorRun: 0 };
    const ink = labelBox(item, fontSize, set);
    halfW = Math.max(halfW, x - (item.x - ink.left), item.x + ink.right - x);
    halfH = Math.max(halfH, item.y + ink.top - y, y - (item.y - ink.bottom));
    items.push(item);
  };
  lines.forEach((line, i) => {
    const lineY = y + top - i * step;
    const ms = [...line.text.matchAll(/\S+/g)];
    // spread to both edges, or word by word: each word where it falls
    if ((align === "justify" && !line.ends && ms.length > 1) || byWord) {
      for (const m of ms) put(line, m.index!, m.index! + m[0].length, xs[i][m.index!], lineY);
      return;
    }
    if (ms.length) put(line, 0, line.text.length, xs[i][0], lineY);
  });
  return { items, halfW, halfH, words };
}

/** Words on the page as a caption keeps them: their text, where their middle is, how wide and how they lie, their own size and their letters' marks. */
export type Words = { text: string; x: number; y: number; width?: number; align?: CaptionAlign | "center"; size?: number; marks?: readonly WordsMark[] };

/**
 * Words on the page set as they are kept - at their own size or the
 * labels' (`wordsFontPx`), their letters as marked - about their middle,
 * or `at`; each text told where its size is its own, so that pictures set
 * it so (layout2d `TextItem.ownSize`).
 */
export function wordsSet(c: Words, sizes: { fontPx: number; pointPx?: number }, set: LabelSet = ACS_LABEL_SET, at?: { x: number; y: number }): CaptionSet {
  const s = captionSet(c.text, at?.x ?? c.x, at?.y ?? c.y, wordsFontPx(c, sizes), set, c.width, c.align, c.marks);
  return c.size ? { ...s, items: s.items.map((t) => ({ ...t, ownSize: true })) } : s;
}

/**
 * Where each place in a caption's text lies as `captionSet` sets it - the
 * places a caret stands at, before each of its letters and at its end:
 * the line it falls on, as the lines are broken and laid, and how far
 * across; and each line's middle, and where it begins and ends across.
 * Spaces the setting runs together, and those it leaves off a line's ends,
 * stand where the space it keeps does, or at the line's edge; a list
 * item's tabs, where its line begins.
 */
export type CaptionPlaces = { at: { line: number; x: number; inside?: true }[]; lines: { y: number; x0: number; x1: number }[] };

export function captionPlaces(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  set: LabelSet = ACS_LABEL_SET,
  width?: number,
  align: CaptionAlign = "center",
  marks?: readonly WordsMark[],
): CaptionPlaces {
  const styles = stylesOf(text.length, marks);
  const laid = linesOf(text, fontSize, set, width, styles);
  const step = fontSize * CAPTION_LINE;
  const top = ((laid.length - 1) / 2) * step;
  const box = boxOf(laid, fontSize, set, width, styles);
  const xsOf = across(laid, x, box, fontSize, set, align, styles);
  const lines = laid.map((l, i) => ({ y: y + top - i * step, x0: xsOf[i][0], x1: xsOf[i][l.text.length] }));
  // (each letter set: on its line, where its place is)
  const before = new Map<number, { line: number; j: number }>();
  laid.forEach((l, li) => l.src.forEach((s, j) => before.set(s, { line: li, j })));
  const at: { line: number; x: number; inside?: true }[] = [];
  // (the places between letters as the reader sees them - an emoji with its modifiers one, a letter of two code units one: no caret goes inside one)
  const between = new Set([...letterStarts(text), text.length]);
  let li = 0;
  let from = 0;
  for (const typed of text.split("\n")) {
    // (the laid lines this typed line was laid on: from `li`, to the one it ends with)
    const firstLine = li;
    while (li < laid.length - 1 && !laid[li].ends) li++;
    let last: { line: number; j: number } | null = null;
    for (let b = from; b <= from + typed.length; b++) {
      const here = b < from + typed.length ? before.get(b) : undefined;
      if (here) {
        at.push({ line: here.line, x: xsOf[here.line][here.j] });
        last = here;
      } else if (last) {
        // (past a letter set: just after it - where a space run together, or the line's end, stands)
        at.push({ line: last.line, x: xsOf[last.line][last.j + 1] });
      } else at.push({ line: firstLine, x: xsOf[firstLine][0] });
    }
    from += typed.length + 1;
    li = Math.min(li + 1, laid.length - 1);
  }
  at.forEach((a, k) => {
    if (!between.has(k)) a.inside = true;
  });
  return { at, lines };
}

/** The place in a caption's text nearest a point, as `captionPlaces` lays its places: on the line nearest it, the place nearest across. */
export function captionPlaceAt(p: CaptionPlaces, q: { x: number; y: number }): number {
  let line = 0;
  p.lines.forEach((l, i) => {
    if (Math.abs(l.y - q.y) < Math.abs(p.lines[line].y - q.y)) line = i;
  });
  let best = -1;
  p.at.forEach((a, k) => {
    if (a.line === line && !a.inside && (best < 0 || Math.abs(a.x - q.x) < Math.abs(p.at[best].x - q.x))) best = k;
  });
  return Math.max(0, best);
}

/** How near an arrow a caption put down is taken to be its: within this many ems of it, across. */
const ARROW_REACH = 2.5;
/** How far a caption over or under an arrow stands clear of it - its ink, of the arrow's line - in ems. */
export const ARROW_CLEAR = 0.5;

/**
 * Where a caption put down at `at` - reaching `half` either way of its
 * middle - goes: near an arrow, within its length and `ARROW_REACH` ems
 * across, over it or under it on that side, centred on its middle and
 * clear of it - beyond any caption already there on that side (`others`,
 * by where each stands and how far it reaches) - and the arrow's; else
 * where it was put.
 */
export function captionPlace(
  at: { x: number; y: number },
  half: { w: number; h: number },
  arrows: readonly (SchemeArrow & { id: number; corners?: readonly ArrowCorner[] })[],
  fontSize: number,
  others: readonly { x: number; y: number; arrow?: number; halfW: number; halfH: number }[] = [],
): { x: number; y: number; arrow?: number } {
  let best: { a: SchemeArrow & { id: number }; across: number } | null = null;
  // (each over the straight line its words go by: an arrow that turns, its longest stretch)
  for (const a of arrows.map(wordsLine)) {
    const ux = Math.cos(a.angle);
    const uy = Math.sin(a.angle);
    const dx = at.x - a.x;
    const dy = at.y - a.y;
    const along = dx * ux + dy * uy;
    const across = -dx * uy + dy * ux;
    if (Math.abs(along) > a.length / 2 || Math.abs(across) > ARROW_REACH * fontSize + half.h) continue;
    if (!best || Math.abs(across) < Math.abs(best.across)) best = { a, across };
  }
  if (!best) return { x: at.x, y: at.y };
  const { a } = best;
  // (the side of the arrow it was put on: over it, where it was on the line itself)
  const side = best.across < 0 ? -1 : 1;
  const nx = -Math.sin(a.angle) * side;
  const ny = Math.cos(a.angle) * side;
  const reach = (w: number, h: number) => Math.abs(nx) * w + Math.abs(ny) * h;
  let out = ARROW_CLEAR * fontSize + reach(half.w, half.h);
  // (beyond any caption already over it, or under it, on that side)
  for (const o of others) {
    if (o.arrow !== a.id) continue;
    const there = (o.x - a.x) * nx + (o.y - a.y) * ny;
    if (there <= 0) continue;
    out = Math.max(out, there + reach(o.halfW, o.halfH) + 0.25 * fontSize + reach(half.w, half.h));
  }
  return { x: a.x + nx * out, y: a.y + ny * out, arrow: a.id };
}

/** How far an arrow reaches past the words over it or under it, at either end, in ems. */
export const ARROW_PAST_WORDS = 0.75;

/** Words over or under an arrow (`arrow`), where their middle is and how far they reach either way of it. */
export type ArrowWords = { arrow?: number; x: number; y: number; halfW: number; halfH: number };

/**
 * How long each arrow's words need it to be, by its id: long enough, its
 * middle where it is, to reach `ARROW_PAST_WORDS` ems past the words over it
 * and under it at either end - each word's reach along it, wherever it
 * stands. An arrow with no words needs nothing, and is not named.
 */
export function wordsNeed(
  arrows: readonly (SchemeArrow & { id: number; corners?: readonly ArrowCorner[] })[],
  words: readonly ArrowWords[],
  fontSize: number,
): Map<number, number> {
  const need = new Map<number, number>();
  for (const a of arrows.map(wordsLine)) {
    const ux = Math.cos(a.angle);
    const uy = Math.sin(a.angle);
    for (const w of words) {
      if (w.arrow !== a.id) continue;
      const along = Math.abs((w.x - a.x) * ux + (w.y - a.y) * uy) + Math.abs(ux) * w.halfW + Math.abs(uy) * w.halfH;
      need.set(a.id, Math.max(need.get(a.id) ?? 0, 2 * (along + ARROW_PAST_WORDS * fontSize)));
    }
  }
  return need;
}

/**
 * The arrows as they are drawn: each as long as it was made, or - its
 * words needing more - as long as they need (`wordsNeed`), its middle where
 * it is (the maintainer, 2026-10-11).
 */
export function withWordsNeed<A extends SchemeArrow & { id: number; corners?: readonly ArrowCorner[] }>(arrows: readonly A[], need: ReadonlyMap<number, number>): A[] {
  return arrows.map((a) => {
    const n = need.get(a.id) ?? 0;
    // (an arrow that turns grows as a whole, until the stretch its words go by is as long as they need)
    const along = wordsLine(a).length;
    return n > along && along > 0 ? { ...a, length: (a.length * n) / along } : a;
  });
}

/**
 * The arrows as they are drawn with their words as `captionSet` sets them,
 * in the labels' size `fontSize` and their set `set` (`withWordsNeed`).
 */
export function arrowsWithWords<A extends SchemeArrow & { id: number }>(
  arrows: readonly A[],
  captions: readonly (Words & { arrow?: number })[],
  fontSize: number,
  set: LabelSet = ACS_LABEL_SET,
  pointPx?: number,
): A[] {
  if (!arrows.length || !captions.some((c) => c.arrow != null)) return arrows.slice();
  const words = captions
    .filter((c) => c.arrow != null)
    .map((c) => {
      const s = wordsSet(c, { fontPx: fontSize, pointPx }, set);
      return { arrow: c.arrow, x: c.x, y: c.y, halfW: s.halfW, halfH: s.halfH };
    });
  return withWordsNeed(arrows, wordsNeed(arrows, words, fontSize));
}

/** Words' marks with all their letters set as `r` says: bold, italics, a colour, raised or lowered - or (toggled) off where all have it. */
export function marksAll(text: string, marks: readonly WordsMark[] | undefined, r: Restyle): WordsMark[] {
  return marksOf(stylesOf(text.length, marks).map((st) => restyled(st, r)));
}
