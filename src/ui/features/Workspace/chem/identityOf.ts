/**
 * A structure drawn, as identity reads it (lib/chem/identity): every atom
 * drawn - its element, charge, mass number, unpaired electrons, mapping to
 * a reaction's atom, and its hydrogens not drawn - every bond, and the
 * configurations the drawing shows, read as Clean-up reads them
 * (lib/layout/drawn `readStereo`). No hydrogen is folded in here: identity
 * does that, by its own rule (`hydrogensFolded`).
 */
import { identity, type IdentityInput } from "../../../../lib/chem/identity";
import { readStereo } from "../../../../lib/layout/drawn";
import type { Model } from "../store/types";
import { drawingOf } from "./drawing";
import { piSystems, unreadWedges } from "./engineLayout";

/**
 * `part` as identity's input, its atoms in `part`'s order - and the atoms,
 * by id, whose wedges say nothing that can be read (drawn crossed, or on an
 * atom with a lone pair), so whose configuration the input does not hold.
 */
export function identityInputOf(part: Model): { input: IdentityInput; unread: number[] } {
  const drawing = drawingOf(part);
  const stereo = readStereo(drawing.atoms, drawing.bonds);
  const pi = piSystems(part, drawing);
  const input: IdentityInput = {
    atoms: part.atoms.map((a, i) => {
      const t = stereo.tetra.get(i);
      return {
        el: a.el,
        ...(a.charge ? { charge: a.charge } : {}),
        ...(a.isotope ? { isotope: a.isotope } : {}),
        ...(a.radical ? { radical: a.radical } : {}),
        ...(a.map ? { mapped: true as const } : {}),
        hs: drawing.atoms[i].hs,
        ...(t ? { tetra: t } : {}),
        ...(pi.has(i) ? { pi: pi.get(i)! } : {}),
      };
    }),
    bonds: drawing.bonds.map((b, k) => {
      const ct = stereo.cisTrans.get(k);
      return { a: b.a, b: b.b, order: b.order, ...(ct ? { stereo: { refs: ct.refs, cis: ct.cis } } : {}) };
    }),
    ...(stereo.axes.length ? { axes: stereo.axes.map((x) => ({ atoms: x.atoms, refs: x.refs, sense: x.sense })) } : {}),
  };
  return { input, unread: unreadWedges(drawing, stereo).map((i) => part.atoms[i].id) };
}

/** A structure drawn's identity (lib/chem `identity`), and the atoms whose wedges it could not read (`identityInputOf`). */
export function identityOfDrawn(part: Model): { text: string; complete: boolean; unread: number[] } {
  const { input, unread } = identityInputOf(part);
  return { ...identity(input), unread };
}
