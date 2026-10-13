/**
 * Typing a label: which key starts one, and what the text typed becomes.
 *
 * With an input method on (Japanese, say), a key pressed over an atom comes
 * as the input method's own - `key` is "Process" or the kana it will make,
 * and `keyCode` 229 - but the key the hand pressed is still in `code`. A
 * label is chemistry, typed in Latin letters, so that key is what starts
 * it. And while the input method is composing, the text in the box is its
 * own: changing it under it (capitalising the first letter) makes it put
 * its text in again, several times over. The label's own rules are applied
 * once the text is committed.
 */

import { abbreviationOf, GENERIC_SYMBOLS } from "../../../../lib/chem/abbreviations";
import type { Reading } from "../../../../lib/chem/smartLabel";
import { isElementSymbol } from "../../../../lib/roles/molblock";

type KeyLike = { key: string; code?: string; keyCode?: number; isComposing?: boolean };

/** The letter a key pressed over an atom starts its label with, or null. */
export function labelKey(e: KeyLike): string | null {
  if (e.key && e.key.length === 1 && /[a-zA-Z]/.test(e.key) && !e.isComposing && e.keyCode !== 229) {
    return e.key;
  }
  // an input method's key: the letter on the key pressed
  if (e.isComposing || e.keyCode === 229) {
    const m = /^Key([A-Z])$/.exec(e.code ?? "");
    return m ? m[1].toLowerCase() : null;
  }
  return null;
}

/**
 * What a label reads as (lib/chem/smartLabel `Reading`): an element - with
 * its H, its charge, its mass number - or a charge alone, an Rgroup, a
 * symbol for a kind of group (PG, Nu), or what the abbreviations read -
 * Meno's, the user's own, those put together by rule - part of a
 * structure; a reagent or a complex, a whole molecule.
 * A group named as an element is - Ac, Pr, Ts, Fm, At - is the group (the
 * maintainer, 2026-10-10).
 */
export function labelReading(label: string): Reading {
  if (!label) return null;
  const read = readLabel(label, isElementSymbol);
  const named = abbreviationOf(label);
  if (read.kind === "element" && named && isElementSymbol(label)) return { whole: false };
  if (read.kind !== "text") return { whole: false, ...(read.kind === "element" ? { element: read.el } : {}) };
  if (/^R\d+$/.test(label)) return { whole: false };
  // (a symbol for a kind of group - PG, Nu, Hal - alone, or behind what
  // reads as part of a structure: OPG, NHPG, CH2Hal - its element said, so
  // that none after uranium is read from letters typed small: NHPG, not NhPG)
  const generic = named ? undefined : [...GENERIC_SYMBOLS.keys()].find((g) => label.endsWith(g));
  if (generic && label === generic) return { whole: false };
  const before = generic ? labelReading(label.slice(0, -generic.length)) : null;
  if (before && !before.whole) return { whole: false, ...(before.element ? { element: before.element } : {}) };
  if (!named) return null;
  return { whole: named.kind === "reagent" || named.kind === "complex" };
}

/**
 * What a typed label says of its atom. An element's symbol, with an
 * isotope's mass number before it, its H after it and a charge last - 13C,
 * NH3+, O-, Fe2+, Fe+2, N++ - is that element with that charge (the H the
 * drawing works out for itself, as it does for any atom). A charge alone -
 * +, 2-, - - is the atom as it is with that charge. Anything else - Me,
 * OMe, CO2H - is a label, as typed, with no charge.
 */
export type ReadLabel =
  | { kind: "element"; el: string; charge: number; isotope?: number }
  | { kind: "charge"; charge: number }
  | { kind: "text"; el: string };

const SIGN = "[+\\-\\u2212]";

/** A charge as typed - +, ++, 2+, +2, -, 3- - or null. */
function readCharge(s: string): number | null {
  if (!s) return 0;
  const sign = (c: string) => (c === "+" ? 1 : -1);
  let m = new RegExp(`^(${SIGN})\\1*$`).exec(s);
  if (m) return sign(m[1]) * s.length;
  m = new RegExp(`^(\\d+)(${SIGN})$`).exec(s) ?? new RegExp(`^(${SIGN})(\\d+)$`).exec(s);
  if (!m) return null;
  const [n, c] = /\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
  return sign(c) * Number.parseInt(n);
}

export function readLabel(text: string, isElement: (s: string) => boolean): ReadLabel {
  const t = text.trim();
  const alone = readCharge(t);
  if (t && alone != null) return { kind: "charge", charge: alone };
  const m = new RegExp(`^(\\d{1,3})?([A-Z][a-z]?)(H\\d*)?((?:${SIGN}|\\d)*)$`).exec(t);
  if (m && isElement(m[2])) {
    const charge = readCharge(m[4]);
    if (charge != null) {
      return { kind: "element", el: m[2], charge, ...(m[1] ? { isotope: Number.parseInt(m[1]) } : {}) };
    }
  }
  return { kind: "text", el: t };
}

/**
 * An atom's label as it is typed: the mass number, the symbol and the
 * charge (2+, -), what `readLabel` reads back. A carbon with none of them
 * is typed as nothing - its label is its bonds' meeting.
 */
export function labelTextOf(a: { el: string; charge?: number; isotope?: number; rgroups?: number[] }): string {
  // (an Rgroup as it is typed: R1)
  if (a.el === "R#") return `R${a.rgroups?.[0] ?? ""}`;
  const q = a.charge ?? 0;
  const charge = !q ? "" : `${Math.abs(q) === 1 ? "" : Math.abs(q)}${q > 0 ? "+" : "-"}`;
  if (a.el === "C" && !q && !a.isotope) return "";
  return `${a.isotope ?? ""}${a.el}${charge}`;
}
