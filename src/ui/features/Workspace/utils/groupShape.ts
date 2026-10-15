import type { Model } from "../store/types";

/**
 * A group of atoms as it stands - each atom's element, charge, isotope and
 * unpaired electrons, and every bond among them with its order - as one
 * string: the same while the group is, another once an atom of it is gone
 * or changed, a bond among them made, broken or changed. A panel about the
 * group (Save as abbreviation) keeps it from when it opened, and closes
 * when it is no longer so: what it would do was worked out for the group
 * as it was.
 */
export function groupShape(model: Pick<Model, "atoms" | "bonds">, ids: readonly number[]): string {
  const inGroup = new Set(ids);
  const atoms = [...ids].sort((p, q) => p - q).map((id) => {
    const a = model.atoms.find((x) => x.id === id);
    return a ? `${id}:${a.el}:${a.charge ?? 0}:${a.isotope ?? ""}:${a.radical ?? ""}` : `${id}:gone`;
  });
  const bonds = model.bonds
    .filter((b) => inGroup.has(b.a) && inGroup.has(b.b))
    .map((b) => `${Math.min(b.a, b.b)}-${Math.max(b.a, b.b)}:${b.order}`)
    .sort();
  return `${atoms.join(",")}|${bonds.join(",")}`;
}
