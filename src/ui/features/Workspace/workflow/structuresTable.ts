/**
 * Structures drawn seen as a table (docs/WORKFLOWS.md, *A structures set
 * as a table*): one row for each structure a set holds - those on the page
 * and those it holds off it, all of them, in the step's order - each read
 * by its record (entries `drawnAsEntry`), as a Filter reads it. It takes
 * in neither flow nor run, so that both can take it in (Chart); a set's
 * structures, as a step after it takes them, are run's (`setStructures`,
 * `setStructuresTable`).
 */
import { moleculesAsTable, WHAT_COLUMN, type Cell, type Table, type TableColumn } from "../../../../lib/table";
import { writeSmiles, type SmilesAtomOut } from "../../../../lib/chem/smiles";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import type { Model } from "../store/types";
import { undrawnHydrogens } from "../chem/drawing";
import { identityInputOf } from "../chem/identityOf";
import { BEFORE_THE_EDIT, drawnAsEntry, recordWhy, type DrawnEntry } from "./entries";
import type { Property } from "../../../../lib/entry";

/** The column of each structure's SMILES as the step that made it gave it, its stereo with it - none where none did. */
export const SMILES_RECORD_COLUMN = "SMILES (record)";
/** The column of each structure's SMILES as Meno writes it from the drawing (`drawnSmiles`): its constitution only - what the drawing says of its stereo is read (`identityInputOf`), but not written in it. */
export const SMILES_DRAWING_COLUMN = "SMILES (drawing, constitution only)";
/** The column that says where a structure's drawing carries stereo that its SMILES from the drawing leaves out, where any does. */
export const STEREO_COLUMN = "stereo in the drawing";
/** What it says there: so that two enantiomers never read the same without it. */
export const STEREO_NOT_WRITTEN = "stereo drawn, not written here";
/** The column of why a structure was set aside, where any was. */
export const ASIDE_COLUMN = "set aside";
/** Meno's own column of each structure's state: "finished", "failed: <why>", or edited since its properties were given. */
export const STATE_COLUMN = "state";
/** What a structure edited since its record's properties were given is, in its state: they were not of it as it is. */
export const EDITED_SINCE = `edited since: ${BEFORE_THE_EDIT}`;
/** The property a step gives a structure's SMILES under, as it gave it (*Generate*, *Stereoisomers*). */
const SMILES_PROPERTY = "smiles";

/**
 * A structure drawn as SMILES, as Meno writes it from the drawing: its
 * constitution, bonds in Kekulé form, each atom's hydrogens as Meno counts
 * them - no stereo written, though Meno reads what the drawing says of it
 * (`drawnStereo`). A label that is no element - an abbreviation, an R
 * group - is written as "*".
 */
export function drawnSmiles(drawn: Model): string {
  const index = new Map(drawn.atoms.map((a, i) => [a.id, i]));
  const hs = undrawnHydrogens(drawn);
  const atoms: SmilesAtomOut[] = drawn.atoms.map((a) =>
    isElementSymbol(a.el) && !a.abbrev
      ? { el: a.el, hs: hs.get(a.id) ?? 0, ...(a.charge ? { charge: a.charge } : {}), ...(a.isotope ? { isotope: a.isotope } : {}) }
      : { el: "*", hs: 0 },
  );
  const bonds = drawn.bonds.flatMap((b) => {
    const a1 = index.get(b.a);
    const a2 = index.get(b.b);
    return a1 == null || a2 == null ? [] : [{ a1, a2, order: b.order }];
  });
  return atoms.length ? writeSmiles(atoms, bonds, 0) : "";
}

/**
 * Whether a structure's drawing carries stereo - a centre wedged, a double
 * bond's cis or trans, an axis - or wedges that do not read: what Meno
 * reads of it (`identityInputOf`), which its SMILES from the drawing does
 * not write.
 */
export function drawnStereo(drawn: Model): boolean {
  if (!drawn.atoms.length) return false;
  const { input, unread } = identityInputOf(drawn);
  return unread.length > 0 || input.atoms.some((a) => a.tetra) || input.bonds.some((b) => b.stereo) || !!input.axes?.length;
}

/** Whether a cell holds no value: none at all, or a value not worked out or not applicable (`notGiven`) - last in a sort, either way. */
export const noValue = (c: Cell) => c == null || (typeof c === "string" && /^not (worked out|applicable): /.test(c));

/**
 * The rows of a table in the order a column sorts them: the values in
 * order, up or `down` - numbers as numbers, text as a reader sorts it -
 * and those with no value (`noValue`) after them, either way, in the
 * table's order; rows alike in the table's order too.
 */
export function sortedRows(table: Pick<Table, "rows">, column: number, down: boolean): number[] {
  const order = (a: Cell, b: Cell) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "en", { numeric: true }));
  return table.rows
    .map((r, k) => ({ v: r[column], k }))
    .sort((x, y) => {
      const nx = noValue(x.v), ny = noValue(y.v);
      if (nx || ny) return nx === ny ? x.k - y.k : nx ? 1 : -1;
      return (down ? -1 : 1) * order(x.v, y.v) || x.k - y.k;
    })
    .map((x) => x.k);
}

/** A value a step was to give and did not, as its cell says it: "not worked out: <why>" - never blank, never a number. */
function notGiven(p: Property | undefined): string | null {
  const st = p?.status;
  if (!st || st === "computed") return null;
  return "failed" in st ? `not worked out: ${st.failed}` : `not applicable: ${st.notApplicable}`;
}

/**
 * Structures drawn as a table - Chart's too, where it takes them: a row
 * for each, in their order. Its columns: the row's id (`idOf`); what it is
 * ("structure 3 of 120"); its SMILES as the step that made it gave it,
 * where any did (`SMILES (record)`), and as Meno writes it from the
 * drawing, its constitution only (`drawnSmiles`) - the two never mixed in
 * one column - and, where its drawing carries stereo that leaves out
 * (`drawnStereo`), that it does, so that two enantiomers never read alike
 * unsaid;
 * its state - "finished", "failed: <why>", or edited since its properties
 * were given (`EDITED_SINCE`), never finished then; why it was set aside,
 * where any was; then each property its record holds, under its own name,
 * a number's with its unit - the values of the one it was made from as
 * named (`made_from.nll`). A value worked out on the structure is shown as
 * it is, whatever its state; one a step was to give and did not says so in
 * its cell ("not worked out: <why>"), a column of its own where no row has
 * it worked out - never blank, never a number (a chart takes a failed row
 * as no result). A property no column can hold, or one with no value, is
 * said in `left`, as for molecules (lib/table `moleculesAsTable`).
 */
export function structuresAsTable(entries: readonly DrawnEntry[], idOf: (k: number) => string = (k) => `structure:${k + 1}`): Table {
  const n = entries.length;
  const read = entries.map((e, k) => drawnAsEntry(e, idOf(k)));
  const seen = moleculesAsTable(
    read.map((entry) => {
      // (its SMILES and state columns of their own: not again among the record's)
      const { [SMILES_PROPERTY]: _smiles, [STATE_COLUMN]: _state, ...properties } = entry.properties;
      return { ...entry, properties };
    }),
  );
  // (moleculesAsTable's own first three - id, constitution, configuration - are of a molecule's atoms, which an entry read
  //  by its record has none of: its id kept, its SMILES and state in their place)
  const own = seen.columns.slice(3);
  const ownRows = seen.rows.map((r) => r.slice(3));
  // (a value not worked out, in its cell: in its column, the first of its ways where it has several, or one of its own)
  const notWorked = new Map<string, (string | null)[]>();
  read.forEach((entry, k) => {
    for (const [name, p] of Object.entries(entry.properties)) {
      const said = name === SMILES_PROPERTY || name === STATE_COLUMN ? null : notGiven(p);
      if (said == null) continue;
      const cells = notWorked.get(name) ?? Array<string | null>(n).fill(null);
      cells[k] = said;
      notWorked.set(name, cells);
    }
  });
  const extra: TableColumn[] = [];
  for (const [name, cells] of notWorked) {
    const at = own.findIndex((c) => c.name === name || c.name.startsWith(`${name} \u00b7 `));
    if (at >= 0) cells.forEach((c, k) => c != null && (ownRows[k][at] = c));
    else {
      extra.push({ name, kind: "text" });
      ownRows.forEach((r, k) => r.push(cells[k]));
    }
  }
  const left = seen.left.filter((l) => !notWorked.has(l.column) || !/not worked out/.test(l.why));
  const recorded = entries.map((e) => {
    const v = e.record?.properties?.[SMILES_PROPERTY]?.value;
    return typeof v === "string" && v ? v : null;
  });
  const aside = entries.map((e) => recordWhy(e.record));
  const stereo = entries.map((e) => drawnStereo(e.drawn));
  const anyStereo = stereo.some(Boolean);
  const anyRecorded = recorded.some((s) => s != null);
  const anyAside = aside.some((w) => w != null);
  const columns: TableColumn[] = [
    seen.columns[0],
    { name: WHAT_COLUMN, kind: "text" },
    ...(anyRecorded ? [{ name: SMILES_RECORD_COLUMN, kind: "text" } as const] : []),
    { name: SMILES_DRAWING_COLUMN, kind: "text" },
    ...(anyStereo ? [{ name: STEREO_COLUMN, kind: "text" } as const] : []),
    { name: STATE_COLUMN, kind: "text" },
    ...(anyAside ? [{ name: ASIDE_COLUMN, kind: "text" } as const] : []),
    ...own,
    ...extra,
  ];
  const rows = entries.map((e, k): Cell[] => [
    seen.rows[k][0],
    `structure ${k + 1} of ${n}`,
    ...(anyRecorded ? [recorded[k]] : []),
    drawnSmiles(e.drawn),
    ...(anyStereo ? [stereo[k] ? STEREO_NOT_WRITTEN : null] : []),
    e.record?.stale === BEFORE_THE_EDIT ? EDITED_SINCE : String(read[k].properties[STATE_COLUMN]?.value ?? ""),
    ...(anyAside ? [aside[k] ?? null] : []),
    ...ownRows[k],
  ]);
  return { ...seen, columns, rows, left };
}
