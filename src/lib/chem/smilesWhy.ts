/**
 * Why a SMILES cannot be read, in a few plain words about the SMILES itself: a formula written for it, a ring left
 * open, a parenthesis or bracket not closed, a symbol that is no element or wants brackets, an atom with more bonds
 * than it can take. Meno's own words: worked out here from the text, and from what the plugin that fills the SMILES
 * role says its toolkit made of it (`SmilesRead`: whether a SMILES reads; the problems its own check finds, as facts).
 * Nothing here is any program's.
 */
import { elementOf } from "./elements";

/** One problem the toolkit's own check finds in a SMILES it parses but cannot make sense of, as it names it. */
export type SmilesProblem = {
  /** As the toolkit names it: "AtomValenceException", "AtomKekulizeException", "KekulizeException" (others are passed by). */
  kind: string;
  /** The atom it names, by its place among the SMILES' atoms (0 the first). */
  atom?: number;
  /** That atom's element symbol, its charge, and its bonds - their orders and its explicit hydrogens summed, as written. */
  symbol?: string;
  charge?: number;
  bonds?: number;
  /** A ring's atoms it names, by place. */
  atoms?: number[];
};

/** What the toolkit makes of a SMILES: whether it reads; whether it parses at all, unchecked; the problems its check finds. */
export type SmilesRead = { reads: boolean; parsed: boolean; problems: SmilesProblem[] };

/** The atoms a SMILES may write without brackets, and those written aromatic in brackets. */
const ORGANIC = new Set(["B", "C", "N", "O", "P", "S", "F", "Cl", "Br", "I", "b", "c", "n", "o", "p", "s", "*"]);
const AROMATIC_IN_BRACKETS = new Set(["b", "c", "n", "o", "p", "s", "se", "as", "te"]);
/** A text written as a formula - SnCl4, C6H6, H2O: element symbols, each once, a count after one of them at least. */
const FORMULA = /^(?:[A-Z][a-z]?\d*)+$/;
const HALOGENS = new Set(["F", "Cl", "Br", "I"]);
/** The charges of groups 1 and 2's ions: their halides salts, written as ions. */
const IONIC = new Map<string, number>([
  ...["Li", "Na", "K", "Rb", "Cs", "Fr"].map((e) => [e, 1] as const),
  ...["Be", "Mg", "Ca", "Sr", "Ba", "Ra"].map((e) => [e, 2] as const),
]);

/** One of the 118 elements, by its symbol as written (case and all). */
const isElement = (symbol: string): boolean => elementOf(symbol) != null;
const isDigit = (ch: string): boolean => /^\p{Nd}$/u.test(ch);
const isAlpha = (ch: string): boolean => /^\p{L}$/u.test(ch);
const isLower = (ch: string): boolean => ch !== ch.toUpperCase() && ch === ch.toLowerCase();
const isUpper = (ch: string): boolean => ch !== ch.toLowerCase() && ch === ch.toUpperCase();

/** 1st, 2nd, 3rd, 4th... */
export function ordinal(k: number): string {
  const tens = k % 100;
  const suffix = tens >= 10 && tens <= 20 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[k % 10] ?? "th";
  return `${k}${suffix}`;
}

/** An atom's symbol and charge as written: O-, N+, Fe2+. */
function withCharge(symbol: string, q: number): string {
  return symbol + (q === 0 ? "" : (Math.abs(q) === 1 ? "" : String(Math.abs(q))) + (q > 0 ? "+" : "-"));
}

/** The elements of a text that reads like a formula, with their counts, in order - or null. */
function asFormula(text: string): [string, number][] | null {
  if (!FORMULA.test(text)) return null;
  const parts = [...text.matchAll(/([A-Z][a-z]?)(\d*)/g)].map((m) => [m[1], m[2] ? Number(m[2]) : 1] as [string, number]);
  const names = parts.map(([name]) => name);
  if (new Set(names).size !== names.length || !names.every(isElement)) return null;
  return Math.max(...parts.map(([, n]) => n)) >= 2 ? parts : null;
}

/**
 * What a SMILES for a formula is like: a halide's of one atom - a salt of groups 1 and 2 as ions, [Mg+2].[Cl-].[Cl-],
 * where as many halogens as its charge; any other, each halogen bonded to the one atom, SnCl4 as Cl[Sn](Cl)(Cl)Cl,
 * where that reads - or an example. A SMILES for it, not the one: a formula does not say how its atoms are bonded
 * (AlCl3 is two in one as a solid).
 */
async function formulaSaid(parts: [string, number][], read: (smiles: string) => Promise<SmilesRead>): Promise<string> {
  if (parts.length === 2 && parts[0][1] === 1 && parts[0][0] !== "H" && HALOGENS.has(parts[1][0])) {
    const [[centre], [x, n]] = parts;
    let smiles: string | null;
    const charge = IONIC.get(centre);
    if (charge != null) smiles = n === charge ? `[${centre}+${charge > 1 ? charge : ""}]` + `.[${x}-]`.repeat(n) : null;
    else {
      const atom = ORGANIC.has(centre) ? centre : `[${centre}]`;
      smiles = x + atom + `(${x})`.repeat(Math.max(0, n - 2)) + x;
    }
    if (smiles && (await read(smiles)).reads) return `it reads like a formula; a SMILES for it is ${smiles}`;
  }
  return "it reads like a formula; a SMILES writes the atoms and how they are bonded, as CCO for ethanol";
}

/**
 * Why `smiles` cannot be read, or null where none of these says it. Looked at in this order: empty; written as a
 * formula; each bracket, parenthesis, ring label and atom as written; then the problems the toolkit's own check finds
 * (`read`: what the plugin that fills the SMILES role made of it).
 */
export async function whyNotRead(smiles: string, read: (smiles: string) => Promise<SmilesRead>): Promise<string | null> {
  const s = smiles.trim();
  if (!s) return "it is empty";
  const formula = asFormula(s);
  if (formula) return formulaSaid(formula, read);
  let depth = 0;
  // (each ring label open, with where it was opened - in the order opened)
  const rings = new Map<string, number>();
  // (where each atom is written, as it is written), in order
  const atoms: [number, string][] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "[") {
      const end = s.indexOf("]", i);
      if (end < 0) return "a [ is not closed";
      const inside = s.slice(i + 1, end);
      const sym = /^\p{Nd}*([A-Z][a-z]?|se|as|te|[a-z]|\*)/u.exec(inside);
      if (!sym) return `[${inside}] names no element`;
      const name = sym[1];
      if (name !== "*" && !(AROMATIC_IN_BRACKETS.has(name) || isElement(name))) return `${name} is not an element`;
      atoms.push([i, s.slice(i, end + 1)]);
      i = end + 1;
      continue;
    }
    if (ch === "]") return "a ] closes no [";
    if (ch === "(") depth++;
    else if (ch === ")") {
      if (depth === 0) return "a ) closes no (";
      depth--;
    } else if (isDigit(ch) || ch === "%") {
      let label: string;
      if (ch === "%" && s.slice(i + 1, i + 2) === "(") {
        const close = s.indexOf(")", i);
        label = close > 0 ? s.slice(i, close + 1) : s.slice(i);
      } else label = ch === "%" ? s.slice(i, i + 3) : ch;
      if (rings.has(label)) rings.delete(label);
      else rings.set(label, i);
      i += label.length;
      continue;
    } else if (isAlpha(ch) || ch === "*") {
      const two = s.slice(i, i + 2);
      if (two === "Cl" || two === "Br") {
        atoms.push([i, two]);
        i += 2;
        continue;
      }
      if (ch === "H") return "H is left out of a SMILES, or written in brackets with its atom: CCO, or [CH3]";
      if (!ORGANIC.has(ch)) {
        // (an element written without the brackets it needs - Na, Fe, the capital read as an atom of its own - or no element at all)
        const pair = i > 0 && isLower(ch) && isUpper(s[i - 1]) ? s[i - 1] + ch : null;
        if (pair && isElement(pair)) return `${pair} is written in brackets: [${pair}]`;
        const own = two.length === 2 && isLower(two[1]) && isElement(two) ? two : ch;
        if (isUpper(own[0]) && isElement(own)) return `${own} is written in brackets: [${own}]`;
        return `${ch} is not an element`;
      }
      atoms.push([i, ch]);
    }
    i++;
  }
  if (rings.size) {
    let first: [string, number] | null = null;
    for (const [label, at] of rings) if (!first || at < first[1]) first = [label, at];
    return `a ring is left open: ${first![0]} is opened and not closed`;
  }
  if (depth > 0) return "a ( is not closed";
  const made = await read(s);
  if (!made.parsed) return null;
  for (const problem of made.problems) {
    if (problem.kind === "AtomValenceException" && problem.atom != null) {
      return `its ${ordinal(problem.atom + 1)} atom, ${withCharge(problem.symbol ?? "", problem.charge ?? 0)}, has ${problem.bonds} bonds, more than it can take`;
    }
    if (problem.kind === "AtomKekulizeException" && problem.atom != null) {
      // (an aromatic atom, in lowercase, in no ring: an element written without its brackets - Co, Cs, Pb, read as C and o - or so)
      const k = problem.atom;
      if (k < atoms.length) {
        const [at, written] = atoms[k];
        const pair = at > 0 && written.length === 1 && isLower(written) && isUpper(s[at - 1]) ? s[at - 1] + written : null;
        if (pair && isElement(pair)) return `${pair} is written in brackets: [${pair}]`;
      }
      return `its ${ordinal(k + 1)} atom, ${(problem.symbol ?? "").toLowerCase()}, is written aromatic, in lowercase, but is in no ring`;
    }
    if (problem.kind === "KekulizeException" && problem.atoms?.length) {
      const ring = [...problem.atoms].sort((a, b) => a - b);
      const listed = ring.slice(0, -1).map((a) => String(a + 1)).join(", ") + ` and ${ring[ring.length - 1] + 1}`;
      return `its aromatic ring of ${ring.length} atoms (${listed}) cannot have alternating double bonds`;
    }
  }
  return null;
}

/** What the plugin that fills the SMILES role says when it cannot read one: its words, before Meno's why. */
export const NOT_READ = "This SMILES could not be read.";

/** A SMILES not read, said: Meno's why where it finds one (`whyNotRead`), else as it was said - and as it always was where finding why fails. */
export async function notReadSaid(smiles: string, read: (smiles: string) => Promise<SmilesRead>): Promise<string> {
  let why: string | null = null;
  try {
    why = await whyNotRead(smiles, read);
  } catch {
    why = null;
  }
  return why ? `This SMILES could not be read: ${why}.` : NOT_READ;
}
