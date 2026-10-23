import type { NumberValue, Table, TableColumn } from "../../../../lib/table";
import { numberText } from "../../../../lib/calc/results";

/** How many of a table's rows its frame shows. */
const SHOWN_ROWS = 6;
/** How many of its columns. */
const SHOWN_COLUMNS = 4;

/** A column's head as its frame shows it: its name, and a number's unit. */
const headOf = (c: TableColumn) => (c.kind === "number" && c.unit !== "none" ? `${c.name} (${c.unit})` : c.name);

/** A cell as its frame shows it: a number as Meno writes numbers, true or false, text as it is, none as a dash. */
const cellText = (v: string | number | boolean | null) => (v == null ? "–" : typeof v === "number" ? numberText(v) : typeof v === "boolean" ? (v ? "true" : "false") : v);

/**
 * A set holding a table, inside its frame (docs/WORKFLOWS.md, *Tables*):
 * its first rows and columns, each number column with its unit; and what
 * it is - how many rows and columns, and how many cells did not read or
 * columns were left, said, never hidden.
 */
export function TableBody({ table }: { table: Table }) {
  const columns = table.columns.slice(0, SHOWN_COLUMNS);
  const rows = table.rows.slice(0, SHOWN_ROWS);
  const said = [
    `${table.rows.length.toLocaleString("en-US")} ${table.rows.length === 1 ? "row" : "rows"} · ${table.columns.length} ${table.columns.length === 1 ? "column" : "columns"}`,
    ...(table.columns.length > SHOWN_COLUMNS ? [`the first ${SHOWN_COLUMNS} shown`] : []),
    ...(table.unread.length ? [`${table.unread.length} not read`] : []),
    ...(table.left.length ? [`${table.left.length} left`] : []),
  ].join(" · ");
  return (
    <div className="flex flex-col gap-1.5 w-full text-[11px] leading-4" data-set-table="">
      <table className="w-full table-fixed border-collapse tabular-nums">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.name} className="truncate text-left font-medium text-gh-gray border-b border-gh-line pb-0.5 pr-2" title={headOf(c)}>
                {headOf(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c, j) => (
                <td key={c.name} className={`truncate pr-2 text-gh-black ${c.kind === "number" ? "text-right" : ""}`}>
                  {cellText(r[j])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] text-gh-gray" title={[...table.unread.map((u) => `${u.column ? `${u.column}, ` : ""}row ${u.row}: ${u.why}`), ...table.left.map((l) => `${l.column}: ${l.why}`)].join("\n") || undefined}>
        {said}
      </div>
    </div>
  );
}

/** A set holding a number, inside its frame: the number with its unit, and what worked it out, where known. */
export function NumberBody({ number }: { number: NumberValue }) {
  const how = [number.by?.program ?? number.by?.model, number.by?.method, number.at?.kelvin != null ? `${number.at.kelvin} K` : undefined].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col items-start gap-0.5" data-set-number="">
      <span className="text-2xl leading-8 font-medium text-gh-black tabular-nums">
        {numberText(number.value)}
        {number.unit !== "none" && <span className="ml-1 text-sm text-gh-gray">{number.unit}</span>}
      </span>
      <span className="text-[10px] text-gh-gray">{how || "What worked it out: not stated"}</span>
    </div>
  );
}
