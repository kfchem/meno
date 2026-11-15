/**
 * The mark a drawing nobody made carries where it is kept as it came: "which donors are next to each other is not given" (docs/LAYOUT-2D.md,
 * *A metal with four bonds*). Light: no layout engine.
 */
import { valencesAt } from "../../../../lib/chem/molecule";
import { isMetal, squarePlanarMetal, type FourView } from "../../../../lib/layout/perceive";
import { arrangementOpen, type IdentityInput } from "../../../../lib/chem/identity";
import type { Model } from "../store/types";
import { ARRANGEMENT_SAID, arrangementAs } from "../utils/arrangement";
import { drawingOf } from "./drawing";

const pairKey = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);

/**
 * Whether metal `a`'s arrangement is one a drawing nobody made would state though nothing gave it - the one place this is decided,
 * for a layout and for a drawing kept as it came: a surely square-planar centre (`squarePlanarMetal`, chelated or not: Pt(gly)2) or
 * a metal of six donors, bound to no pi system's centre and to no other metal, whose arrangement identity's own test leaves open
 * (lib/chem/identity `arrangementOpen`: the whole structure `input`, so that two donors alike next to the metal and different
 * ligands further out are told apart - [Pt(NH2Me)2(NH2Et)2]2+).
 */
export function arrangementNotGiven(input: IdentityInput, v: FourView, a: number): boolean {
  const nb = v.neighbours(a);
  if (!isMetal(v.el(a)) || nb.some((d) => v.el(d) === "*" || isMetal(v.el(d)))) return false;
  if (nb.length === 4 && !squarePlanarMetal(v, a, (el, charge) => valencesAt(el, charge)[0], true)?.sure) return false;
  if (nb.length !== 4 && nb.length !== 6) return false;
  return arrangementOpen(input, a);
}

/**
 * `model` kept as it came - a plugin's drawing of a typed SMILES or of a molecule in 3D, which could not be laid out anew - with each
 * surely square-planar centre whose donors can lie round it more than one way - and each metal of six donors that could be set
 * round it with other pairs across - each where `arrangementNotGiven` says so - marked "which donors are next to each other is not
 * given", as a layout of it would mark it (`relayoutFrom`): nobody gave its arrangement, wherever the plugin put its donors. The
 * same model where there is none.
 */
export function arrangementsMarked(model: Model, arranged: ReadonlySet<number> = new Set()): Model {
  const drawing = drawingOf(model);
  const nb = model.atoms.map(() => [] as number[]);
  const orders = new Map<string, number>();
  for (const b of drawing.bonds) {
    nb[b.a].push(b.b);
    nb[b.b].push(b.a);
    orders.set(pairKey(b.a, b.b), b.order);
  }
  const view = {
    el: (i: number) => model.atoms[i].el,
    charge: (i: number) => model.atoms[i].charge ?? 0,
    hs: (i: number) => drawing.atoms[i].hs,
    neighbours: (i: number) => nb[i],
    order: (p: number, q: number) => orders.get(pairKey(p, q)) ?? 1,
  };
  const input: IdentityInput = {
    atoms: model.atoms.map((a, i) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}), hs: drawing.atoms[i].hs })),
    bonds: drawing.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })),
  };
  let marked = false;
  const atoms = model.atoms.map((a, i) => {
    if (arranged.has(a.id)) return a;
    if (!arrangementNotGiven(input, view, i)) return a;
    marked = true;
    return { ...a, unsure: { said: [ARRANGEMENT_SAID], as: arrangementAs(a, model.atoms, model.bonds) } };
  });
  return marked ? { ...model, atoms } : model;
}
