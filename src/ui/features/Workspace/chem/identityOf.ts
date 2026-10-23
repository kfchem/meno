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
import { placedAbbreviation } from "../../../../lib/chem/abbreviationPlace";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { isElementSymbol } from "../../../../lib/roles/molblock";

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

/**
 * `part` with each label that stands for atoms drawn out as those atoms -
 * those it holds (`abbrev`, as Clean-up writes a group by its label), else
 * the dictionary's - the labelled atom become the one it is attached by,
 * where the label is: so the structure as identity reads it whether a group
 * is written by its label or drawn out. Not laid out among the drawing, as
 * *Expand abbreviation* lays it out: only what each configuration says is
 * read from where atoms are, and turned whole a group's say the same. A
 * label Meno does not know stays as it is.
 */
export function labelsDrawnOut(part: Model): Model {
  if (!part.atoms.some((a) => a.abbrev || !isElementSymbol(a.el))) return part;
  let next = -1;
  const atoms: Model["atoms"] = [];
  const bonds: Model["bonds"] = [...part.bonds];
  for (const a of part.atoms) {
    const bond = a.abbrev ? undefined : part.bonds.find((b) => b.a === a.id || b.b === a.id);
    const other = bond && part.atoms.find((x) => x.id === (bond.a === a.id ? bond.b : bond.a));
    const s = a.abbrev ?? (isElementSymbol(a.el) ? null : placedAbbreviation(a.el, other ? { x: other.x - a.x, y: other.y - a.y } : null, NOMINAL_BOND_LENGTH));
    if (!s?.atoms.length) {
      atoms.push(a);
      continue;
    }
    const head = s.attach[0] ?? 0;
    const ids = s.atoms.map((_, k) => (k === head ? a.id : next--));
    s.atoms.forEach(({ x, y, ...chem }, k) => atoms.push({ ...chem, id: ids[k], x: a.x + x, y: a.y + y, r: a.r }));
    for (const b of s.bonds) {
      const { a1, a2, endpoints, ...rest } = b;
      bonds.push({ ...rest, id: next--, a: ids[a1], b: ids[a2], stereo: b.stereo ?? "none", ...(endpoints ? { endpoints: endpoints.map((e) => ids[e]) } : {}) } as Model["bonds"][number]);
    }
  }
  return { atoms, bonds };
}
