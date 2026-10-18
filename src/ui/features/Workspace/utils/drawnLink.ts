import type { Model, Molecule3D } from "../store/types";

/**
 * What a drawn structure is, as its molecules in 3D were made from it: its
 * atoms (by id: element, charge, mass), its bonds (order and wedge, and
 * what a haptic bond binds), and those that leave it - not where anything
 * is drawn. A molecule in 3D whose
 * drawing no longer says the same is its drawing's no longer.
 */
export function signatureOf(model: Model, ids: Iterable<number>): string {
  const of = new Set(ids);
  // (a haptic bond's star with the metal it is bound to: no atom of a
  // molecule in 3D, so not among its drawing's atoms, but of the structure
  // as its bond is - else every complex so bound read as drawn otherwise)
  for (const b of model.bonds) {
    if (!b.endpoints?.length) continue;
    for (const [star, other] of [
      [b.b, b.a],
      [b.a, b.b],
    ]) {
      if (of.has(other) && model.atoms.some((a) => a.id === star && a.el === "*")) of.add(star);
    }
  }
  const atoms = model.atoms
    .filter((a) => of.has(a.id))
    .map((a) => `${a.id}:${a.el}:${a.charge ?? 0}:${a.isotope ?? ""}`)
    .sort();
  const bonds = model.bonds
    .filter((b) => of.has(b.a) || of.has(b.b))
    .map((b) => {
      const ends = of.has(b.a) && of.has(b.b) ? `${b.a}-${b.b}` : of.has(b.a) ? `${b.a}-out` : `${b.b}-out`;
      // (and what a haptic bond binds)
      const binds = b.endpoints?.length ? `:${[...b.endpoints].sort((p, q) => p - q).join(" ")}` : "";
      return `${ends}:${b.order}:${b.stereo ?? "none"}${binds}`;
    })
    .sort();
  return [...atoms, "|", ...bonds].join(",");
}

/**
 * How a molecule in 3D stands to the drawing it was made from: the same
 * structure still ("live"), drawn otherwise since ("changed"), gone, or
 * made from none.
 */
export function linkOf(m: Pick<Molecule3D, "drawnFrom" | "drawnAs">, model: Model): "live" | "changed" | "gone" | null {
  if (!m.drawnFrom) return null;
  const ids = m.drawnFrom.filter((id): id is number => id != null);
  const present = new Set(model.atoms.map((a) => a.id));
  if (!ids.some((id) => present.has(id))) return "gone";
  return m.drawnAs != null && signatureOf(model, ids) !== m.drawnAs ? "changed" : "live";
}

/**
 * A molecule in 3D pasted with its drawing - all of it, or some - tied to
 * the pasted drawing's atoms, which `idOf` renames: still its drawing's if it
 * was in what was copied (`part`), or changed if only some of that came;
 * tied to nothing where none of its drawing came with it.
 */
export function relinked<M extends Pick<Molecule3D, "drawnFrom" | "drawnAs">>(
  m: M,
  part: Model,
  idOf: (id: number) => number | undefined,
): M {
  if (!m.drawnFrom) return m;
  const drawnFrom = m.drawnFrom.map((id) => (id == null ? null : (idOf(id) ?? null)));
  if (!drawnFrom.some((id) => id != null)) {
    const { drawnFrom: _from, drawnAs: _as, ...rest } = m;
    return rest as M;
  }
  if (linkOf(m, part) !== "live") return { ...m, drawnFrom };
  const renamed: Model = {
    atoms: part.atoms.map((a) => ({ ...a, id: idOf(a.id) ?? a.id })),
    bonds: part.bonds.map((b) => ({ ...b, a: idOf(b.a) ?? b.a, b: idOf(b.b) ?? b.b })),
  };
  return { ...m, drawnFrom, drawnAs: signatureOf(renamed, drawnFrom.filter((id): id is number => id != null)) };
}
