/**
 * Words on the page written as they are meant as they are typed (docs/
 * EDITOR-2D.md, *Text*): a temperature typed as 60dc is 60 °C, a minus
 * typed as a hyphen is a minus sign (U+2212), and a range typed with a
 * hyphen has an en dash (U+2013), as journals print them. Only what is
 * typed; what is pasted stays as it was.
 *
 * - **°C:** "dc", in either case, straight after a number or a range, with
 *   or without a space, once what comes after it is no letter or digit:
 *   60dc, 60 dc → 60 °C. Always one space between the number and °C.
 * - **Minus:** a hyphen at a word's start (the text's start, after a space,
 *   or after an opening bracket) straight before a digit: -78 → −78. Hyphens
 *   within words stay: 2-propanol, t-BuOK, 18-crown-6.
 * - **Ranges:** a number, one hyphen and a number, as a word of its own, once
 *   the word has ended: 1-2 h → 1–2 h, compounds 3-5 → 3–5. A run of numbers
 *   joined by more hyphens is no range - a CAS number (7647-01-0), a date
 *   (2026-10-10) - and stays as it is; so does a hyphen next to a letter
 *   (4-Å MS, Pd-118, 1,2-dichloroethane).
 *
 * - **Commas:** a comma typed straight before a word gets a space after it,
 *   once that word has ended: Pd(OAc)2,PPh3 → Pd(OAc)2, PPh3; rt,12 h →
 *   rt, 12 h. Not where the comma is part of a name, joining two locants -
 *   numbers, a number and a letter, a capital letter alone, each maybe
 *   primed: 1,2-DCE, 2,2,6,6-tetramethyl, 1',2', 4a,8a, N,N-DMF, N,O-bis,
 *   (R,R), (E,Z), (1R,2S) - nor between two numbers, 1,000. Never a second
 *   space: one already there stays one.
 * - **Bullets:** a hyphen or a star typed at a line's start - after any tabs
 *   - and then a space begins a list's item: "- " → "• " (docs/
 *   EDITOR-2D.md, *Text*).
 *
 * A range waits for its word's end: until then 7647-0 may still be the start
 * of a CAS number.
 */

/** A part of the text and what it is written as: `[from, to)` replaced by `insert`. */
export type Change = { from: number; to: number; insert: string };

export const MINUS = "\u2212";
export const EN_DASH = "\u2013";
export const DEGREES_C = "\u00b0C";
export const BULLET = "\u2022";

/** A number: maybe a minus, typed or written, digits, and maybe a decimal part. */
const NUM = String.raw`[\-\u2212]?\d+(?:[.,]\d+)?`;
/** A number after a dash: digits, and maybe a decimal part. */
const UPPER = String.raw`\d+(?:[.,]\d+)?`;
/** A temperature typed: a number - or a range, its dash typed or written - then "dc", ending the text; after no letter, digit or decimal point. */
const CELSIUS = new RegExp(String.raw`(^|[^\p{L}\p{N}.,])(${NUM})(?:([\-\u2013])(${UPPER}))?( ?)(dc)$`, "iu");
/**
 * A range typed: a number, a hyphen and a number, ending the text but for
 * a stop or a comma; after nothing that joins numbers - no letter, digit,
 * decimal point, prime or dash.
 */
const RANGE = new RegExp(String.raw`(^|[^\p{L}\p{N}.,'\u2032\-\u2212\u2013])(${NUM})(-)(${UPPER})[.,;:]?$`, "u");

/** A word ended straight after a comma, and the word - with its primes, and a degree sign, °C's - before the comma. */
const COMMA = /([\p{L}\p{N}'\u2032\u2033\u00b0]*),([\p{L}\p{N}]+)$/u;
/** A locant, as a name joins them with commas: digits maybe with a letter (1, 12, 4a, 1R), or a capital letter alone (N, O, R, E), maybe primed. */
const LOCANT = /^(?:\d+\p{L}?|\p{Lu})['\u2032\u2033]*$/u;

/** What ends a word with °C in it: anything but a letter or a digit. */
const WORDLY = /[\p{L}\p{N}]/u;
/** What ends a word with a range in it: anything that could not go on with its number either. */
const NUMBERLY = /[\p{L}\p{N}.,'\u2032\-\u2212\u2013]/u;
/** Where a word starts, for a minus: the text's start, a space, an opening bracket. */
const STARTS = /[\s([{]/u;

const isDigit = (ch: string | undefined) => !!ch && ch >= "0" && ch <= "9";

/**
 * What the word before `at` is written as, now that it has ended there -
 * with whatever is at `at`, or nothing, the text ending or kept there.
 */
export function wordEnded(text: string, at: number): Change[] {
  const next = text[at];
  const before = text.slice(0, at);
  // (a comma straight before the word: a space after it - but not between two locants, a name's - and the word then read as
  // it ends after that space: 80dc after a comma is 80 °C)
  const c = COMMA.exec(before);
  if (c && !(LOCANT.test(c[1]) && LOCANT.test(c[2]))) {
    const comma = c.index + c[1].length;
    const spaced = `${text.slice(0, comma + 1)} ${text.slice(comma + 1)}`;
    const rest = wordEnded(spaced, at + 1).map((x) => ({ ...x, from: x.from > comma + 1 ? x.from - 1 : x.from, to: x.to > comma + 1 ? x.to - 1 : x.to }));
    return [{ from: comma + 1, to: comma + 1, insert: " " }, ...rest];
  }
  if (next === undefined || !WORDLY.test(next)) {
    const m = CELSIUS.exec(before);
    if (m) {
      const out: Change[] = [];
      let end = m.index + m[1].length + m[2].length;
      if (m[3] === "-") out.push({ from: end, to: end + 1, insert: EN_DASH });
      if (m[3]) end += 1 + m[4].length;
      out.push({ from: end, to: at, insert: ` ${DEGREES_C}` });
      return out;
    }
  }
  if (next === undefined || !NUMBERLY.test(next)) {
    const m = RANGE.exec(before);
    if (m) {
      const dash = m.index + m[1].length + m[2].length;
      return [{ from: dash, to: dash + 1, insert: EN_DASH }];
    }
  }
  return [];
}

/**
 * What the text is written as once `[from, to)` of it has just been typed:
 * a minus whose hyphen or first digit is among what was typed, and each
 * word that what was typed ended. In order, none overlapping.
 */
export function typedChanges(text: string, from: number, to: number): Change[] {
  const out: Change[] = [];
  for (let i = Math.max(from - 1, 0); i < to; i++) {
    if (text[i] === "-" && isDigit(text[i + 1]) && (i === 0 || STARTS.test(text[i - 1]))) out.push({ from: i, to: i + 1, insert: MINUS });
    // (a hyphen or a star alone at a line's start, a space typed after it: a bullet)
    if (text[i] === " " && i >= from && i > 0 && (text[i - 1] === "-" || text[i - 1] === "*") && /^\t*$/.test(text.slice(text.lastIndexOf("\n", i - 2) + 1, i - 1)))
      out.push({ from: i - 1, to: i, insert: BULLET });
  }
  for (let k = from; k < to; k++) {
    if (!WORDLY.test(text[k])) out.push(...wordEnded(text, k));
  }
  out.sort((a, b) => a.from - b.from || a.to - b.to);
  const apart: Change[] = [];
  for (const c of out) if (!apart.length || c.from >= apart[apart.length - 1].to) apart.push(c);
  return apart;
}

/** `text` with `changes` made - none overlapping - and each letter's style going with it: what is put in takes the style of what it took the place of. */
function withChanges<S>(text: string, styles: readonly S[], changes: readonly Change[]): { text: string; styles: S[] } {
  let t = text;
  let st = [...styles];
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    const s = st[c.from] ?? st[c.from - 1];
    t = t.slice(0, c.from) + c.insert + t.slice(c.to);
    st = [...st.slice(0, c.from), ...Array.from({ length: c.insert.length }, () => s), ...st.slice(c.to)];
  }
  return { text: t, styles: st };
}

/** A degree written in a temperature - after a number, with or without a space, a space in it - or a temperature's minus written as a dash. */
const DEGREES = /(\d)[ \u00a0]*\u00b0[ \u00a0]*C(?![\p{L}\p{N}])/gu;
const DASH_MINUS = /(^|[\s([{])([\u2013\u2012])(?=\d)/gu;

/**
 * Words written as Meno writes words typed, all of them at once - words
 * taken out of a figure (docs/PDF.md, *Reaction schemes*): a minus where a
 * hyphen or a dash at a word's start stands for one, a range's hyphen an
 * en dash, a temperature with one space before °C - each letter's style
 * going with it (`styles`, one a letter). No bullet is begun: these are no
 * lists typed.
 */
export function writtenAsMeant<S>(text: string, styles: readonly S[]): { text: string; styles: S[] } {
  const own: Change[] = [];
  for (const m of text.matchAll(DEGREES)) own.push({ from: m.index! + m[1].length, to: m.index! + m[0].length, insert: ` ${DEGREES_C}` });
  for (const m of text.matchAll(DASH_MINUS)) own.push({ from: m.index! + m[1].length, to: m.index! + m[1].length + 1, insert: MINUS });
  const first = withChanges(text, styles, own);
  // (and the last word, ended by the text's end)
  const typed = [...typedChanges(first.text, 0, first.text.length).filter((c) => c.insert !== BULLET), ...wordEnded(first.text, first.text.length)];
  const apart: Change[] = [];
  for (const c of typed.sort((p, q) => p.from - q.from)) if (!apart.length || c.from >= apart[apart.length - 1].to) apart.push(c);
  return withChanges(first.text, first.styles, apart);
}
