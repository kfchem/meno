/**
 * A metal whose ligands the drawing does not state (docs/EDITOR-2D.md,
 * *Ligands not stated*): LnPd, L2Mg, MgX, PdL4, [Pd]L2 - the metal, with
 * ligands or a halide written as a token, not as atoms. Such an atom is
 * the metal, in one state, "ligands not stated", and that state goes
 * through everything that would claim a composition: no formula and no
 * mass are given, no 3D structure is made, and identity never calls the
 * structure the same as any other, another such one included.
 *
 * The grammar, exactly. A ligand token is L, Ln, Lm or L with a count
 * (L2 to L9), or X, Xn or X with a count (X2 to X9). A label is in the
 * state where it is one metal - a symbol of `coordinatedByDonors`, the
 * list the reader of coordination takes, written plain or in brackets
 * ([Pd]) - and one or more ligand tokens, before or after it, and nothing
 * else. An atom whose label is ligand tokens alone (L, X, L2, Xn) puts the
 * metal it is bonded to in the state. An element's symbol is read first,
 * so La, Lu and Li stay lanthanum, lutetium and lithium, and Xe xenon;
 * LiX is lithium with its halide not stated. An X on carbon, or on any
 * atom that is no such metal, stays what it is.
 */
import { coordinatedByDonors } from "./perception/elements";
import { whyCounted } from "../whyCounted";

/** What the state is called, where a structure says it of itself. */
export const LIGANDS_NOT_STATED = "ligands not stated";

/** Why a structure in the state is given no composition, 3D structure or identity of its own: in a sentence's end. */
export const NOT_STATED_WHY = "its ligands are not stated";

const TOKEN = /^(?:L(?:n|m|[2-9])?|X(?:n|[2-9])?)/;

/** A metal of the list at `i` of `label`, plain or in brackets: its symbol and its length as written; else null. */
function metalAt(label: string, i: number): { el: string; length: number } | null {
  const bracket = label[i] === "[";
  const from = bracket ? i + 1 : i;
  for (const n of [2, 1]) {
    const el = label.slice(from, from + n);
    if (el.length !== n || !coordinatedByDonors.has(el)) continue;
    if (!bracket) return { el, length: n };
    if (label[from + n] === "]") return { el, length: n + 2 };
  }
  return null;
}

/** The parts of a label by the grammar - each a metal or a ligand token - or null where some of it is neither. A metal's symbol is read first. */
function partsOf(label: string): { metals: string[]; tokens: string[] } | null {
  const metals: string[] = [];
  const tokens: string[] = [];
  let i = 0;
  while (i < label.length) {
    const m = metalAt(label, i);
    if (m) {
      metals.push(m.el);
      i += m.length;
      continue;
    }
    const t = TOKEN.exec(label.slice(i));
    if (!t) return null;
    tokens.push(t[0]);
    i += t[0].length;
  }
  return { metals, tokens };
}

/** The metal a label is, where the label is a metal with its ligands not stated (LnPd is Pd, MgX Mg); else null. */
export function metalNotStated(label: string): string | null {
  const parts = partsOf(label);
  return parts && parts.metals.length === 1 && parts.tokens.length > 0 ? parts.metals[0] : null;
}

/**
 * Such a label's units as drawn at its bond, the metal next to the bond (IUPAC GR-2.3.3: a label reads outward from its bond),
 * whichever order it was typed in: metal first (PdLn, MgX) where the label is on the right of its bond or above or below it, metal
 * last (LnPd, XMg) where it is on the left; the tokens read outward from the metal in the order typed. `at` is the metal's unit, the
 * one that sits on the atom. Null for a label not in the state.
 */
export function unitsAtBond(label: string, metalLast: boolean): { units: string[]; at: number } | null {
  if (!metalNotStated(label)) return null;
  let metal = "";
  const tokens: string[] = [];
  let i = 0;
  while (i < label.length) {
    const m = metalAt(label, i);
    if (m) {
      metal = label.slice(i, i + m.length);
      i += m.length;
      continue;
    }
    const t = TOKEN.exec(label.slice(i))![0];
    tokens.push(t);
    i += t.length;
  }
  return metalLast ? { units: [...tokens.reverse(), metal], at: tokens.length } : { units: [metal, ...tokens], at: 0 };
}

/** Whether a label is ligand tokens alone - L, X, L2, Xn: a ligand not stated where it is bonded to a metal. */
export function ligandTokensOnly(label: string): boolean {
  const parts = partsOf(label);
  return !!parts && parts.metals.length === 0 && parts.tokens.length > 0;
}

/**
 * The atoms of a structure in the state, by index: each labelled as a metal with its ligands not stated, and each metal - by its
 * symbol, or such a label - an atom of ligand tokens alone is bonded to. `labels` are the atoms' labels (an element's symbol or
 * the label as written), `bonds` the pairs of atoms bonded, by index.
 */
export function notStatedAt(labels: readonly string[], bonds: readonly (readonly [number, number])[]): number[] {
  const at = new Set<number>();
  labels.forEach((l, i) => {
    if (metalNotStated(l)) at.add(i);
  });
  const isMetal = (i: number) => coordinatedByDonors.has(labels[i]) || at.has(i);
  for (const [a, b] of bonds) {
    if (ligandTokensOnly(labels[a]) && isMetal(b)) at.add(b);
    if (ligandTokensOnly(labels[b]) && isMetal(a)) at.add(a);
  }
  return [...at].sort((p, q) => p - q);
}

/** The text identity writes for a structure in the state: one that no other structure's is, another such one's included. */
export const NOT_STATED_PREFIX = "?ligands-not-stated:";
let written = 0;
const session = Math.random().toString(36).slice(2, 10);
export function notStatedText(): string {
  return `${NOT_STATED_PREFIX}${session}:${++written}`;
}
/** Whether an identity text is one written for a structure in the state (`notStatedText`). */
export const isNotStatedText = (text: string): boolean => text.startsWith(NOT_STATED_PREFIX);

/**
 * What a step that judges duplicates says of the structures that hold a metal whose ligands are not stated: compared with none.
 * In the short form a step's line counts what it set aside by why - "4 set aside (4: ligands not stated)" - so that the line fits its card.
 */
export const notComparedSaid = (n: number): string => `${n} not compared ${whyCounted([[LIGANDS_NOT_STATED, n]])}`;
