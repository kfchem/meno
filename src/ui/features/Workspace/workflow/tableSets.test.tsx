import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { numberIn, readTable, tableIn, tableOfText } from "../../../../lib/table";
import { addMolecule3d, createWorkspaceDocument, emptyWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Molecule3D } from "../store/types";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { countOf, holdsOf, setMembers } from "./entries";
import { takenBy } from "./kinds";
import { addTableSet, membersSettled } from "./model";
import { partsOf } from "./parts";
import { NumberBody, TableBody } from "./ValueBody";

const TABLE = readTable("name,energy (kcal/mol),ok\na,1.5,yes\nb,n/a,no\nc,2.25,yes\n");

describe("what goes into a port", () => {
  it("is what it takes - and molecules or conformer sets into one that takes a table, seen as one; nothing else stands for another", () => {
    expect(takenBy(["table"], "table")).toBe(true);
    expect(takenBy(["table"], "molecules")).toBe(true);
    expect(takenBy(["table"], "conformers")).toBe(true);
    expect(takenBy(["table"], "structures")).toBe(false);
    expect(takenBy(["table"], "number")).toBe(false);
    expect(takenBy(["molecules"], "table")).toBe(false);
    expect(takenBy(["number"], "table")).toBe(false);
  });
});

describe("a text read as a table", () => {
  it("is a .csv or .tsv that reads to a column; another text only where it reads to two columns, every row - prose is none", () => {
    expect(tableOfText("shifts.csv", "shift (none)\n7.26\n")?.columns.length).toBe(1);
    expect(tableOfText("notes.txt", "a,b\n1,2\n3,4\n")?.rows.length).toBe(2);
    expect(tableOfText("notes.txt", "The yield was low, as before.\nWe tried again.\n")).toBeNull();
    expect(tableOfText("notes.txt", "one line only\n")).toBeNull();
    // (lines with no delimiter at all, under a name that is no table's: one column - prose, not a table)
    expect(tableOfText("notes.txt", "Stirred overnight\nWorked up as usual\n")).toBeNull();
  });
});

describe("a table or a number, as a file keeps it", () => {
  it("reads back as it was; what does not read is left out alone, and counted - never the table with it", () => {
    const counted: Record<string, number> = {};
    const lost = (what: string, k = 1) => void (counted[what] = (counted[what] ?? 0) + k);
    expect(tableIn(JSON.parse(JSON.stringify(TABLE)), lost)).toEqual(TABLE);
    expect(counted).toEqual({});
    // (a cell of another kind - the desk's probe: a number written as a text - none in its row, named among what was not read)
    const cell = tableIn({ ...TABLE, rows: [["a", "1.5", true], ["c", 2.25, true]] }, lost)!;
    expect([cell.rows, cell.unread[cell.unread.length - 1]]).toEqual([
      [
        ["a", null, true],
        ["c", 2.25, true],
      ],
      { row: 0, column: "energy", text: "1.5", why: "did not read from the file" },
    ]);
    // (a column of a unit Meno does not know - the desk's other probe - left out with its cells; a row not of the table's width, left out)
    const column = tableIn({ ...TABLE, columns: [...TABLE.columns.slice(0, 2), { name: "x", kind: "number", unit: "furlongs" }], rows: [["a", 1.5, 3], ["b", 2]] }, lost)!;
    expect([column.columns.map((c) => c.name), column.rows]).toEqual([["name", "energy"], [["a", 1.5]]]);
    // (no table at all, or no column that reads: none, counted)
    expect([tableIn({ rows: [] }, lost), tableIn({ columns: [{ name: "x", kind: "number", unit: "furlongs" }], rows: [] }, lost)]).toEqual([undefined, undefined]);
    expect(counted).toEqual({ tableCell: 1, tableColumn: 2, tableRow: 1, table: 2 });
  });

  it("reads a number back - or none, counted, where it is no finite number in a unit Meno knows - and counts a field of what worked it out that does not read", () => {
    const counted: Record<string, number> = {};
    const lost = (what: string, k = 1) => void (counted[what] = (counted[what] ?? 0) + k);
    expect(numberIn({ value: 1.5, unit: "kcal/mol", by: { program: "p" }, at: { geometry: "g", kelvin: 298.15 } }, lost)).toEqual({ value: 1.5, unit: "kcal/mol", by: { program: "p" }, at: { geometry: "g", kelvin: 298.15 } });
    expect([numberIn({ value: NaN, unit: "none" }, lost), numberIn({ value: 1, unit: "furlongs" }, lost)]).toEqual([undefined, undefined]);
    expect(numberIn({ value: 2, unit: "none", by: { program: "p", version: 6 } }, lost)).toEqual({ value: 2, unit: "none", by: { program: "p" } });
    expect(counted).toEqual({ number: 2, valueField: 1 });
  });

  it("is said of a workspace's file, as what else does not read is: a cell, a column, a number", () => {
    const page = createWorkspaceDocument();
    const st = createEditorStore(page);
    connectStoreToDocument(st, page);
    const id = st.getState().placeTable(TABLE, { x: 0, y: 0 }, "shifts.csv");
    const saved = JSON.parse(workspaceText(st.getState()));
    const set = saved.sets.find((b: { id: number }) => b.id === id);
    set.table.rows[0][1] = "1.5";
    set.table.columns[2] = { name: "ok", kind: "number", unit: "furlongs" };
    saved.sets.push({ id: 99, x0: 0, y0: 0, x1: 1, y1: 1, number: { value: "x", unit: "none" } });
    const read = readWorkspace(JSON.stringify(saved))!;
    expect(read.leftOut).toEqual({ tableCell: 1, tableColumn: 1, number: 1 });
    expect(read.workflow!.sets.find((b) => b.id === id)?.table?.rows.map((r) => r[0])).toEqual(["a", "b", "c"]);
  });
});

describe("a set holding a table", () => {
  const water = (): Omit<Molecule3D, "id"> => ({ at: { x: 0, y: 0 }, atoms: [{ el: "O", x: 0, y: 0, z: 0 }], bonds: [] });

  it("holds a table - its rows its count - and takes in nothing dropped into its frame", () => {
    const d = addTableSet(emptyWorkspaceDocument(), { x: 0, y: 0 }, TABLE, "shifts.csv");
    const set = d.sets![0];
    expect([holdsOf(d, set), countOf(d, set), set.name]).toEqual(["table", { holds: "table", entries: 3, compounds: 3 }, "shifts.csv"]);
    const after = membersSettled(addMolecule3d(d, water()), d);
    expect(setMembers(after, after.sets![0]).molecules).toEqual([]);
  });

  it("is kept in the workspace's file, and copied with its table", () => {
    const page = createWorkspaceDocument();
    const st = createEditorStore(page);
    connectStoreToDocument(st, page);
    const id = st.getState().placeTable(TABLE, { x: 0, y: 0 }, "shifts.csv");
    const read = readWorkspace(workspaceText(st.getState()))!;
    expect(read.workflow!.sets.find((b) => b.id === id)?.table).toEqual(TABLE);
    expect(partsOf(st.getState(), new Set([id]), new Set()).sets[0].table).toEqual(TABLE);
  });

  it("shows its first rows - each number column with its unit, none as a dash - and says what it is, what did not read too", () => {
    const html = renderToString(<TableBody table={TABLE} />).split("<!-- -->").join("");
    expect(html).toContain("energy (kcal/mol)");
    expect(html).toContain("–");
    expect(html).toContain("3 rows · 3 columns · 1 not read");
    expect(renderToString(<NumberBody number={{ value: 1.5, unit: "kcal/mol", by: { program: "p", method: "m" } }} />).split("<!-- -->").join("")).toContain("p · m");
  });
});
