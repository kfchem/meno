/**
 * A chair fused on a bond of a chair already drawn (docs/EDITOR-2D.md, *Projections*): F9's `fused`, seen as the first ring is seen. Three ways, never
 * two - trans, cis on the upper face, cis on the lower - because on a ring that carries a group or another fused ring the two cis fusions are
 * different compounds (cis-syn-cis against cis-anti-cis): the tool does not pick one for the chemist. Pure: the model in, what is added out.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { chair, flipped, fused } from "../../../../lib/chem/perception/projection/solids";
import { project, standardView } from "../../../../lib/chem/perception/projection/views";
import type { Atom, Bond, Model } from "../store/types";
import { chairOf, chairsIn, seenPlaces, chairDrawing } from "./chair";

/** How the new ring is fused: trans, or cis on the upper (1) or lower (-1) face of the first ring. */
export type FuseHow = "trans" | { cis: 1 | -1 };

/** What a fusion adds: its new atoms, and its bonds - an end given as an atom already there (`id`) or one of the new ones (`new`, an index into `atoms`). */
export type Fuse = {
  atoms: Omit<Atom, "id">[];
  bonds: { a: { id: number } | { new: number }; b: { id: number } | { new: number }; display?: "bold" }[];
};

/** The three ways, as the menu words them. */
export const FUSE_WAYS: { how: FuseHow; name: string }[] = [
  { how: "trans", name: "Fuse a chair, trans" },
  { how: { cis: 1 }, name: "Fuse a chair, cis on the upper face" },
  { how: { cis: -1 }, name: "Fuse a chair, cis on the lower face" },
];

/** The ring bonds of a structure's one chair: where a chair can be fused. None where it holds none or more than one (a fused system is not fused again by the tool yet). */
export function fusableBonds(model: Model, ids: ReadonlySet<number>): number[] {
  const rings = chairsIn(model, ids);
  if (rings.length !== 1) return [];
  const ring = rings[0];
  return model.bonds.filter((b) => ring.includes(b.a) && ring.includes(b.b)).map((b) => b.id);
}

/**
 * The ring fused on bond `bondId` of the structure's one chair, `how`: the four atoms and five bonds F9's `fused` adds, drawn as the first ring is
 * (its place, its depth, its views). `refused`, in words, where a group stands at a place the new ring would take, or another atom stands where one
 * of its own would go; none where the bond is on no chair of the tool's.
 */
export function fusedOn(model: Model, ids: ReadonlySet<number>, bondId: number, how: FuseHow): Fuse | { refused: string } | null {
  const rings = chairsIn(model, ids);
  const bond = model.bonds.find((b) => b.id === bondId);
  if (rings.length !== 1 || !bond) return null;
  const ring = rings[0];
  if (!ring.includes(bond.a) || !ring.includes(bond.b)) return null;
  const found = chairOf(model, ring)!;
  const base = chair();
  const solid = found.flip ? flipped(base) : base;
  const view = standardView(base, found.form);
  const [ka, kb] = [found.index.get(bond.a)!, found.index.get(bond.b)!];
  const at = solid.bonds.findIndex(([p, q]) => (p === ka && q === kb) || (p === kb && q === ka));
  const next = fused(solid, at, "chair", how);
  const [i, j] = solid.bonds[at];
  // (the places the new ring takes at the bond's two atoms: a group already standing at one is in its way)
  const taken = (k: number) => {
    const d = chairDrawing({ at: found.at, form: found.form, flip: found.flip, firstId: 1, firstBondId: 1 });
    const id = ring[[...found.index.values()].indexOf(k)];
    const here = model.atoms.find((a) => a.id === id)!;
    const out: string[] = [];
    for (const b of model.bonds) {
      const other = b.a === id ? b.b : b.b === id ? b.a : null;
      if (other == null || ring.includes(other)) continue;
      const g = model.atoms.find((a) => a.id === other)!;
      const place = seenPlaces(d, k).find((p) => Math.hypot(g.x - here.x - (p.place.x - d.atoms[k].x), g.y - here.y - (p.place.y - d.atoms[k].y)) < 1e-3);
      if (place) out.push(`${place.free.face}:${place.free.kind}`);
    }
    return out;
  };
  const used = [...solid.free.filter((f) => (f.at === i || f.at === j) && !next.free.includes(f))];
  for (const f of used) if (taken(f.at).includes(`${f.face}:${f.kind}`)) return { refused: "A group stands where the new ring would go: fuse it on a bond whose places are free." };
  // (the new atoms placed as the first ring's are: its middle where it is, scaled as it is)
  const d0 = chairDrawing({ at: found.at, form: found.form, flip: found.flip, firstId: 1, firstBondId: 1 });
  const shown = solid.atoms.map((p) => project(view, p));
  const middle = { x: shown.reduce((s, p) => s + p.x, 0) / 6, y: shown.reduce((s, p) => s + p.y, 0) / 6 };
  const newest = next.atoms.slice(6).map((p) => project(view, p));
  const atoms = newest.map((p) => ({
    el: "C",
    r: 0.9,
    x: found.at.x + (p.x - middle.x) * d0.scale,
    y: found.at.y + (p.y - middle.y) * d0.scale,
    z: p.z * d0.scale,
    stereoCentre: true as const,
    stereoShown: true as const,
  }));
  // (another atom of the drawing in the place of a new one, in the depth too: a ring already there)
  for (const a of atoms) {
    if (model.atoms.some((o) => Math.hypot(o.x - a.x, o.y - a.y, (o.z ?? 0) - a.z) < 0.5 * NOMINAL_BOND_LENGTH)) return { refused: "Another atom stands where the new ring would go." };
  }
  const idOf = (k: number): { id: number } | { new: number } => (k < 6 ? { id: ring[[...found.index.values()].indexOf(k)] } : { new: k - 6 });
  // (the new ring's near edge bold, as the first ring's is: the two of its atoms nearest the viewer, where they are bonded and not the fusion bond)
  const ringAtoms = [i, j, ...next.bonds.slice(6).flatMap(([p, q]) => [p, q])].filter((v, n, all) => all.indexOf(v) === n);
  const depth = (k: number) => (k < 6 ? (model.atoms.find((a) => a.id === (idOf(k) as { id: number }).id)!.z ?? 0) : atoms[k - 6].z);
  const nearest = [...ringAtoms].sort((p, q) => depth(q) - depth(p)).slice(0, 2);
  const bonds = next.bonds.slice(6).map(([p, q]) => ({
    a: idOf(p),
    b: idOf(q),
    ...(nearest.includes(p) && nearest.includes(q) ? { display: "bold" as const } : {}),
  }));
  return { atoms, bonds };
}

/** Whether a model's bond is a ring bond of the structure's one chair - where the menu offers the three ways. */
export const isFusable = (model: Model, ids: ReadonlySet<number>, bond: Bond): boolean => fusableBonds(model, ids).includes(bond.id);
