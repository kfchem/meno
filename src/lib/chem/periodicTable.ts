/**
 * The periodic table's layout, as the IUPAC's own table lays it out
 * (iupac.org, *Periodic Table of Elements*): 18 groups across and 7 periods
 * down, group 3 of periods 6 and 7 holding the lanthanoids' and the
 * actinoids' places (57-71, 89-103), and those two series in rows of 15
 * of their own below, a row apart. Pure: where each element stands.
 */

/** Where an element stands: its row (1 to 7 the periods; 9 and 10 the lanthanoids and the actinoids) and its column (1 to 18). */
export type TablePlace = { row: number; column: number };

/** The rows the table takes, the gap above the two series counted. */
export const TABLE_ROWS = 10;
/** The columns it takes: the groups. */
export const TABLE_COLUMNS = 18;

/** Where the element of atomic number `n` (1 to 118) stands; none for any other number. */
export function tablePlace(n: number): TablePlace | null {
  if (!Number.isInteger(n) || n < 1 || n > 118) return null;
  if (n === 1) return { row: 1, column: 1 };
  if (n === 2) return { row: 1, column: 18 };
  if (n <= 4) return { row: 2, column: n - 2 };
  if (n <= 10) return { row: 2, column: n + 8 };
  if (n <= 12) return { row: 3, column: n - 10 };
  if (n <= 18) return { row: 3, column: n };
  if (n <= 36) return { row: 4, column: n - 18 };
  if (n <= 54) return { row: 5, column: n - 36 };
  if (n <= 56) return { row: 6, column: n - 54 };
  if (n <= 71) return { row: 9, column: n - 54 };
  if (n <= 86) return { row: 6, column: n - 68 };
  if (n <= 88) return { row: 7, column: n - 86 };
  if (n <= 103) return { row: 10, column: n - 86 };
  return { row: 7, column: n - 100 };
}

/** The places in group 3 of periods 6 and 7 that stand for the series below: where, and which numbers. */
export const SERIES_PLACES: readonly (TablePlace & { from: number; to: number })[] = [
  { row: 6, column: 3, from: 57, to: 71 },
  { row: 7, column: 3, from: 89, to: 103 },
];
