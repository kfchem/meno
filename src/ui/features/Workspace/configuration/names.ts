/**
 * An atom's name in what the page says of configuration - a note's "C2: S, now R" (configuration/changes `changeWords`): its element and
 * its number in its own molecule, never its place among all the page's atoms (docs/EDITOR-2D.md, *When an edit changes a configuration*).
 * The number, the first of these that the molecule has:
 * - the number the page shows by the atom, where a reaction's atom map shows one (`Atom.map`, its text where not a plain number: 4a);
 * - IUPAC's numbering of the molecule (lib/chem/perception/locants, level 2: its parent's locants, the principal characteristic group
 *   leading, then the rest in its order - as *Renumber atoms* numbers it, chem/atomMap), where the molecule is not over the numbering's
 *   budget (`NUMBERING_ATOMS_BUDGET` heavy atoms) and the rules read it;
 * - its place among its own molecule's atoms, counted from 1.
 * The numbering can take a while on a large molecule: it is worked out off the drawing's thread with the CIP (chem/cipRun
 * `atomNamesAsked`); `placeNames` is the last of the three alone, at once. Pure: no DOM, no store.
 */
import { locants } from "../../../../lib/chem/perception/locants";
import { heavyOrbits, NUMBERING_ATOMS_BUDGET } from "../chem/atomMap";
import { fragmentsHolding } from "../chem/cleanUp";
import { identityInputOf } from "../chem/identityOf";
import type { Atom, Model } from "../store/types";

/** The atoms of `model` in `ids`, and its bonds between them. */
function partOf(model: Model, ids: ReadonlySet<number>): Model {
  return { atoms: model.atoms.filter((a) => ids.has(a.id)), bonds: model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)) };
}

/** The number a reaction's map shows by an atom, as the page writes it: its text where it has one (4a; 3a with a superscript 1 as 3a1). */
function mapShown(a: Atom): string | null {
  if (a.mapText) return `${a.mapText.base}${a.mapText.sup ?? ""}`;
  return a.map ? String(a.map) : null;
}

/** Each atom of the molecule `part` (one connected structure) by its IUPAC number, as the page writes it; null where the rules give none. */
function iupacNames(part: Model): Map<number, string> | null {
  const heavy = part.atoms.filter((a) => a.el !== "H").length;
  if (heavy < 2 || heavy > NUMBERING_ATOMS_BUDGET) return null;
  try {
    const { input } = identityInputOf(part);
    const atoms = input.atoms.map((a) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}), ...(a.isotope ? { isotope: a.isotope } : {}), hs: a.hs }));
    const bonds = input.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order }));
    const r = locants({ atoms, bonds, orbits: heavyOrbits({ atoms, bonds }) }, 2);
    const out = new Map<number, string>();
    r.shown.forEach((l, i) => {
      const a = part.atoms[i];
      if (a && l) out.set(a.id, `${a.el}${l.base}${l.sup ?? ""}`);
    });
    return out;
  } catch {
    return null;
  }
}

/** Each of `ids` by its place among its own molecule's atoms, counted from 1 - or by the number a reaction's map shows by it. */
export function placeNames(model: Model, ids: Iterable<number>): Map<number, string> {
  const out = new Map<number, string>();
  for (const f of fragmentsHolding(model, ids)) {
    const own = model.atoms.filter((a) => f.has(a.id));
    own.forEach((a, i) => out.set(a.id, `${a.el}${mapShown(a) ?? i + 1}`));
  }
  return out;
}

/** Each of `ids` by its name (see the header): the number a map shows by it, else its molecule's IUPAC number, else its place in it. */
export function ownNames(model: Model, ids: Iterable<number>): Map<number, string> {
  const wanted = [...ids];
  const out = placeNames(model, wanted);
  for (const f of fragmentsHolding(model, wanted)) {
    const part = partOf(model, f);
    // (a molecule a map numbers: the numbers the page shows by it)
    if (part.atoms.some((a) => mapShown(a) != null)) continue;
    const iupac = iupacNames(part);
    if (!iupac) continue;
    for (const id of wanted) {
      const n = iupac.get(id);
      if (n) out.set(id, n);
    }
  }
  return new Map(wanted.flatMap((id) => (out.has(id) ? [[id, out.get(id)!] as const] : [])));
}
