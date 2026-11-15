import type { StructureBond } from "./ligands";

/**
 * A bond of a structure moved into another by `to` (each atom's new index,
 * or none): its atoms, its pi system's, and its cis or trans's refs - a ref
 * of -1, the atom outside that the structure is attached to, given as
 * `outside` where the caller knows it. Its cis or trans is dropped only
 * where a ref has no place.
 */
export function movedBond(b: StructureBond, to: (i: number) => number | undefined, outside?: number): StructureBond {
  const { cisTrans, ...rest } = b;
  const moved: StructureBond = { ...rest, a1: to(b.a1)!, a2: to(b.a2)!, ...(b.endpoints ? { endpoints: b.endpoints.map((e) => to(e)!) } : {}) };
  if (!cisTrans) return moved;
  const refs = cisTrans.refs.map((r) => (r === -1 ? outside : to(r)));
  return refs[0] != null && refs[1] != null ? { ...moved, cisTrans: { refs: [refs[0], refs[1]], cis: cisTrans.cis } } : moved;
}
