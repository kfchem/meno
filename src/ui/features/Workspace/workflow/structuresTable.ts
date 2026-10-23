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
import { drawnAsEntry, recordWhy, type DrawnEntry } from "./entries";

/** The column of each structure's SMILES. */
export const SMILES_COLUMN = "SMILES";
/** The column of why a structure was set aside, where any was. */
export const ASIDE_COLUMN = "set aside";
/** Meno's own column of each structure's state (entries `drawnAsEntry`): "finished", or "failed: <why>". */
export const STATE_COLUMN = "state";
/** The property a step gives a structure's SMILES under, as it gave it (*Generate*, *Stereoisomers*). */
const SMILES_PROPERTY = "smiles";

/**
 * A structure drawn as SMILES, as Meno writes it from the drawing: its
 * constitution, bonds in Kekulé form, each atom's hydrogens as Meno counts
 * them, and no stereo. A label that is no element - an abbreviation, an R
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
 * Structures drawn as a table - Chart's too, where it takes them: a row
 * for each, in their order. Its columns: the row's id (`idOf`); what it is
 * ("structure 3 of 120"); its SMILES - as the step that made it gave it,
 * else written from the drawing (`drawnSmiles`); its state, "finished" or
 * "failed: <why>"; why it was set aside, where any was; then each property
 * its record holds, under its own name, a number's with its unit - the
 * values of the one it was made from as named (`made_from.nll`). A
 * property no column can hold, or one with no value, is said in `left`,
 * as for molecules (lib/table `moleculesAsTable`).
 */
export function structuresAsTable(entries: readonly DrawnEntry[], idOf: (k: number) => string = (k) => `structure:${k + 1}`): Table {
  const n = entries.length;
  const seen = moleculesAsTable(
    entries.map((e, k) => {
      const entry = drawnAsEntry(e, idOf(k));
      // (its SMILES its own column: not again among the record's)
      const { [SMILES_PROPERTY]: _smiles, [STATE_COLUMN]: _state, ...properties } = entry.properties;
      return { ...entry, properties };
    }),
  );
  // (moleculesAsTable's own first three - id, constitution, configuration - are of a molecule's atoms, which an entry read
  //  by its record has none of: its id kept, its SMILES and state in their place)
  const own = seen.columns.slice(3);
  const aside = entries.map((e) => recordWhy(e.record));
  const anyAside = aside.some((w) => w != null);
  const columns: TableColumn[] = [
    seen.columns[0],
    { name: WHAT_COLUMN, kind: "text" },
    { name: SMILES_COLUMN, kind: "text" },
    { name: STATE_COLUMN, kind: "text" },
    ...(anyAside ? [{ name: ASIDE_COLUMN, kind: "text" } as const] : []),
    ...own,
  ];
  const rows = entries.map((e, k): Cell[] => {
    const given = e.record?.properties?.[SMILES_PROPERTY]?.value;
    const entry = drawnAsEntry(e, idOf(k));
    return [
      seen.rows[k][0],
      `structure ${k + 1} of ${n}`,
      typeof given === "string" && given ? given : drawnSmiles(e.drawn),
      String(entry.properties[STATE_COLUMN]?.value ?? ""),
      ...(anyAside ? [aside[k] ?? null] : []),
      ...seen.rows[k].slice(3),
    ];
  });
  return { ...seen, columns, rows };
}
