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
 *    (co is Co, ph Ph, ipr iPr - not the NHC IPr). But two capitals that are
 *    an element's symbol are that element (the maintainer, 2026-10-18): SI
 *    is Si, not S and I - none after uranium
 *    (rule 2), nor where the letters as typed are a name Meno reads whole
 *    (CO, carbon monoxide), a whole molecule (HF), or typed as drawn on a
 *    bond's left to a heteroatom (HO is OH, SN NS: rule 3), nor PO, P and
 *    O; SB and EU are Sb and Eu.
 * 2. No element after uranium (Np on) is read from letters typed small:
 *    nh is NH, not nihonium; ts tosyl, not tennessine. Nor is deuterium:
 *    D is deuterium only as typed (CDCl3), pdcl2 PdCl2.
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
 *    charge typed last stays last: ho- is OH-. HN before a group is NH and
 *    the group though the letters read as a whole molecule too (HNiPr is
 *    NHiPr, not a complex of nickel).
 * 4. A prefix set in italics - n, s, t, sec, tert, o, m, p - gets its
 *    hyphen, at a label's start or after an atom: tBu is t-Bu, CO2tBu
 *    CO2t-Bu, HNtBu NHt-Bu.
 * 5. What reads as nothing stays as typed.
 * 6. A reagent's or a ligand's name comes before a metal's formula (the
 *    maintainer, 2026-10-13), whatever letters it makes capitals: no
 *    metal's symbol from letters typed small across a group's, a reagent's
 *    or a ligand's name the letters spell (tbscl is TBSCl, lah LAH, cdi
 *    CDI), nor holmium's from ho before a group, as rule 3 reads ho (hoac
 *    is HOAc, hotf HOTf), nor two elements' symbols from a group's name of
 *    two letters (phi is PhI, not PHI); then a reagent's name before a
 *    formula (cpme is CPME). Where no name is spelt, formulas are read as ever: h2zn is
 *    H2Zn, pdcl2 PdCl2, zni2 ZnI2; one typed as it is written is that
 *    (HoCl3). A group's name of one letter, Z, only as part of a structure.
 *
 * As a label is typed only letters' case changes (`liveLabel`): the same
 * letters, where they were typed, so that the caret stays where it is;
 * rules 3 and 4 are applied as it is kept (`keptLabel`).
 */
import { abbreviationOf, byRule, customAbbreviations, GENERIC_SYMBOLS, GROUPS, labelUnitNames, labelUnits, reversedLabel } from "./abbreviations";
import { ELEMENTS } from "./elements";
import { ligandOf } from "./ligands";

/**
 * What a label reads as: part of a structure - an element with its H and
 * charge, an abbreviation, a group put together by rule, an Rgroup - or a
 * whole molecule - a reagent, a ligand, a complex - (`whole`); a whole
 * molecule read by a reagent's name (`named`: TBME, HOAc - not H2Zn or
 * PdCl2, formulas read by rule), or a ligand by its name (TFP); an atom
 * carrying a group (`carrying`: NBoc, ONa); the element, where it is one;
 * null, where it reads as nothing.
 */
export type Reading = { whole: boolean; element?: string; named?: boolean; carrying?: boolean } | null;
export type Reads = (label: string) => Reading;

/** The first element after uranium: none from there on is read from letters typed small. */
const AFTER_URANIUM = 93;
const HEAVY = new Set(ELEMENTS.filter((e) => e.number >= AFTER_URANIUM).map((e) => e.symbol));

/**
 * A word a label is read into: `letter`, a group's name of one letter (Z);
 * `metal`, a metal's symbol - not a group's name too (Ac, Pr), nor a
 * nonmetal's or a metalloid's.
 */
type Token = { text: string; letter?: true; metal?: true };

/** The elements that are no metals, as rule 6 reads a metal's formula: the nonmetals and the metalloids. */
const NOT_METALS = new Set("H He B C N O F Ne Si P S Cl Ar Ge As Se Br Kr Sb Te I Xe At Rn".split(" "));

type Vocabulary = { words: Token[]; names: Set<string>; units: Set<string>; byLetter: Map<string, string[]>; metals: Set<string>; letters: Set<string> };
let tokens: (Vocabulary & { from: readonly string[] }) | null = null;
/**
 * What a label is read into: element symbols, and the groups' names (the
 * user's own among them, as they are now) - each as it is written; and the
 * names of groups, reagents and ligands that are no element's symbol, by
 * their first letter (`byLetter`: TBS, TMS, LAH, CDI), which rule 6 reads a
 * metal's symbol against.
 */
function vocabulary(): Vocabulary {
  const units = labelUnitNames();
  if (tokens?.from !== units) {
    const symbols = ELEMENTS.map((e) => e.symbol).sort();
    const unitSet = new Set(units);
    // (a group's name of one letter - Z, for Cbz - is no unit a label is read
    // into, a letter being one on its own: a word, all the same)
    const letters = new Set(
      [...GROUPS, ...customAbbreviations()]
        .flatMap((g) => [g.label, ...(g.also ?? [])])
        .filter((t) => t.length === 1 && t !== "R" && !symbols.includes(t)),
    );
    const words: Token[] = [
      // (by symbol, as ever: ties among writings keep this order)
      ...symbols.map((text) => (NOT_METALS.has(text) || unitSet.has(text) ? { text } : { text, metal: true as const })),
      ...units.map((text) => ({ text })),
      // (an Rgroup's R; an electrophile's E, a name one letter long)
      { text: "R" },
      ...[...GENERIC_SYMBOLS.keys()].filter((g) => !units.includes(g)).map((text) => ({ text })),
      ...[...letters].map((text) => ({ text, letter: true as const })),
    ];
    // (by their first character, a letter as a capital: what a letter typed, small or not, may begin - 1-Naph by its 1)
    const byLetter = new Map<string, string[]>();
    for (const u of units) {
      if (symbols.includes(u)) continue;
      const k = u[0].toUpperCase();
      byLetter.set(k, [...(byLetter.get(k) ?? []), u]);
    }
    const metals = new Set(words.filter((w) => w.metal).map((w) => w.text));
    tokens = { from: units, words, names: new Set(words.map((w) => w.text)), units: unitSet, byLetter, metals, letters };
  }
  return tokens;
}

const small = (c: string) => c >= "a" && c <= "z";

/**
 * A way of writing what was typed: the text, how many letters it makes
 * capitals, of how many words, and how many letters typed small stay as
 * they were, in no word; and how many of its words are a group's name of
 * one letter (`letters`: Z) - the fewest, as its words are found.
 */
type Writing = { text: string; cost: number; words: number; loose: number; letters: number };

/** Whether `word` may be read from the letters typed at `at`: each the same, or typed small and read as its capital - and how many it makes capitals. */
function fit(typed: string, at: number, word: string): number | null {
  if (at + word.length > typed.length) return null;
  let cost = 0;
  for (let k = 0; k < word.length; k++) {
    const t = typed[at + k];
    const c = word[k];
    if (t === c) continue;
    if (small(t) && c === t.toUpperCase()) cost++;
    else return null;
  }
  return cost;
}

/** The heteroatoms whose symbol is a letter, as an H typed before them reads: H and O, not holmium. */
const HETERO_LETTER = /^[NOPS]$/;

/**
 * Every way the letters typed can be written as the vocabulary's words, by
 * how many letters each makes capitals: as typed, at no cost, letter by
 * letter where no word fits.
 */
function writings(typed: string, most = 400): Writing[] {
  const at: Map<string, Omit<Writing, "text">>[] = [new Map([["", { cost: 0, words: 0, loose: 0, letters: 0 }]])];
  for (let i = 1; i <= typed.length; i++) at.push(new Map());
  const { words } = vocabulary();
  // (fewest capitals made, then fewest one-letter names)
  const better = (a: Omit<Writing, "text">, b: Omit<Writing, "text">) => a.cost - b.cost || a.letters - b.letters || a.loose - b.loose || a.words - b.words;
  for (let i = 0; i < typed.length; i++) {
    const here = at[i];
    if (!here.size) continue;
    const put = (j: number, add: string, cost: number, word: boolean, loose: number, letters = 0) => {
      const there = at[j];
      for (const [text, w] of here) {
        const next = { cost: w.cost + cost, words: w.words + (word ? 1 : 0), loose: w.loose + loose, letters: w.letters + letters };
        const was = there.get(text + add);
        // (the same text, its words found another way - Zn and Bu, Z and nBu: the least of each)
        if (!was) there.set(text + add, next);
        else
          there.set(text + add, {
            cost: Math.min(was.cost, next.cost),
            words: Math.min(was.words, next.words),
            loose: Math.min(was.loose, next.loose),
            letters: Math.min(was.letters, next.letters),
          });
      }
      // (only the likeliest kept on)
      if (there.size > most) at[j] = new Map([...there].sort((a, b) => better(a[1], b[1])).slice(0, most));
    };
    // the letter as typed
    put(i + 1, typed[i], 0, false, small(typed[i]) ? 1 : 0);
    for (const w of words) {
      const cost = fit(typed, i, w.text);
      if (cost === null) continue;
      put(i + w.text.length, w.text, cost, true, 0, w.letter ? 1 : 0);
    }
  }
  return [...at[typed.length]].map(([text, w]) => ({ text, ...w })).sort((a, b) => better(a, b) || (a.text < b.text ? -1 : 1));
}

/** The elements' symbols: what an H typed before is read before (HN is NH; HTf is no TH and F). */
const SYMBOLS = new Set(ELEMENTS.map((e) => e.symbol));

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
    if (atom.length !== length || !SYMBOLS.has(atom) || atom === "H") continue;
    // (the group read as it is written, and with its italic prefix hyphenated: HNsecBu is NHsec-Bu)
    const written = label.slice(h[0].length + length);
    for (const rest of new Set([written, hyphened(written)])) {
      const group = rest ? reads(rest) : null;
      if (rest && !group) continue;
      out.push({ text: `${atom}H${h[1]}${rest}`, atom, group });
    }
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

/**
 * Whether a reading of what was typed may stand: no element after uranium read from letters typed small, nor deuterium - a D
 * from a d typed small, read as hydrogen of mass 2 (pdcl2 is PdCl2, not PDCl2): D is deuterium only as typed (CDCl3).
 */
function allowed(typed: string, text: string, r: Reading): boolean {
  if (r?.element && HEAVY.has(r.element) && text !== typed) return false;
  return !([...text].some((c, i) => c === "D" && typed[i] === "d") && deuterated(text));
}

/** Whether a label reads with deuterium in it: a group (CD3) or a whole molecule (CDCl3) with hydrogen of mass 2. */
function deuterated(label: string): boolean {
  const a = abbreviationOf(label);
  if (!a) return false;
  if (a.smiles.includes("[2H]")) return true;
  return !!a.kind && !!byRule(label)?.atoms.some((x) => x.el === "H" && x.isotope === 2);
}

/**
 * The prefixes set in italics (lib/chem/abbreviations `italicUnits`) - n,
 * s, t, sec, tert, o, m, p - before a group: tBu, CO2tBu, secBu, pTs, and
 * after an atom, NHtBu, KOtBu, as well. Not i: iPr is upright, as isopropyl
 * is.
 */
const ITALIC_PREFIX = /(sec|tert|[nstomp])(?=[A-Z])/g;

/**
 * A label with its italic prefixes hyphenated (rule 4): t-Bu, CO2t-Bu,
 * sec-Bu, p-Ts, NHt-Bu, P(o-Tol)3 - where a prefix begins one of its units
 * (an element's symbol with its letters, a group's name, a letter on its
 * own), not inside one: SnBu3 and CsF are no S n-Bu3 or C s-F, and a
 * ligand's name as it is written stays (Me4tBuXPhos). And a prefix of
 * letters - sec, tert - after what is no small letter, or one of a letter
 * after an atom's H where the two would be an element's symbol no label
 * means (rule 2) and no group's name: HNsecBu is NHsec-Bu, NHsBu NHs-Bu -
 * not hassium; but FmBoc and TsAll stay, Fm and Ts groups, and HSBu.
 */
function hyphened(label: string): string {
  if (!/(sec|tert|[nstomp])[A-Z]/.test(label)) return label;
  const units = unitsAt(label);
  return label.replace(ITALIC_PREFIX, (prefix: string, _p: string, k: number) => {
    if (label[k - 1] === "-") return prefix;
    const unit = units.find((u) => u.at <= k && k < u.at + u.unit.length);
    const symbol = unit?.unit.replace(/\d+$/, "") ?? "";
    if (unit?.at === k) return SYMBOLS.has(symbol) ? prefix : `${prefix}-`;
    if (prefix.length > 1 && !/[a-z]/.test(label[k - 1] ?? "")) return `${prefix}-`;
    // (after an atom's H - NHs-Bu - not at the label's start, where h and s are H and S: hsbu is HSBu)
    if (unit && unit.at === k - 1 && unit.at > 0 && HEAVY.has(symbol) && !vocabulary().units.has(symbol)) return `${prefix}-`;
    return prefix;
  });
}

/** Where the letters typed make a name of two letters or more (`vocabulary` `byLetter`): what a metal's symbol is not made across. */
type Span = { from: number; to: number; name: string };

function namesIn(typed: string): Span[] {
  const { byLetter } = vocabulary();
  const out: Span[] = [];
  for (let i = 0; i < typed.length; i++)
    for (const name of byLetter.get(typed[i].toUpperCase()) ?? []) if (fit(typed, i, name) !== null) out.push({ from: i, to: i + name.length, name });
  return out;
}

/** A label's units (lib/chem/abbreviations `labelUnits`) and where each stands - those in parentheses among them, not the parentheses. */
function unitsAt(text: string, from = 0): { unit: string; at: number }[] {
  // (a writing's units are asked for as it is shown and as it is kept, keystroke after keystroke: kept a while)
  const key = `${from}:${text}`;
  const seen = UNITS_SEEN.get(key);
  if (seen && seen.of === labelUnitNames()) return seen.units;
  const out: { unit: string; at: number }[] = [];
  let at = from;
  for (const unit of labelUnits(text)) {
    const held = /^\((.*)\)\d*$/.exec(unit);
    if (held) out.push(...unitsAt(held[1], at + 1));
    else out.push({ unit, at });
    at += unit.length;
  }
  if (UNITS_SEEN.size > 5000) UNITS_SEEN.clear();
  UNITS_SEEN.set(key, { of: labelUnitNames(), units: out });
  return out;
}

/** Writings' units as `unitsAt` found them, with the names they were read into then (the user's own change them). */
const UNITS_SEEN = new Map<string, { of: readonly string[]; units: { unit: string; at: number }[] }>();

/**
 * How a writing of what was typed reads, as its units are read: how many of
 * them are a group's name of one letter (Z), and an element after uranium
 * made from letters typed small (rule 2: hsbu is no HsBu); and how many metals' symbols
 * it makes from letters typed small where they are not meant (rule 6) -
 * across a group's, a reagent's or a ligand's name the letters typed make
 * too - Tb of tbscl, its TBS; La of lah, its LAH - or of an H and a
 * heteroatom - Ho of hotf, its H and O (ho is HO, not holmium: the
 * maintainer, 2026-10-12); and how many groups' names of two letters it
 * reads as two elements' symbols (P and H of PHI, across Ph).
 */
function unitsMade(typed: string, text: string, spans: readonly Span[]): { letters: number; across: number; heavy: number } {
  const { metals, letters, units } = vocabulary();
  let ones = 0;
  let across = 0;
  let heavy = 0;
  // (a name this writing writes where the letters typed make it)
  const written = (from: number, to: number) => spans.some((n) => n.from === from && n.to === to && text.slice(from, to) === n.name);
  const read = unitsAt(text);
  // (a group's name of two letters typed small, read as two elements' symbols
  // of a letter each: Ph as P and H - phi is PhI, iodobenzene, not PHI)
  const lone = new Set(read.filter(({ unit }) => /^[A-Z]\d*$/.test(unit) && SYMBOLS.has(unit[0])).map(({ at }) => at));
  const split = (n: Span) => n.to - n.from === 2 && lone.has(n.from) && lone.has(n.from + 1) && small(typed[n.from]) && small(typed[n.from + 1]) && !written(n.from, n.to);
  for (const n of spans) if (split(n)) across++;
  for (const { unit, at } of read) {
    const symbol = unit.replace(/\d+$/, "");
    if (letters.has(symbol)) ones++;
    // (an element after uranium from letters typed small - rule 2 - not a
    // group named as one is, Ts, Fm, nor a prefix typed with its hyphen, the
    // s of NHs-Bu)
    if (HEAVY.has(symbol) && !units.has(symbol)) {
      if (fit(typed, at, symbol) && text[at + symbol.length] !== "-") heavy++;
      continue;
    }
    // (a metal's symbol typed as it is written is that: HoCl3)
    if (!metals.has(symbol) || !fit(typed, at, symbol)) continue;
    const end = at + symbol.length;
    // (across a name this writing does not write there - Tb of TbSCl, across
    // TBS - not one in a name it writes - Na of 1-Naph - nor across one where
    // it writes another: Ni of HNiPr, its iPr written, though IPr fits too)
    if (spans.some((n) => n.from <= at && n.to >= end && written(n.from, n.to))) continue;
    const overName = spans.some((n) => n.from < end && n.to > at && !(n.from === at && n.to === end) && !written(n.from, n.to));
    if (overName || (symbol[0] === "H" && HETERO_LETTER.test((symbol[1] ?? "").toUpperCase()))) across++;
  }
  return { letters: ones, across, heavy };
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
 * then of whole molecules a reagent's name (cpme is CPME, not CpMe),
 * then the fewest letters made capitals. Before all of these, no metal's
 * symbol made where it is not meant (rule 6: tbscl is TBSCl, not TbSCl;
 * lah LAH, not LaH; hotf HOTf, not HoTf); and a group's name of one letter
 * only as part of a structure (co2z is CO2Z; zni2 ZnI2, not ZNi2).
 */
/**
 * Two capitals typed - a charge after them, if any - that are an element's
 * symbol, read as that element (rule 1): SI is Si. None after uranium (rule 2); none where the letters as typed are
 * a name Meno reads whole - a ligand's, a reagent's, a group's (CO) - or a
 * whole molecule (HF), or are read the other way round, as drawn on a
 * bond's left, to a heteroatom first (HO, SN: rule 3 - SB and EU are the
 * elements), nor PO, which is P and O (the maintainer, 2026-10-18).
 */
function symbolInAnyCase(typed: string, reads: Reads): string | null {
  const m = /^([A-Z]{2})([+\u2212-]*)$/.exec(typed);
  if (!m) return null;
  const symbol = m[1][0].toUpperCase() + m[1][1].toLowerCase();
  if (!SYMBOLS.has(symbol) || HEAVY.has(symbol)) return null;
  if (vocabulary().units.has(m[1]) || ligandOf(m[1], true)) return null;
  if (reads(typed)?.whole) return null;
  // (turned round as drawn on a bond's left only to a heteroatom first, as rule 3 reads it - OH, SH, NS - not SB to BS, nor EU to UE)
  if (forwards(typed, reads).some((f) => { const r = reads(f); return !!r && !r.whole && HETEROATOM.test(labelUnits(f)[0] ?? ""); })) return null;
  // (PO is P and O, the maintainer's ruling, 2026-10-18: Po, so typed, is polonium)
  if (m[1] === "PO") return null;
  const as = symbol + m[2];
  return reads(as)?.element === symbol ? as : null;
}

function chosen(typed: string, reads: Reads): { shown: string; kept: string } {
  if (!typed) return { shown: typed, kept: typed };
  // (an element's symbol in another case: that element - rule 1)
  const symbol = symbolInAnyCase(typed, reads);
  if (symbol) return { shown: symbol, kept: symbol };
  const own = reads(typed);
  // (what reads as it is typed is that - a whole molecule but for HN before a group: HNiPr is NHiPr)
  if (own) return { shown: typed, kept: (own.whole && heteroatomFirst(typed, reads)[0]) || typed };
  let best: { shown: string; kept: string; rank: number[] } | null = null;
  const spans = namesIn(typed);
  const madeOf = new Map<string, { letters: number; across: number; heavy: number }>();
  const madeFor = (shown: string) => {
    const made = madeOf.get(shown) ?? unitsMade(typed, shown, spans);
    madeOf.set(shown, made);
    return made;
  };
  // (a reagent's or a ligand's name the letters typed spell, whatever their case: before an atom carrying a group - nbs is NBS, not NBs;
  // tfp TFP, not TfP - the maintainer's ruling that their names win, 2026-10-13)
  let spelt: boolean | null = null;
  const spells = () => (spelt ??= labelUnitNames().some((u) => u.toLowerCase() === typed.toLowerCase() && !!reads(u)?.named));
  const consider = (shown: string, kept: string, r: Reading, w: Writing) => {
    if (!r || !allowed(typed, kept, r)) return;
    if (r.carrying && spells()) return;
    const made = madeFor(shown);
    // (Z, for Cbz, as part of a structure: no complex of a metal and Z)
    if (made.letters > 0 && r.whole) return;
    // (typed as drawn on a bond's left, a heteroatom with its H or a group: HO, MeS)
    const drawn = kept !== shown && onHeteroatom(kept, reads);
    // (no metal made where it is not meant, then a whole molecule by a reagent's name before one by a formula - rule 6)
    const rank = [made.across, r.whole ? 1 : 0, drawn ? 0 : 1, r.whole && !r.named ? 1 : 0, w.cost, made.letters, w.loose, w.words];
    if (!best || before(rank, best.rank)) best = { shown, kept, rank };
  };
  // (as many tried of the writings each in words as of those with letters in
  // no word - a prefix's, sec of secbu - so that neither crowds the other out)
  const tried = { words: 0, loose: 0 };
  for (const w of writings(typed)) {
    if (w.cost > 0) {
      const n = w.loose === 0 ? ++tried.words : ++tried.loose;
      if (tried.words > 120 && tried.loose > 120) break;
      if (n > 120) continue;
    }
    // (as typed - no letter made a capital - it reads as nothing: asked above;
    // or it reads with its italic prefix hyphenated, as it is kept: npent is
    // n-Pent, pTs p-Ts)
    const prefixed = hyphened(w.text);
    // (no element after uranium made from letters typed small, as it is
    // written - rule 2 - though with its prefix hyphenated it may read:
    // NHsBu is no hassium, but NHs-Bu)
    const asWritten = w.cost > 0 && !madeFor(w.text).heavy ? reads(w.text) : null;
    const r = asWritten ?? (prefixed !== w.text ? reads(prefixed) : null);
    consider(w.text, w.text, r, w);
    // (as drawn on a bond's left - HO, AcO as typed, or aco - only what reads
    // as nothing as it is written, from letters each in a word, or in a
    // prefix set in italics: hcl is HCl, hnsecbu NHsec-Bu)
    if (!r && (w.loose === 0 || prefixed !== w.text))
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
