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
 *    as something as it is written is that, not turned round (hcl is HCl),
 *    and only what is written in words is (MES is no SEM). Of letters typed
 *    small, a heteroatom with its H or a group, as drawn on the left, comes
 *    before any other reading (the maintainer, 2026-10-12): ho is HO, kept
 *    OH, not holmium; mes MeS, kept SMe, not mesityl (Mes, typed so). A
 *    charge typed last stays last: ho- is OH-.
 * 4. A prefix set in italics gets its hyphen: tBu is t-Bu, CO2tBu CO2t-Bu.
 * 5. What reads as nothing stays as typed.
 * 6. A reagent's or a ligand's name comes before a metal's formula (the
 *    maintainer, 2026-10-13): of letters typed small that read as whole
 *    molecules, a reagent by its name comes first, whatever letters it
 *    makes capitals - tbme is TBME, not TbMe; cdi CDI, not CdI; hoac HOAc,
 *    not HoAc; tmscl TMSCl; cpme CPME - and a ligand, part of a structure,
 *    before any. Other molecules, formulas read by rule, are read as ever:
 *    h2zn is H2Zn, pdcl2 PdCl2; one typed as it is written is that (HoCl3).
 *
 * As a label is typed only letters' case changes (`liveLabel`): the same
 * letters, where they were typed, so that the caret stays where it is;
 * rules 3 and 4 are applied as it is kept (`keptLabel`).
 */
import { customAbbreviations, GROUPS, labelUnitNames, labelUnits, reversedLabel } from "./abbreviations";
import { ELEMENTS } from "./elements";

/**
 * What a label reads as: part of a structure - an element with its H and
 * charge, an abbreviation, a group put together by rule, an Rgroup - or a
 * whole molecule - a reagent, a ligand, a complex - (`whole`); a whole
 * molecule read by a reagent's name (`named`: TBME, HOAc - not H2Zn or
 * PdCl2, formulas read by rule); the element, where it is one; null, where
 * it reads as nothing.
 */
export type Reading = { whole: boolean; element?: string; named?: boolean } | null;
export type Reads = (label: string) => Reading;

/** The first element after uranium: none from there on is read from letters typed small. */
const AFTER_URANIUM = 93;
const HEAVY = new Set(ELEMENTS.filter((e) => e.number >= AFTER_URANIUM).map((e) => e.symbol));

type Token = { text: string };

let tokens: { from: readonly string[]; words: Token[]; names: Set<string> } | null = null;
/** What a label is read into: element symbols, and the groups' names (the user's own among them, as they are now) - each as it is written. */
function vocabulary(): { words: Token[]; names: Set<string> } {
  const units = labelUnitNames();
  if (tokens?.from !== units) {
    const symbols = ELEMENTS.map((e) => e.symbol).sort();
    // (a group's name of one letter - Z, for Cbz - is no unit a label is read
    // into, a letter being one on its own: a word, all the same)
    const letters = new Set(
      [...GROUPS, ...customAbbreviations()]
        .flatMap((g) => [g.label, ...(g.also ?? [])])
        .filter((t) => t.length === 1 && t !== "R" && !symbols.includes(t)),
    );
    const words = [
      // (by symbol, as ever: ties among writings keep this order)
      ...symbols.map((text) => ({ text })),
      ...units.map((text) => ({ text })),
      // (an Rgroup's R)
      { text: "R" },
      ...[...letters].map((text) => ({ text })),
    ];
    tokens = { from: units, words, names: new Set(words.map((w) => w.text)) };
  }
  return tokens;
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
  const { words } = vocabulary();
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

/** A charge typed at a label's end: N+, O-, O−. */
const CHARGE = /[+\u2212-]+$/;

/**
 * A label typed as it is drawn on a bond's left, or with HN before a group,
 * as it reads from the bond: turned round where every unit of it is a word
 * (`inWords`), or with its H after the atom it was typed before.
 */
function forwards(label: string, reads: Reads): string[] {
  // (a charge typed last stays last: HO- is OH-, H3N+ NH3+)
  const sign = CHARGE.exec(label);
  if (sign && sign.index > 0) return forwards(label.slice(0, sign.index), reads).map((f) => f + sign[0]);
  const out: string[] = [];
  const back = reversedLabel(label);
  if (back !== label && inWords(label, reads)) out.push(back);
  out.push(...hFirst(label, reads).map((h) => h.text));
  return out;
}

/**
 * H typed before an atom - and before a group, if anything follows it - as
 * it reads from the bond: HN is NH, H2N NH2, HNFmoc NHFmoc. The atom's
 * symbol is of one letter or of two, and the group's name as it is
 * written, a small letter or a digit first or not - HNtBu is NHtBu, HNiPr
 * NHiPr, HN2-Naph NH2-Naph, HNMOM NHMOM (though NMO is a reagent's name) -
 * but what follows the atom must read: HSIEt3 is no SHIEt3, IEt3 reading
 * as nothing.
 */
function hFirst(label: string, reads: Reads): { text: string; atom: string; group: Reading }[] {
  const h = /^H(\d*)/.exec(label);
  if (!h) return [];
  const out: { text: string; atom: string; group: Reading }[] = [];
  for (const length of [1, 2]) {
    const atom = label.slice(h[0].length, h[0].length + length);
    if (atom.length !== length || !/^[A-Z][a-z]?$/.test(atom) || atom === "H") continue;
    const rest = label.slice(h[0].length + length);
    const group = rest ? reads(rest) : null;
    if (rest && !group) continue;
    out.push({ text: `${atom}H${h[1]}${rest}`, atom, group });
  }
  return out;
}

/** The atoms a group hangs from as a label reads from its bond: OAc, SMe, NHBoc. */
const HETEROATOM = /^(N|O|P|S|Se)$/;

/**
 * H typed before a heteroatom and a group, as it reads from the bond, where
 * that is part of a structure - a charge typed last kept last: HNiPr is
 * NHiPr. Read so even where the letters as they are written read as a
 * whole molecule (HNiPr is a complex of nickel too): a label stands for
 * part of a structure.
 */
function heteroatomFirst(label: string, reads: Reads): string[] {
  const sign = CHARGE.exec(label);
  const charge = sign && sign.index > 0 ? sign[0] : "";
  return hFirst(label.slice(0, label.length - charge.length), reads)
    .filter((h) => h.group && !h.group.whole && HETEROATOM.test(h.atom))
    .map((h) => h.text + charge)
    .filter((f) => {
      const r = reads(f);
      return !!r && !r.whole;
    });
}

/**
 * Whether a label kept is a heteroatom with its H, or with one group behind
 * it - OH, NH2, SMe, OAc, NHBoc - its charge, if it has one, aside. A
 * condensed group, a carbon and what is on it, is one group: SCH3, OCH2CH3.
 */
function onHeteroatom(kept: string, reads: Reads): boolean {
  const [first, ...rest] = labelUnits(kept.replace(CHARGE, ""));
  if (!first || !HETEROATOM.test(first)) return false;
  const after = rest[0] && /^H\d*$/.test(rest[0]) ? rest.slice(1) : rest;
  if (after.length > 1 && /^C\d*$/.test(after[0])) {
    const condensed = reads(after.join(""));
    return !!condensed && !condensed.whole;
  }
  if (after.length !== 1) return after.length === 0 && rest.length > 0;
  const group = reads(after[0].replace(/\d+$/, ""));
  return !!group && !group.whole && !group.element;
}

/**
 * Whether every unit of a writing is a word - an element, a group, R - with
 * its count, or no letter at all: what may be read the other way round, as
 * drawn on a bond's left (MES is no MeS, nor SEM).
 */
function inWords(text: string, reads: Reads): boolean {
  const { names } = vocabulary();
  return labelUnits(text).every((u) => {
    const held = /^\((.*)\)\d*$/.exec(u);
    if (held) return inWords(held[1], reads);
    const word = u.replace(/\d+$/, "");
    return !/[A-Za-z]/.test(word) || names.has(u) || names.has(word) || !!reads(u) || !!reads(word);
  });
}

/** Whether a reading of what was typed may stand: no element after uranium read from letters typed small. */
function allowed(typed: string, text: string, r: Reading): boolean {
  return !(r?.element && HEAVY.has(r.element) && text !== typed);
}

/**
 * The prefixes set in italics (lib/chem/abbreviations `italicUnits`) - n,
 * s, t, sec, tert, o, m, p - before a group, at a label's start or after
 * what is not a letter: tBu, CO2tBu, secBu, pTs. Not i: iPr is upright, as
 * isopropyl is.
 */
const ITALIC_PREFIX = /(^|[^A-Za-z-])(sec|tert|[nstomp])(?=[A-Z])/g;

/** A label with its italic prefixes hyphenated (rule 4): t-Bu, CO2t-Bu, sec-Bu, p-Ts. */
function hyphened(label: string): string {
  return label.replace(ITALIC_PREFIX, "$1$2-");
}

/** Whether one rank comes before another: the first place they differ decides. */
function before(a: readonly number[], b: readonly number[]): boolean {
  const k = a.findIndex((v, i) => v !== b[i]);
  return k >= 0 && a[k] < b[k];
}

/**
 * The reading chosen for what was typed: the writing shown, and the label it
 * is kept as. Part of a structure before a whole molecule - a label stands
 * for part of one - then a heteroatom with its H or a group, as drawn on a
 * bond's left (ho is HO, OH - not holmium; mes MeS, SMe - not mesityl),
 * then of whole molecules a reagent's name (tbme is TBME, hoac HOAc - not
 * TbMe, HoAc), then the fewest letters made capitals.
 */
function chosen(typed: string, reads: Reads): { shown: string; kept: string } {
  if (!typed) return { shown: typed, kept: typed };
  const own = reads(typed);
  // (what reads as it is typed is that - a whole molecule but for HN before a group: HNiPr is NHiPr)
  if (own) return { shown: typed, kept: (own.whole && heteroatomFirst(typed, reads)[0]) || typed };
  let best: { shown: string; kept: string; rank: number[] } | null = null;
  const consider = (shown: string, kept: string, r: Reading, w: Writing) => {
    if (!r || !allowed(typed, kept, r)) return;
    // (typed as drawn on a bond's left, a heteroatom with its H or a group: HO, MeS)
    const drawn = kept !== shown && onHeteroatom(kept, reads);
    // (a whole molecule by a reagent's name before one by a formula - rule 6)
    const rank = [r.whole ? 1 : 0, drawn ? 0 : 1, r.whole && !r.named ? 1 : 0, w.cost, w.loose, w.words];
    if (!best || before(rank, best.rank)) best = { shown, kept, rank };
  };
  let tried = 0;
  for (const w of writings(typed)) {
    if (w.cost > 0 && ++tried > 120) break;
    // (as typed - no letter made a capital - it reads as nothing: asked above;
    // or it reads with its italic prefix hyphenated, as it is kept: npent is
    // n-Pent, pTs p-Ts)
    const prefixed = hyphened(w.text);
    const r = (w.cost > 0 ? reads(w.text) : null) ?? (prefixed !== w.text ? reads(prefixed) : null);
    consider(w.text, w.text, r, w);
    // (as drawn on a bond's left - HO, AcO as typed, or aco - only what reads
    // as nothing as it is written, from letters each in a word: hcl is HCl)
    if (!r && w.loose === 0)
      for (const f of forwards(w.text, reads)) {
        // (a group, drawn the other way round: never a whole molecule)
        const back = reads(f);
        if (back && !back.whole) consider(w.text, f, back, w);
      }
    // (a whole molecule as it is written, but for HN before a group: hnipr is NHiPr)
    else if (r?.whole && w.loose === 0)
      for (const f of heteroatomFirst(w.text, reads)) consider(w.text, f, reads(f), w);
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
 * 3); its italic prefixes hyphenated where that reads (rule 4).
 */
export function keptLabel(typed: string, reads: Reads): string {
  const { kept } = chosen(typed, reads);
  const prefixed = hyphened(kept);
  return prefixed !== kept && reads(prefixed) ? prefixed : kept;
}
