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
