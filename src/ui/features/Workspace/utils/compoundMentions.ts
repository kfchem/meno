/**
 * A compound's number mentioned in a PDF's text (docs/PDF.md, *A compound's
 * number*): the word under the pointer, where it is a number of a compound
 * number's shape (./pageStructures `labelText`) and is set as one - bold, as
 * most journals set a compound's number in their text, or after a word that
 * names a compound ("compound 12", "products 3 and 4"), or in parentheses
 * just after a name ("camphor (12)") - and not after a display item's word
 * ("Scheme 4", "Figures 1-3"), however set. A plain "12" - hours,
 * a year, a reference - is none; with the lens's own key held (`any`), every
 * number of that shape is, for the chemist who asks.
 */
import { setBold, wordAt, type PageText } from "../../../../lib/pdf/text";
import { DISPLAY_ITEMS, labelText } from "./pageStructures";

/** The words that name what a number after them is: a compound, and what a scheme calls one. */
const NAMING = /^(compounds?|products?|intermediates?|substrates?|adducts?|derivatives?)$/i;
/** The words that join numbers named together: "compounds 3, 4 and 5", "3 or 4", "3 to 5". */
const JOINING = /^(and|or|to)$/i;
/** How many words back a naming word may stand, past numbers and joining words: "compounds 3, 4 and 5" puts it four back from 5. */
const NAMED_REACH = 6;

/** The words before a number in parentheses that make it no compound's: "(Table 2)" is never so, but "Table (2)", "ref. (14)", "eq (3)" are kept out too. */
const NOT_NAMES = new RegExp(`^(${DISPLAY_ITEMS}|refs?|references?|entry|entries|steps?|days?|h|min|years?)$`, "i");
/** A display item's word (./pageStructures `DISPLAY_ITEMS`): the number after it - "Scheme 4", "Figures 1\u20133" - is that item's, however set. */
const DISPLAY = new RegExp(`^(${DISPLAY_ITEMS})$`, "i");

/** A number mentioned: what it says, as Meno writes a compound's number, and its letters' place on the page, from `start` to before `end`. */
export type Mention = { label: string; start: number; end: number };

/** The letters of `t` from `a` to before `b`, as a string. */
const textOf = (t: PageText, a: number, b: number) => String.fromCodePoint(...t.codes.subarray(a, b));

/** The word before the one beginning at `a`: its letters, or none at the page's start. */
function wordBefore(t: PageText, a: number): [number, number] | null {
  let i = a - 1;
  while (i >= 0 && !/[\p{L}\p{N}]/u.test(String.fromCodePoint(t.codes[i]))) i--;
  return i < 0 ? null : wordAt(t, i);
}

/**
 * The word that names what a number is, before it past other numbers and joining words within its sentence: a naming word or a display
 * item's ("compounds 3, 4 and 5", "Schemes 2 and 3"); and the number just after that word, where it is another (the 2 of "Schemes 2
 * and 3"). None where there is no such word.
 */
function namer(t: PageText, a: number): { text: string; first: [number, number] | null } | null {
  let at = a;
  let first: [number, number] | null = null;
  for (let k = 0; k < NAMED_REACH; k++) {
    const w = wordBefore(t, at);
    if (!w) return null;
    const text = textOf(t, w[0], w[1]);
    // (not past a sentence's end - "in Table 2. 4 was" - but past an abbreviation's point: "Fig. 3", "eqs. 2 and 3")
    if (/[.;:!?]/.test(textOf(t, w[1], at)) && !DISPLAY.test(text)) return null;
    if (NAMING.test(text) || DISPLAY.test(text)) return { text, first: at === a ? null : first };
    if (!JOINING.test(text) && !labelText(text)) return null;
    if (labelText(text)) first = w;
    at = w[0];
  }
  return null;
}

/**
 * Whether a number is a display item's (`DISPLAY`): just after its word ("Scheme 4"), or among the item's numbers after it - set as the
 * first of them is ("Schemes 2 and 3", all bold in a caption or all plain in the text). A number set otherwise is none of the list:
 * "Scheme 1, 4a was made", its 4a bold, is a compound's.
 */
function displayed(t: PageText, by: { text: string; first: [number, number] | null }, from: number, end: number): boolean {
  if (!DISPLAY.test(by.text)) return false;
  return !by.first || setBold(t, by.first[0], by.first[1]) === setBold(t, from, end);
}

/** Whether a number is set in parentheses just after a name: "(" before it, ")" after it, a word of letters before the "(". */
function afterName(t: PageText, a: number, b: number): boolean {
  const before = a > 0 ? String.fromCodePoint(t.codes[a - 1]) : "";
  const after = b < t.codes.length ? String.fromCodePoint(t.codes[b]) : "";
  if (before !== "(" || after !== ")") return false;
  const w = wordBefore(t, a - 1);
  if (!w) return false;
  const name = textOf(t, w[0], w[1]);
  return /^\p{L}[\p{L}'’-]*$/u.test(name) && name.length > 1 && !NOT_NAMES.test(name) && !NAMING.test(name);
}

/** The compound's number mentioned at letter `i` of a page: set bold, named a compound by the words before it, or in parentheses after a name - or, `any`, every number of that shape; else none. */
export function mentionAt(t: PageText, i: number, any = false): Mention | null {
  if (i < 0 || i >= t.codes.length) return null;
  const [first, end] = wordAt(t, i);
  if (end <= first) return null;
  // (its rotation's mark before it, (+)-12, (\u2212)\u201312: the mark's parentheses and sign, and an en dash, are no word's letters - the
  //  mark taken with it, the number alone asked whether it is set as one)
  const mark = /\([+\-\u2212\u2013\u00b1]\)[\u2013\u2212]?$/.exec(textOf(t, Math.max(0, first - 4), first));
  const start = mark && (mark[0].length === 4 || t.codes[first] === 0x2d) ? first - mark[0].length : first;
  const label = labelText(textOf(t, start, end));
  if (!label) return null;
  const from = start === first ? first : first + (t.codes[first] === 0x2d ? 1 : 0);
  // (a display item's number - "Scheme 4", "Figures 1\u20133", set bold in a caption or not - is none; with the lens's own key held, it is)
  const by = namer(t, start);
  if (by && !any && displayed(t, by, from, end)) return null;
  return any || setBold(t, from, end) || (by != null && NAMING.test(by.text)) || afterName(t, start, end) ? { label, start, end } : null;
}
