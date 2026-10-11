/**
 * A label read as it was meant, from the letters typed (docs/EDITOR-2D.md,
 * *Labels typed in place*; the maintainer, 2026-10-10): nh2 is NH2, obz
 * OBz, hnfmoc NHFmoc. No list of what is typed: the readings are those
 * Meno already reads - the abbreviations, the user's own, those put
 * together by rule, element symbols with their H and charge - and these
 * rules choose among them.
 *
 * 1. A letter typed small may be read as a capital, one typed as a capital
 *    stays one; of the readings, the one that changes the fewest letters
 *    (co is Co, ph Ph, ipr iPr - not the NHC IPr).
 * 2. No element after uranium (Np on) is read from letters typed small:
 *    nh is NH, not nihonium; ts tosyl, not tennessine.
 * 3. A label typed as it is drawn on a bond's left - AcO, BocHN, HO2C, H2N,
 *    or HN before a group - is kept as it reads from the bond: OAc, NHBoc,
 *    CO2H, NH2, NHFmoc. So what is kept is the same however it was typed -
 *    small, as it is written or as it is drawn on the left (the maintainer,
 *    2026-10-11): HO, ho and oh are OH; AcO, aco and OAc OAc. What reads
 *    as something as it is written is that, not turned round (hcl is HCl);
 *    an element with its H, typed H first, comes before an element the
 *    same letters spell (ho is OH; holmium is typed Ho).
 * 4. A prefix set in italics gets its hyphen: tBu is t-Bu, CO2tBu CO2t-Bu.
 * 5. What reads as nothing stays as typed.
 *
 * As a label is typed only letters' case changes (`liveLabel`): the same
 * letters, where they were typed, so that the caret stays where it is;
 * rules 3 and 4 are applied as it is kept (`keptLabel`).
 */
import { labelUnitNames, reversedLabel } from "./abbreviations";
import { elements } from "../../utils/atomUtils";

/**
 * What a label reads as: part of a structure - an element with its H and
 * charge, an abbreviation, a group put together by rule, an Rgroup - or a
 * whole molecule - a reagent, a ligand, a complex - (`whole`); the element,
 * where it is one; null, where it reads as nothing.
 */
export type Reading = { whole: boolean; element?: string } | null;
export type Reads = (label: string) => Reading;

/** The first element after uranium: none from there on is read from letters typed small. */
const AFTER_URANIUM = 93;
const HEAVY = new Set(elements.filter((e) => e.number >= AFTER_URANIUM).map((e) => e.symbol));

type Token = { text: string };

let tokens: { from: readonly string[]; words: Token[] } | null = null;
/** What a label is read into: element symbols, and the groups' names (the user's own among them, as they are now) - each as it is written. */
function vocabulary(): Token[] {
  const units = labelUnitNames();
  if (tokens?.from !== units) {
    tokens = {
      from: units,
      words: [
        ...elements.map((e) => ({ text: e.symbol })),
        ...units.map((text) => ({ text })),
        // (an Rgroup's R)
        { text: "R" },
      ],
    };
  }
  return tokens.words;
}

const small = (c: string) => c >= "a" && c <= "z";

/** A way of writing what was typed: the text, how many letters it makes capitals, of how many words, and how many letters typed small stay as they were, in no word. */
type Writing = { text: string; cost: number; words: number; loose: number };

/**
 * Every way the letters typed can be written as the vocabulary's words, by
 * how many letters each makes capitals: as typed, at no cost, letter by
 * letter where no word fits.
 */
function writings(typed: string, most = 400): Writing[] {
  const at: Map<string, Omit<Writing, "text">>[] = [new Map([["", { cost: 0, words: 0, loose: 0 }]])];
  for (let i = 1; i <= typed.length; i++) at.push(new Map());
  const words = vocabulary();
  const better = (a: Omit<Writing, "text">, b: Omit<Writing, "text">) => a.cost - b.cost || a.loose - b.loose || a.words - b.words;
  for (let i = 0; i < typed.length; i++) {
    const here = at[i];
    if (!here.size) continue;
    const put = (j: number, add: string, cost: number, word: boolean, loose: number) => {
      const there = at[j];
      for (const [text, w] of here) {
        const next = { cost: w.cost + cost, words: w.words + (word ? 1 : 0), loose: w.loose + loose };
        const was = there.get(text + add);
        if (!was || better(next, was) < 0) there.set(text + add, next);
      }
      // (only the likeliest kept on)
      if (there.size > most) at[j] = new Map([...there].sort((a, b) => better(a[1], b[1])).slice(0, most));
    };
    // the letter as typed
    put(i + 1, typed[i], 0, false, small(typed[i]) ? 1 : 0);
    for (const w of words) {
      const end = i + w.text.length;
      if (end > typed.length) continue;
      let cost = 0;
      let fits = true;
      for (let k = 0; k < w.text.length && fits; k++) {
        const t = typed[i + k];
        const c = w.text[k];
        if (t === c) continue;
        if (small(t) && c === t.toUpperCase()) cost++;
        else fits = false;
      }
      if (fits) put(end, w.text, cost, true, 0);
    }
  }
  return [...at[typed.length]].map(([text, w]) => ({ text, ...w })).sort((a, b) => better(a, b) || (a.text < b.text ? -1 : 1));
}

/**
 * A label typed as it is drawn on a bond's left, or with HN before a group,
 * as it reads from the bond - those that read as part of a structure, from
 * letters each in a word (`whole` false).
 */
function forwards(label: string): string[] {
  const out: string[] = [];
  const back = reversedLabel(label);
  if (back !== label) out.push(back);
  // (HN typed before a group: NH)
  const hn = /^H(\d*)([A-Z][a-z]?)(?=[A-Z(]|$)/.exec(label);
  if (hn && hn[2] !== "H") out.push(`${hn[2]}H${hn[1]}${label.slice(hn[0].length)}`);
  return out;
}

/** Whether a reading of what was typed may stand: no element after uranium read from letters typed small. */
function allowed(typed: string, text: string, r: Reading): boolean {
  return !(r?.element && HEAVY.has(r.element) && text !== typed);
}

/** Whether one rank comes before another: the first place they differ decides. */
function before(a: readonly number[], b: readonly number[]): boolean {
  const k = a.findIndex((v, i) => v !== b[i]);
  return k >= 0 && a[k] < b[k];
}

/**
 * The reading chosen for what was typed: the writing shown, and the label it
 * is kept as. Part of a structure before a whole molecule - a label stands
 * for part of one - then an element with its H typed H first (ho is HO, OH
 * - not holmium), then the fewest letters made capitals.
 */
function chosen(typed: string, reads: Reads): { shown: string; kept: string } {
  if (!typed) return { shown: typed, kept: typed };
  const own = reads(typed);
  if (own) return { shown: typed, kept: typed };
  let best: { shown: string; kept: string; rank: number[] } | null = null;
  const consider = (shown: string, kept: string, r: Reading, w: Writing) => {
    if (!r || !allowed(typed, kept, r)) return;
    // (an element with its H, typed H first: HO, H2N)
    const hFirst = kept !== shown && !!r.element && shown.startsWith("H");
    const rank = [r.whole ? 1 : 0, hFirst ? 0 : 1, w.cost, w.loose, w.words];
    if (!best || before(rank, best.rank)) best = { shown, kept, rank };
  };
  let tried = 0;
  for (const w of writings(typed)) {
    // (as typed - no letter made a capital - it reads as nothing: asked above)
    const r = w.cost > 0 ? reads(w.text) : null;
    if (w.cost > 0) {
      if (++tried > 120) break;
      consider(w.text, w.text, r, w);
    }
    // (as drawn on a bond's left - HO, AcO as typed, or aco - only what reads
    // as nothing as it is written, from letters each in a word: hcl is HCl)
    if (!r && w.loose === 0)
      for (const f of forwards(w.text)) {
        // (a group, drawn the other way round: never a whole molecule)
        const back = reads(f);
        if (back && !back.whole) consider(w.text, f, back, w);
      }
  }
  return best ?? { shown: typed, kept: typed };
}

/**
 * The label as it is shown while it is typed: the letters typed, the case of
 * each as the reading chosen has it - the same letters in the same places -
 * or as typed where nothing reads.
 */
export function liveLabel(typed: string, reads: Reads): string {
  return chosen(typed, reads).shown;
}

/**
 * The label as it is kept: as the reading chosen reads from its bond (rule
 * 3); its italic prefixes hyphenated where that reads the same (rule 4).
 */
export function keptLabel(typed: string, reads: Reads): string {
  const { kept } = chosen(typed, reads);
  // (t, s and n before a group, at the label's start or after what is not a letter: t-Bu)
  const hyphened = kept.replace(/(^|[^A-Za-z-])([tsn])(?=[A-Z])/g, "$1$2-");
  return hyphened !== kept && reads(hyphened) ? hyphened : kept;
}
