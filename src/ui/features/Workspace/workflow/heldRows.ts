/**
 * The restraints a step holds (docs/STRUCTURE-STEPS.md, *Restraints*;
 * docs/WORKFLOWS.md, *Restraints wired in*): the rows of the *Restraints*
 * tables wired into its *Restraints* input (kinds `RESTRAINTS_INPUT`), each
 * molecule taking those made for it - matched on the ID a step wrote on it,
 * the property each row names (docs/WORKFLOWS-FOUNDATION.md, question A:
 * IDs a node wrote, never an implicit rule, never lineage).
 *
 * - Two rows holding the same atoms as the same kind, unlike: the row of the
 *   table whose step comes after the other's in the flow - the later round's
 *   - is held, and it is said; neither after the other, or both of one table,
 *   the molecule is refused. Where a row lies on the page decides nothing.
 * - A row reaches a molecule only in the numbering it was made in: one Atom
 *   map has numbered anew since (lib/steps `NUMBERING`) is refused, never
 *   held on what are now other atoms.
 * - A molecule no row is for, a row naming an atom it has not, a row of a
 *   kind its plugin does not hold - restrained or exact, never swapped -
 *   refused with why before anything is sent.
 * - Rows for no molecule that came in are counted on the step's line.
 */
import type { Restraint } from "../../../../lib/entry";
import type { HeldKind } from "../../../../lib/plugins/steps";
import { NUMBERING, OWN_NUMBERING, restraintKey, restraintRowsIn, restraintSaid, restraintsHeld, type RestraintRow } from "../../../../lib/steps/restraints";
import { findSet, stepsBefore, type Flow } from "./flow";
import { RESTRAINTS_INPUT, type StepKind } from "./kinds";
import type { SetEntry } from "./entries";

/** What a minimisation's plugin holds where its manifest names none: what *Minimise with restraints* is for - distances and torsions by their strengths, atoms fixed (docs/PLUGINS.md). Every other kind holds only what its plugin names. */
const MINIMISE_HOLDS: readonly HeldKind[] = ["fixed", "distance", "dihedral"];

/** What a step of `kind` done by a plugin that declares `declared` holds (lib/plugins/manifest `StepDecl.restraints`). */
export const heldBy = (kind: StepKind, declared: readonly HeldKind[] | undefined): readonly HeldKind[] => declared ?? (kind === "minimise" ? MINIMISE_HOLDS : []);

/** The kind of holding a row asks of a program (lib/plugins/steps `HELD_KINDS`). */
export const heldKindOf = (r: Restraint): HeldKind => (r.kind === "fixed" ? "fixed" : r.exact ? `${r.kind}-exact` : r.kind);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Why a molecule is refused whose restraints were made in another numbering (CHEM's words). */
export const RENUMBERED_WHY = "its restraints were made before Atom map numbered it anew";
/** Why a molecule is refused that no row is for, while restraints are wired in (decision 1a). */
export const NONE_MADE_WHY = "no restraints made for it";

/** A row as it came: the row, and the step whose table it is (none: a table read from a file). */
type Wired = { row: RestraintRow; step?: number; table: number; at: number };

/** What a step holds of the restraints wired in, for each entry - its rows, or why it is refused - and what is said on its line. */
export type HeldRows = { each: ({ rows: Restraint[] } | { why: string })[]; said: string[] };

/** An entry's value of a property, as a row names it: a text or a number, as text; none where it has none worked out. */
function idOf(e: SetEntry, on: string): string | null {
  const p = e.properties?.[on];
  return p?.status === "computed" && (typeof p.value === "string" || typeof p.value === "number") ? String(p.value) : null;
}

/** The numbering an entry is in now (lib/steps `NUMBERING`). */
function numberingOf(e: SetEntry): string {
  const n = e.properties?.[NUMBERING];
  return n?.status === "computed" && typeof n.value === "string" ? n.value : OWN_NUMBERING;
}

/** Two rows that hold alike: the same target and strength, or both exact - one held, nothing to choose. */
const alike = (a: Restraint, b: Restraint) => a.value === b.value && a.strength === b.strength && !!a.exact === !!b.exact && (a.kind !== "fixed" || a.atoms.length === b.atoms.length);

const KIND_ORDER: readonly Restraint["kind"][] = ["distance", "dihedral", "fixed"];
/** Rows by kind - distances, torsions, atoms fixed - then by their atoms. */
function byKindAndAtoms(a: Restraint, b: Restraint): number {
  const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  if (k) return k;
  for (let i = 0; i < Math.min(a.atoms.length, b.atoms.length); i++) if (a.atoms[i] !== b.atoms[i]) return a.atoms[i] - b.atoms[i];
  return a.atoms.length - b.atoms.length;
}

/** What a row asks that a plugin does not hold, in words - of the plugin, not its program, which may hold more than its plugin sends; none where it holds it. */
function notHeld(r: Restraint, holds: readonly HeldKind[], name: string): string | null {
  const k = heldKindOf(r);
  if (holds.includes(k)) return null;
  if (r.kind === "fixed") return `The ${name} plugin holds no atoms fixed: ${restraintSaid(r)}`;
  const what = r.kind === "distance" ? "distance" : "torsion";
  const other = r.exact ? r.kind : (`${r.kind}-exact` as HeldKind);
  if (holds.includes(other)) return r.exact ? `The ${name} plugin holds a ${what} only by a strength, not exactly: ${restraintSaid(r)} is to be held exactly` : `The ${name} plugin holds a ${what} only exactly, not by a strength: ${restraintSaid(r)} has a strength`;
  return `The ${name} plugin holds no ${what}s: ${restraintSaid(r)}`;
}

/**
 * What step `step` holds of the restraints wired into its *Restraints*
 * input for each of `entries` - their rows, or why each is refused - as its
 * plugin, called `name`, holds them (`holds`); none where nothing is wired
 * in there. Why, where what is wired in is no restraints table.
 */
export function heldRows(doc: Flow, step: number, entries: readonly SetEntry[], holds: readonly HeldKind[], name: string): HeldRows | { why: string } | null {
  const wires = (doc.wires ?? []).filter((w) => w.to.step === step && w.to.port === RESTRAINTS_INPUT.id);
  if (!wires.length) return null;
  const wired: Wired[] = [];
  for (const [t, w] of wires.entries()) {
    const set = findSet(doc, w.from.set);
    if (!set?.table) return { why: "What comes into Restraints is no table of restraints yet" };
    const read = restraintRowsIn(set.table);
    if ("why" in read) return { why: `Restraints: ${read.why}` };
    read.rows.forEach((row, at) => wired.push({ row, step: set.made?.step, table: t, at }));
  }
  // (whether table a's step comes after table b's in the flow: its rows the later round's)
  const before = new Map<number, number[]>();
  const after = (a: Wired, b: Wired) => a.step != null && b.step != null && a.step !== b.step && (before.get(a.step) ?? before.set(a.step, stepsBefore(doc, a.step)).get(a.step)!).includes(b.step);
  const used = new Set<Wired>();
  let takenOver = 0;
  const each = entries.map((e): { rows: Restraint[] } | { why: string } => {
    const mine = wired.filter((w) => idOf(e, w.row.on) === w.row.for);
    if (!mine.length) return { why: NONE_MADE_WHY };
    mine.forEach((w) => used.add(w));
    if (mine.some((w) => w.row.numbering !== numberingOf(e))) return { why: RENUMBERED_WHY };
    // (nothing an entry carries is held beside a table: Torsion restraints' rows, until it makes a table too)
    if (restraintsHeld({ properties: e.properties ?? {} }).length) return { why: "It carries restraints of its own (Torsion restraints) as well as those wired in: hold one or the other" };
    const n = e.atoms.length;
    const out = mine.find((w) => w.row.restraint.atoms.some((a) => a >= n));
    if (out) return { why: `A row holds ${restraintSaid(out.row.restraint)}, and it has atoms 1 to ${n}` };
    const byKey = new Map<string, Wired[]>();
    for (const w of mine) byKey.set(restraintKey(w.row.restraint), [...(byKey.get(restraintKey(w.row.restraint)) ?? []), w]);
    const rows: Restraint[] = [];
    let over = 0;
    for (const group of byKey.values()) {
      const unlike = group.filter((w) => !alike(w.row.restraint, group[0].row.restraint));
      if (!unlike.length) {
        rows.push(group[0].row.restraint);
        continue;
      }
      const said = restraintSaid(group[0].row.restraint);
      if (group.every((w) => w.table === group[0].table)) return { why: `Rows of one table hold ${said} for it unlike each other` };
      // (the one whose step comes after every other's that holds it otherwise: the later round's)
      const last = group.find((w) => group.every((o) => o === w || alike(o.row.restraint, w.row.restraint) || after(w, o)));
      if (!last) return { why: `Rows hold ${said} for it unlike each other, from steps neither of which comes after the other` };
      rows.push(last.row.restraint);
      over += group.filter((o) => !alike(o.row.restraint, last.row.restraint)).length;
    }
    const refused = rows.map((r) => notHeld(r, holds, name)).find((w) => w);
    if (refused) return { why: refused };
    takenOver += over;
    // (in one order however the tables lie: by kind, then atoms - what a plugin is given, and its job's key, the same)
    return { rows: rows.sort(byKindAndAtoms).map((r) => ({ ...r, atoms: [...r.atoms] })) };
  });
  const unmatched = wired.filter((w) => !used.has(w)).length;
  const said = [
    ...(takenOver ? [`${plural(takenOver, "row")} taken over by a later step's`] : []),
    ...(unmatched ? [`${plural(unmatched, "restraint row")} for no molecule here`] : []),
  ];
  return { each, said };
}
