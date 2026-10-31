/**
 * *Atom map* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*, Structures):
 * what the step makes of an entry once it is mapped onto its reference
 * (lib/chem/reactionMap `mapOnto`) - a product onto the reactants, a
 * conformer onto its species - the entry renumbered as the reference is,
 * and the bonds the map forms, breaks or changes, as a table.
 *
 * - **Renumbered**: the same structure and geometry, its atoms in the
 *   reference's order. What names atoms by number - a list per atom, a
 *   vibration's modes, restraints, its stereo elements - is renumbered with
 *   them, and a value worked out at its geometry still names that geometry,
 *   now in the new order. Nothing else changes: its species, its other
 *   properties, its status.
 * - **Bond changes**: one row a bond, its atoms from 1 as a chemist reads
 *   them, with each atom's element, its order before and after (0 where
 *   there is none) and what changed - for each entry, and each map of it.
 */
import { geometryKey, type Entry, type Property, type PropertyValue } from "../entry";
import type { BondChangeRow } from "../chem/reactionMap";
import { ATOMS_FROM_1, type Table } from "../table";

/**
 * `e` renumbered: `order[i]` is the atom of `e` that is atom `i` now (from
 * 0), every atom once. Its bonds kept in order of their atoms. Why not,
 * where `order` is not each of its atoms once.
 */
export function renumberedEntry(e: Entry, order: readonly number[], id: string): Entry | { failed: string } {
  const n = e.structure.atoms.length;
  if (order.length !== n || new Set(order).size !== n || order.some((j) => !(Number.isInteger(j) && j >= 0 && j < n)))
    return { failed: `The map does not give each of its ${n} atoms one place in the reference's numbering.` };
  // (where each of its atoms is now)
  const now = new Array<number>(n);
  order.forEach((j, i) => (now[j] = i));
  const xyzBy = (xyz: readonly number[]) => order.flatMap((j) => [xyz[3 * j], xyz[3 * j + 1], xyz[3 * j + 2]]);
  const g = e.geometry;
  const geometry: Entry["geometry"] =
    g.kind === "3d" ? { kind: "3d", xyz: xyzBy(g.xyz) } : g.kind === "2d" ? { kind: "2d", xy: order.flatMap((j) => [g.xy[2 * j], g.xy[2 * j + 1]]) } : g.kind === "frames" ? { kind: "frames", frames: g.frames.map(xyzBy) } : g;
  // (a value at its geometry - or at one of its frames - names it as it is numbered now)
  const keys = new Map<string, string>();
  if (g.kind === "3d" && geometry.kind === "3d") keys.set(geometryKey(g.xyz), geometryKey(geometry.xyz));
  if (g.kind === "frames" && geometry.kind === "frames") g.frames.forEach((f, k) => keys.set(geometryKey(f), geometryKey(geometry.frames[k])));
  const value = (v: PropertyValue): PropertyValue => {
    if (typeof v !== "object") return v;
    if ("list" in v) return v.per === "atom" && v.list.length === n ? { ...v, list: order.map((j) => v.list[j]) } : v;
    if ("modes" in v) return { modes: v.modes.map((m) => (m.length === 3 * n ? xyzBy(m) : m)) };
    if ("restraints" in v) return { restraints: v.restraints.map((r) => ({ ...r, atoms: r.atoms.map((a) => now[a]) })) };
    return v;
  };
  const property = (p: Property): Property => ({ ...p, value: value(p.value), ...(p.at && keys.has(p.at.geometry) ? { at: { ...p.at, geometry: keys.get(p.at.geometry)! } } : {}) });
  const bonds = e.structure.bonds
    .map((b) => {
      const [a1, a2] = [now[b.a1], now[b.a2]].sort((x, y) => x - y);
      return { ...b, a1, a2 };
    })
    .sort((p, q) => p.a1 - q.a1 || p.a2 - q.a2);
  return {
    ...e,
    id,
    from: [e.id],
    structure: { atoms: order.map((j) => ({ ...e.structure.atoms[j] })), bonds },
    geometry,
    properties: Object.fromEntries(Object.entries(e.properties).map(([k, p]) => [k, property(p)])),
    ...(e.stereo ? { stereo: e.stereo.perceived ? { ...e.stereo, elements: e.stereo.elements.map((s) => ({ ...s, atoms: s.atoms.map((a) => now[a]) })) } : e.stereo } : {}),
  };
}

/**
 * The column of an Atom map's bond changes, and the property of each entry
 * it mapped, that names the mapped entry: a name of Meno's own, dotted as
 * its others are (imaginary.first), which no chemist's property is taken
 * for - one an entry carried already is replaced, and said.
 */
export const MAPPED_ENTRY = "map.entry";

/** What a bond change is called in its table's *Change* column. */
const CHANGE_WORDS: Record<BondChangeRow["change"], string> = { formed: "formed", broken: "broken", order: "order changed" };

/**
 * The bond changes of each entry mapped, as one table: a row a bond - the
 * mapped entry it is of (`product`, as `productKey` names it - and the
 * mapped entry carries the same, so that a step taking atoms from the table
 * matches rows to it), the map (from 1, where there are several of an
 * entry), what changed, its two atoms (from 1, the columns saying so) and
 * their elements, and its order before and after. An entry mapped onto its
 * own species changes no bonds, and has no rows.
 */
export function bondChangesTable<M extends { map: number; changes: readonly BondChangeRow[] }>(mapped: readonly M[], productKey: (m: M) => string): Table {
  const maps = mapped.some((m) => m.map > 0);
  return {
    columns: [
      { name: MAPPED_ENTRY, kind: "text", label: "Product" },
      ...(maps ? [{ name: "Map", kind: "number" as const, unit: "none" as const }] : []),
      { name: "Change", kind: "text" },
      { name: "Atom 1", kind: "number", unit: "none", atoms: ATOMS_FROM_1 },
      { name: "Atom 2", kind: "number", unit: "none", atoms: ATOMS_FROM_1 },
      { name: "Element 1", kind: "text" },
      { name: "Element 2", kind: "text" },
      { name: "Order before", kind: "number", unit: "none" },
      { name: "Order after", kind: "number", unit: "none" },
    ],
    rows: mapped.flatMap((m) =>
      m.changes.map((c) => [productKey(m), ...(maps ? [m.map + 1] : []), CHANGE_WORDS[c.change], c.a1 + 1, c.a2 + 1, c.element1, c.element2, c.before, c.after]),
    ),
    unread: [],
    left: [],
  };
}
