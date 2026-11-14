/**
 * *Restraints* and *Torsion restraints* (docs/WORKFLOWS-FOUNDATION.md,
 * *Meno's own nodes*, Structures; docs/STRUCTURE-STEPS.md): the restraints
 * a restrained minimisation holds a geometry to - rows of the entry
 * record's `Restraint` (src/lib/entry.ts), atoms from 0, each with its
 * energy as the record states it.
 *
 * *Restraints*: a table of them (`restraintsTable`), a row for each, which a
 * step holding restraints takes in its *Restraints* input
 * (workflow/heldRows); each entry its own reference - its bonds say which
 * restraints there are, its geometry the values they hold.
 * - **Coordination bonds** (a bond the entry marks as one) are kept at a
 *   factor of their atoms' van der Waals radii together - Alvarez's radii
 *   (src/lib/chem/elements.ts; S. Alvarez, Dalton Trans. 2013, 42, 8617).
 *   The factor and the strength are the chemist's: neither has a default.
 * - **Listed pairs of atoms** are kept at their distance in the entry.
 * - **Listed atoms** are fixed where they stand.
 *
 * *Torsion restraints*: a table too - torsions typed, each held at the
 * angle typed; or each torsion across a reference's double bonds unlike
 * here (`torsionsUnlike`, *Compare torsions*' rule), held at 180° or at the
 * reference's own angle - each by its strength, or exactly. Every round's
 * table is wired into the round after's step, so a torsion once held stays
 * held (workflow/heldRows).
 *
 * Nothing is left out quietly: an atom the entry has not, an element with
 * no van der Waals radius, or an entry with no 3D places fails it, with the
 * reason.
 */
import { elementOf } from "../chem/elements";
import { aromaticForm } from "../chem/identity";
import { AROMATIC_BOND } from "../chem/kekulize";
import type { Entry, Restraint } from "../entry";
import type { Table, TableColumn } from "../table";
import { angle, dihedral, distance } from "./measure";

/**
 * A distance's strength unless the chemist sets another, in kcal mol⁻¹ Å⁻²:
 * measured, on eight acid–base pairs held at 0.9 of their van der Waals
 * radii together (H3N…BH3, Me3N…BF3, H2O…BF3, Et2O…BF3, pyridine…BH3,
 * Me2O…AlCl3, Me3P…BH3, Me2CO…BF3): minimised by the RDKit plugin (ten
 * conformers each) it holds within 0.01 Å; by xtb 6.7.1, within 0.01 Å
 * under GFN-FF and within 0.02 Å under GFN2-xTB, whose pull on Me2O…AlCl3
 * is the strongest (docs/STRUCTURE-STEPS.md;
 * scripts/calc/measure_restraint_strengths.py measures it again).
 */
export const DISTANCE_STRENGTH = 500;

/**
 * What *Torsion restraints* adds to a torsion's strength each time unless
 * the chemist sets another, in kcal mol⁻¹ rad⁻²: measured, on six Z
 * isomers held towards their E isomers (but-2-ene, pent-2-ene, stilbene,
 * methyl crotonate, hexa-2,4-diene E,Z to E,E, crotononitrile; the RDKit
 * plugin's minimisation), to make each right in one round, held within
 * 1.5° (docs/STRUCTURE-STEPS.md; scripts/calc/measure_restraint_strengths.py
 * measures it again).
 */
export const TORSION_STEP = 50;

/** What *Restraints* is asked for: coordination bonds at a factor of their van der Waals radii together, pairs kept at their distance, atoms fixed - each distance held with `strength` (kcal mol⁻¹ Å⁻²). */
export type RestraintsAsked = {
  /** The factor coordination bonds are kept at, of their atoms' van der Waals radii together; none held where not given. */
  coordination?: number;
  /** Pairs of atoms (from 0) kept at their distance in the entry. */
  distances?: readonly (readonly [number, number])[];
  /** Atoms (from 0) fixed where they stand. */
  fixed?: readonly number[];
  /** Each distance's force constant, in kcal mol⁻¹ Å⁻²: what a distance needs. */
  strength?: number;
};

/** A restraint as a step made it for an entry: the row (lib/entry `Restraint`, atoms from 0), and why it is there, in a chemist's words. */
export type RowMade = { restraint: Restraint; why: string };

type V = [number, number, number];
const at = (xyz: readonly number[], i: number): V => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];

/** The restraints an entry already holds, or none. */
export function restraintsHeld(e: Pick<Entry, "properties">): Restraint[] {
  const v = e.properties.restraints?.value;
  return typeof v === "object" && v !== null && "restraints" in v ? v.restraints : [];
}

/**
 * The restraints *Restraints* makes for `e`, from `e` itself, each with why
 * - or why there can be none. A coordination bond is kept IN CONTACT, at
 * the factor of the two van der Waals radii together (about twice a bond's
 * length at 0.9: a Lewis pair before it bonds, not a dative bond - said in
 * its why, so that a bonded complex is not pulled apart unseen); a pair
 * typed at its distance here; atoms typed fixed where they stand.
 */
export function restraintRows(e: Entry, o: RestraintsAsked): { rows: RowMade[] } | { failed: string } {
  if (e.geometry.kind !== "3d") return { failed: e.geometry.kind === "frames" ? "It holds frames: take one frame first (Take frames)." : "It has no 3D places to take restraints from." };
  const xyz = e.geometry.xyz;
  const atoms = e.structure.atoms;
  const n = atoms.length;
  const missing = [...(o.distances ?? []).flat(), ...(o.fixed ?? [])].find((a) => !Number.isInteger(a) || a < 0 || a >= n);
  if (missing !== undefined) return { failed: `It has no atom ${missing + 1}: its atoms are 1 to ${n}.` };
  const strength = o.strength ?? NaN;
  if ((o.coordination != null || o.distances?.length) && !(strength > 0 && Number.isFinite(strength))) return { failed: "A distance held needs a strength above 0." };
  const rows: RowMade[] = [];
  if (o.coordination != null) {
    for (const b of e.structure.bonds) {
      if (!b.coordination) continue;
      const [ra, rb] = [atoms[b.a1].el, atoms[b.a2].el].map((el) => elementOf(el)?.vdw ?? null);
      if (ra == null || rb == null) return { failed: `No van der Waals radius is known for ${ra == null ? atoms[b.a1].el : atoms[b.a2].el}, so its coordination bond cannot be kept.` };
      rows.push({ restraint: { kind: "distance", atoms: [b.a1, b.a2], value: o.coordination * (ra + rb), strength }, why: `coordination bond in contact, ${o.coordination} \u00d7 vdW (Alvarez)` });
    }
  }
  for (const [p, q] of o.distances ?? []) rows.push({ restraint: { kind: "distance", atoms: [p, q], value: distance(at(xyz, p), at(xyz, q)), strength }, why: "typed: kept at its distance here" });
  // (atoms fixed are fixed: nothing to hold them to, nothing to hold them by)
  const fixed = [...new Set(o.fixed ?? [])];
  if (fixed.length) rows.push({ restraint: { kind: "fixed", atoms: fixed }, why: "typed: fixed where they stand" });
  return { rows };
}

// ---- the table *Restraints* gives, and reading it back ----

/**
 * A row of a restraints table: the restraint, and why; the molecule it is
 * for - the value `for` of its property `on`, an ID a step wrote (a Tag's),
 * matched as Path search matches (docs/WORKFLOWS-FOUNDATION.md, question
 * A); and the numbering its atoms are in (`numbering`: the property Atom map
 * writes, `OWN_NUMBERING` where it was never mapped), so that a molecule
 * numbered anew since is never held on the wrong atoms.
 */
export type RestraintRow = RowMade & { for: string; on: string; numbering: string };
/**
 * A molecule its step looked at and found nothing to hold for - no
 * coordination bond, no torsion unlike its reference's - said in the table
 * as a row of its own, for it as a row is: so that a step it is wired into
 * tells it from one its step refused, or never saw (the maintainer,
 * 2026-11-13: one found to have nothing to hold goes on holding nothing).
 */
export type NothingRow = { for: string; on: string; numbering: string; why: string };
/** The kind cell of a row that holds nothing: its molecule was found to have nothing to hold. */
export const NOTHING_KIND = "nothing to hold";
/** Why a molecule's row holds nothing, as its step found it. */
export const NONE_FOUND = "none found to hold";

/** The property *Atom map* writes on each entry it numbers anew, a label naming the map: a restraint's atoms are in one numbering. */
export const NUMBERING = "numbering";
/** The numbering of an entry no Atom map has numbered anew: its own. */
export const OWN_NUMBERING = "its own";

/** A restraint's kind as its table says it. */
const KIND_WORDS: Record<Restraint["kind"], string> = { distance: "distance", dihedral: "torsion", fixed: "atoms fixed" };
/** A strength's unit, by the kind it holds, as the record's energy states it (lib/entry `Restraint`). */
const STRENGTH_UNIT = { distance: "kcal/mol/\u00c5\u00b2", dihedral: "kcal/mol/rad\u00b2" } as const;
/** The strength cell of a row held exactly, said: never a blank. */
export const EXACT = "exact";
/** The strength cell of atoms fixed: they have none. */
const FIXED_CELL = "fixed where they stand";

/** The columns of a restraints table, by name: the restraint - a target in its unit, distance or angle - first, as a set shows its first columns; then what each row is for. */
const COLUMNS: TableColumn[] = [
  { name: "kind", kind: "text", label: "Kind" },
  { name: "atoms", kind: "text", label: "Atoms, from 1" },
  { name: "target distance", kind: "number", unit: "\u00c5", label: "Target" },
  { name: "target angle", kind: "number", unit: "\u00b0", label: "Target" },
  { name: "strength", kind: "text", label: "Strength" },
  { name: "why", kind: "text", label: "Why" },
  { name: "for", kind: "text", label: "For" },
  { name: "on", kind: "text", label: "Matched on" },
  { name: "numbering", kind: "text", label: "Numbering" },
];

/** A row's atoms, from 1: a distance's and a torsion's joined as a chain, atoms fixed as a list. */
const atomsText = (r: Restraint) => r.atoms.map((a) => a + 1).join(r.kind === "fixed" ? ", " : "-");

/** A row's strength cell: the strength with its unit, "exact", or what atoms fixed have. */
const strengthText = (r: Restraint) => (r.kind === "fixed" ? FIXED_CELL : r.exact ? EXACT : `${r.strength} ${STRENGTH_UNIT[r.kind]}`);

/** A restraints table: a row for each restraint, said as a chemist reads it (docs/STRUCTURE-STEPS.md, *Restraints*). */
export function restraintsTable(rows: readonly RestraintRow[], nothing: readonly NothingRow[] = []): Table {
  return {
    columns: COLUMNS.map((c) => ({ ...c })),
    rows: [
      ...rows.map((x) => {
        const r = x.restraint;
        return [KIND_WORDS[r.kind], atomsText(r), r.kind === "distance" ? r.value! : null, r.kind === "dihedral" ? r.value! : null, strengthText(r), x.why, x.for, x.on, x.numbering];
      }),
      // (each molecule found to have nothing to hold, after: a row for it, holding nothing)
      ...nothing.map((x) => [NOTHING_KIND, "", null, null, "", x.why, x.for, x.on, x.numbering]),
    ],
    unread: [],
    left: [],
  };
}

/**
 * The rows of a restraints table, read back - a step's (`restraintsTable`),
 * or one read from a file with the same columns: each row's kind, atoms
 * (from 1), target in its column's unit, and strength - a number in the
 * unit of its kind, "exact", or atoms fixed's. Why not, the row named,
 * where any row does not read: nothing held in part, nothing guessed. The
 * molecules it says have nothing to hold, apart (`NothingRow`).
 */
export function restraintRowsIn(table: Table): { rows: RestraintRow[]; nothing: NothingRow[] } | { why: string } {
  const col = (name: string) => table.columns.findIndex((c) => c.name === name);
  const k = Object.fromEntries(COLUMNS.map((c) => [c.name, col(c.name)]));
  const lacking = COLUMNS.find((c) => k[c.name] < 0);
  if (lacking) return { why: `It is no table of restraints: it has no column "${lacking.name}"` };
  // (a target's unit as its column says: Å and °, nothing else taken)
  for (const [name, unit] of [["target distance", "\u00c5"], ["target angle", "\u00b0"]] as const) {
    const c = table.columns[k[name]];
    if (c.kind !== "number" || c.unit !== unit) return { why: `Its column "${name}" is not in ${unit}` };
  }
  const rows: RestraintRow[] = [];
  const nothing: NothingRow[] = [];
  for (const [i, row] of table.rows.entries()) {
    const text = (name: string) => {
      const v = row[k[name]];
      return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
    };
    const bad = (what: string) => ({ why: `Row ${i + 1} of the restraints does not read: ${what}` });
    if (text("kind") === NOTHING_KIND) {
      if (!text("for") || !text("on")) return bad("it does not say which molecule it is for");
      nothing.push({ for: text("for"), on: text("on"), numbering: text("numbering") || OWN_NUMBERING, why: text("why") });
      continue;
    }
    const kind = (Object.keys(KIND_WORDS) as Restraint["kind"][]).find((x) => KIND_WORDS[x] === text("kind"));
    if (!kind) return bad(`its kind "${text("kind")}" is none of distance, torsion, atoms fixed, ${NOTHING_KIND}`);
    const atoms = text("atoms")
      .split(kind === "fixed" ? /\s*,\s*/ : "-")
      .map((a) => (/^[0-9]+$/.test(a.trim()) ? Number(a) - 1 : NaN));
    const wants = kind === "distance" ? 2 : kind === "dihedral" ? 4 : null;
    if (!atoms.length || atoms.some((a) => !Number.isInteger(a) || a < 0) || (wants != null && atoms.length !== wants) || new Set(atoms).size !== atoms.length)
      return bad(`its atoms "${text("atoms")}" are not ${wants ?? "one or more"} different atoms from 1`);
    const forWhat = text("for");
    const on = text("on");
    if (!forWhat || !on) return bad("it does not say which molecule it is for");
    const numbering = text("numbering") || OWN_NUMBERING;
    const why = text("why");
    const strength = text("strength");
    if (kind === "fixed") {
      if (strength !== FIXED_CELL) return bad(`atoms fixed have no strength, not "${strength}"`);
      rows.push({ for: forWhat, on, numbering, why, restraint: { kind, atoms } });
      continue;
    }
    const value = row[k[kind === "distance" ? "target distance" : "target angle"]];
    if (typeof value !== "number" || !Number.isFinite(value)) return bad(`its target is not a number in ${kind === "distance" ? "\u00c5" : "\u00b0"}`);
    if (strength === EXACT) {
      rows.push({ for: forWhat, on, numbering, why, restraint: { kind, atoms, value, exact: true } });
      continue;
    }
    const m = /^([0-9.eE+-]+)\s+(\S+)$/.exec(strength);
    const k2 = m ? Number(m[1]) : NaN;
    if (!m || m[2] !== STRENGTH_UNIT[kind] || !(k2 > 0) || !Number.isFinite(k2)) return bad(`its strength "${strength}" is neither "exact" nor a number above 0 in ${STRENGTH_UNIT[kind]}`);
    rows.push({ for: forWhat, on, numbering, why, restraint: { kind, atoms, value, strength: k2 } });
  }
  return { rows, nothing };
}

/** A restraint's atoms and kind, as two rows hold the same (a distance and a torsion either way round; atoms fixed as a set). */
export function restraintKey(r: Restraint): string {
  if (r.kind === "fixed") return `fixed:${[...r.atoms].sort((a, b) => a - b).join(",")}`;
  const fwd = r.atoms.join("-");
  const back = [...r.atoms].reverse().join("-");
  return `${r.kind}:${fwd < back ? fwd : back}`;
}

/** A restraint as a step's line names it: "distance 3-7", "torsion 1-2-3-4", "atoms fixed 1, 4". */
export const restraintSaid = (r: Restraint): string => `${KIND_WORDS[r.kind]} ${atomsText(r)}`;

/**
 * Trans - anti - is a torsion more than 90° either way; cis - syn - at 90°
 * and within, φ taken in (−180°, 180°] (W. Klyne, V. Prelog, Experientia
 * 1960, 16, 521; G. P. Moss, Pure Appl. Chem. 1996, 68, 2193).
 */
export const isTrans = (phi: number): boolean => Math.abs(phi) > 90;

/** An angle in degrees taken into (−180°, 180°]: −180 is written 180. */
export function angleIn(phi: number): number {
  const a = ((phi % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

/**
 * How near a straight line three atoms may lie before a torsion over them
 * has no angle to hold - Meno's numerical guard, for what its bonds do not
 * already say is linear (`linearBy`): within 1° of 180° (or of 0°). A
 * torsion turns by about Δx / (r sin δ) for an end atom moved Δx: at r =
 * 1.5 Å and δ = 1°, 0.01 Å turns it by about 22°, so there is no plane
 * worth holding.
 */
export const LINE_WITHIN = 1;

/**
 * Why atom `i` of `e` is linear by its bonds - a triple bond on it (an
 * alkyne's, a nitrile's or an isonitrile's carbon); or two double bonds and
 * no other neighbour where no lone pair sits at the centre: a carbon (a
 * cumulene's or a ketene's centre, CO2's, CS2's, an isocyanate's) or an N
 * of charge +1 (an azide's central N, nitronium) - sp, and linear by VSEPR,
 * whatever its places say - or none. A sulfone's S (two S=O, tetrahedral)
 * and SO2's (bent by its lone pair) are not. A torsion (IUPAC: the angle
 * between planes 1-2-3 and 2-3-4, Moss 1996) over such an atom has no
 * meaning, however little bent it stands.
 */
export function linearBy(e: Entry, i: number): string | null {
  const orders = e.structure.bonds.filter((b) => b.a1 === i || b.a2 === i).map((b) => b.order);
  if (orders.includes(3)) return "a triple bond";
  const a = e.structure.atoms[i];
  const noLonePair = a.el === "C" || (a.el === "N" && a.charge === 1);
  return noLonePair && orders.length === 2 && orders.every((o) => o === 2) ? "two double bonds" : null;
}

type Torsion = [number, number, number, number];

/** A torsion's angle in `e`, in degrees, in (−180°, 180°]. */
const torsionAt = (xyz: readonly number[], t: readonly number[]) => angleIn(dihedral(at(xyz, t[0]), at(xyz, t[1]), at(xyz, t[2]), at(xyz, t[3])));

/** Whether three atoms lie on a line in `xyz`, as `LINE_WITHIN` says: the angle at the middle one within it of 180° or of 0°. */
const onLine = (xyz: readonly number[], a: number, b: number, c: number) => {
  const theta = angle(at(xyz, a), at(xyz, b), at(xyz, c));
  return theta > 180 - LINE_WITHIN || theta < LINE_WITHIN;
};

/**
 * An entry's double bonds - each bond of order 2 that is not aromatic as
 * Meno reads aromaticity (lib/chem/identity `aromaticForm`: a bond on an
 * alternating cycle) - each with its torsions: each pair of the ends'
 * neighbours by single bonds, hydrogens among them, as its four atoms (a
 * neighbour, the two ends, a neighbour), in the order of its bonds. An end
 * with one neighbour (an imine's N-H, an oxime's N-O) is one of them.
 */
function doubleBonds(e: Entry): { a: number; b: number; torsions: Torsion[] }[] {
  const { bonds } = e.structure;
  const singly: number[][] = e.structure.atoms.map(() => []);
  for (const b of bonds) {
    if (b.order !== 1 || b.coordination) continue;
    singly[b.a1].push(b.a2);
    singly[b.a2].push(b.a1);
  }
  const form = aromaticForm({
    atoms: e.structure.atoms.map((a) => ({ el: a.el, charge: a.charge, hs: 0 })),
    bonds: bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
  });
  return bonds.flatMap((b, k) => {
    if (b.order !== 2 || b.coordination || form.bonds[k].order === AROMATIC_BOND) return [];
    const torsions: Torsion[] = [];
    for (const p of [...singly[b.a1]].sort((x, y) => x - y)) for (const q of [...singly[b.a2]].sort((x, y) => x - y)) torsions.push([p, b.a1, b.a2, q]);
    return [{ a: b.a1, b: b.a2, torsions }];
  });
}

/**
 * The torsions a reference holds trans across its double bonds
 * (`doubleBonds`, `isTrans`), in the order of its bonds. Of a flat
 * cyclobutene, the two ring C-C=C-H torsions: its ring's own C4-C1=C2-C3
 * and its H-C1=C2-H are cis.
 */
export function transTorsions(reference: Entry): Torsion[] {
  if (reference.geometry.kind !== "3d") return [];
  const xyz = reference.geometry.xyz;
  return doubleBonds(reference).flatMap((d) => d.torsions.filter((t) => isTrans(torsionAt(xyz, t))));
}

/** A torsion of an entry unlike its reference's: its atoms, its angle here and there (°), and whether it is trans there. */
export type TorsionUnlike = { atoms: Torsion; here: number; there: number; transThere: boolean };

/**
 * The torsions across `reference`'s double bonds that are unlike in `e`,
 * both of the same atoms in one numbering: each torsion trans in the
 * reference and cis here - ConfoTS's protocol (step 1, its trans torsions
 * that failed); and, of a double bond with no trans torsion in the
 * reference (each end one neighbour, cis: (Z)-azobenzene), each cis torsion
 * there that is trans here - checked so, never passed over; such bonds are
 * counted (`cisOnly`). It judges the side alone: 95° against 180° is alike.
 * Or why they cannot be set against each other.
 */
export function torsionsUnlike(e: Entry, reference: Entry): { unlike: TorsionUnlike[]; cisOnly: number } | { failed: string } {
  if (e.geometry.kind !== "3d") return { failed: e.geometry.kind === "frames" ? "It holds frames: take one frame first (Take frames)." : "It has no 3D places to compare torsions in." };
  if (reference.geometry.kind !== "3d") return { failed: "The reference has no 3D places, so which torsions are trans in it is not known." };
  const atoms = e.structure.atoms;
  const ref = reference.structure.atoms;
  if (atoms.length !== ref.length) return { failed: `It has ${atoms.length} atoms and the reference ${ref.length}: both must hold the same atoms in one numbering.` };
  const bad = atoms.findIndex((a, i) => a.el !== ref[i].el);
  if (bad >= 0) return { failed: `Atom ${bad + 1} is ${atoms[bad].el} here and ${ref[bad].el} in the reference: both must hold the same atoms in one numbering.` };
  const [xyz, rxyz] = [e.geometry.xyz, reference.geometry.xyz];
  const unlike: TorsionUnlike[] = [];
  let cisOnly = 0;
  for (const d of doubleBonds(reference)) {
    const there = d.torsions.map((t) => torsionAt(rxyz, t));
    const trans = d.torsions.some((_, k) => isTrans(there[k]));
    if (!trans && d.torsions.length) cisOnly++;
    d.torsions.forEach((t, k) => {
      const here = torsionAt(xyz, t);
      if (trans ? isTrans(there[k]) && !isTrans(here) : isTrans(here)) unlike.push({ atoms: [...t] as Torsion, here, there: there[k], transThere: trans });
    });
  }
  return { unlike, cisOnly };
}

/** A torsion's four atoms as a chemist reads them, its double bond drawn: "C1-C2=C3-C4". */
export const torsionAtoms = (e: Pick<Entry, "structure">, t: readonly number[]): string => {
  const [p, a, b, q] = t.map((i) => `${e.structure.atoms[i].el}${i + 1}`);
  return `${p}-${a}=${b}-${q}`;
};

/** A torsion unlike its reference's, in words: "C1-C2=C3-C4: 3.2° (reference 179.8°)". */
export const torsionUnlikeText = (e: Pick<Entry, "structure">, u: TorsionUnlike): string => `${torsionAtoms(e, u.atoms)}: ${u.here.toFixed(1)}\u00b0 (reference ${u.there.toFixed(1)}\u00b0)`;

/** How a torsion row is held: by a strength (kcal mol⁻¹ rad⁻²), or exactly - said, never left out. */
export type TorsionHold = { strength: number } | { exact: true };
const held = (h: TorsionHold) => ("exact" in h ? { exact: true as const } : { strength: h.strength });

/**
 * *Torsion restraints*, its torsions typed: a row for each, each four
 * different atoms (from 0) held at `target` (°, taken into (−180°, 180°]),
 * as `hold` says. Or why not: an atom the entry has not, a middle atom
 * linear by its bonds (`linearBy`), or three of them on a line here
 * (`LINE_WITHIN`) - where the torsion has no angle.
 */
export function torsionRowsTyped(e: Entry, torsions: readonly (readonly number[])[], target: number, hold: TorsionHold): { rows: RowMade[] } | { failed: string } {
  if (e.geometry.kind !== "3d") return { failed: e.geometry.kind === "frames" ? "It holds frames: take one frame first (Take frames)." : "It has no 3D places to hold torsions in." };
  const xyz = e.geometry.xyz;
  const n = e.structure.atoms.length;
  const missing = torsions.flat().find((a) => !Number.isInteger(a) || a < 0 || a >= n);
  if (missing !== undefined) return { failed: `It has no atom ${missing + 1}: its atoms are 1 to ${n}.` };
  const rows: RowMade[] = [];
  for (const t of torsions) {
    const sp = [t[1], t[2]].find((i) => linearBy(e, i));
    if (sp !== undefined) return { failed: `${e.structure.atoms[sp].el}${sp + 1} is linear by its bonds (${linearBy(e, sp)}): the torsion ${t.map((a) => a + 1).join("-")} has no angle to hold.` };
    const line = [[t[0], t[1], t[2]], [t[1], t[2], t[3]]].find(([a, b, c]) => onLine(xyz, a, b, c));
    if (line) return { failed: `Atoms ${line.map((a) => a + 1).join(", ")} lie on a line here, within ${LINE_WITHIN}\u00b0: the torsion ${t.map((a) => a + 1).join("-")} has no angle to hold.` };
    const value = angleIn(target);
    rows.push({ restraint: { kind: "dihedral", atoms: [...t], value, ...held(hold) }, why: `typed: held at ${value}\u00b0` });
  }
  return { rows };
}

/**
 * *Torsion restraints* from a reference: a row for each torsion unlike here
 * (`torsionsUnlike`) - at 180° each trans in the reference and cis here
 * (`at` "trans"), a double bond cis in the reference not held so and
 * counted (`notHeld`); or each unlike, at the reference's own angle (`at`
 * "own") - held as `hold` says. Or why not.
 */
export function torsionRowsFromReference(e: Entry, reference: Entry, at: "trans" | "own", hold: TorsionHold): { rows: RowMade[]; notHeld: number } | { failed: string } {
  const u = torsionsUnlike(e, reference);
  if ("failed" in u) return u;
  const bond = (t: readonly number[]) => `${e.structure.atoms[t[1]].el}${t[1] + 1}=${e.structure.atoms[t[2]].el}${t[2] + 1}`;
  const taken = at === "trans" ? u.unlike.filter((x) => x.transThere) : u.unlike;
  const notHeld = new Set(u.unlike.filter((x) => !x.transThere && at === "trans").map((x) => bond(x.atoms))).size;
  const rows = taken.map(
    (x): RowMade => ({
      restraint: { kind: "dihedral", atoms: [...x.atoms], value: at === "trans" ? 180 : angleIn(x.there), ...held(hold) },
      why: `${x.transThere ? "trans" : "cis"} across ${bond(x.atoms)} of the reference (${x.there.toFixed(1)}\u00b0); here ${x.here.toFixed(1)}\u00b0`,
    }),
  );
  return { rows, notHeld };
}
