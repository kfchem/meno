/**
 * A compound's number mentioned in a PDF's text (docs/PDF.md, *A compound's
 * number*): the word under the pointer, where it is a number of a compound
 * number's shape (./pageStructures `labelText`) and is set as one - bold, as
 * most journals set a compound's number in their text, or after a word that
 * names a compound ("compound 12", "products 3 and 4"), or in parentheses
 * just after a name ("camphor (12)"). A plain "12" - hours,
 * a year, a reference - is none; with the lens's own key held (`any`), every
 * number of that shape is, for the chemist who asks.
 */
import { setBold, wordAt, type PageText } from "../../../../lib/pdf/text";
import { labelText } from "./pageStructures";

/** The words that name what a number after them is: a compound, and what a scheme calls one. */
const NAMING = /^(compounds?|products?|intermediates?|substrates?|adducts?|derivatives?)$/i;
/** The words that join numbers named together: "compounds 3, 4 and 5", "3 or 4", "3 to 5". */
const JOINING = /^(and|or|to)$/i;
/** How many words back a naming word may stand, past numbers and joining words: "compounds 3, 4 and 5" puts it four back from 5. */
const NAMED_REACH = 6;

/** The words before a number in parentheses that make it no compound's: "(Table 2)" is never so, but "Table (2)", "ref. (14)", "eq (3)" are kept out too. */
const NOT_NAMES = /^(tables?|figures?|figs?|schemes?|refs?|references?|eqs?|equations?|entry|entries|steps?|days?|h|min|years?)$/i;

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

/** Whether a number is named a compound by the words before it: a naming word, past other numbers and joining words. */
function named(t: PageText, a: number): boolean {
  let at = a;
  for (let k = 0; k < NAMED_REACH; k++) {
    const w = wordBefore(t, at);
    if (!w) return false;
    const text = textOf(t, w[0], w[1]);
    if (NAMING.test(text)) return true;
    if (!JOINING.test(text) && !labelText(text)) return false;
    at = w[0];
  }
  return false;
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
  const [start, end] = wordAt(t, i);
  if (end <= start) return null;
  const label = labelText(textOf(t, start, end));
  if (!label) return null;
  return any || setBold(t, start, end) || named(t, start) || afterName(t, start, end) ? { label, start, end } : null;
}
