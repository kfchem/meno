import { describe, expect, it } from "vitest";
import { resolve } from "./chem/resolve";
import { enterDoes, fieldRows } from "./quickAddSmiles";

// (the field's rows and what Enter does there, as typed: a lookup only where its row is chosen - never by typing)
const field = (typed: string, lookable: boolean) => fieldRows(resolve(typed, "molecule").readings, lookable && typed.trim().length > 0);

describe("Quick Add's field, where a plugin looks names up", () => {
  it('"CO": methanol as a SMILES first, the lookup after it - Enter draws methanol, nothing sent (Meno\'s dictionary has no CO)', () => {
    const rows = field("CO", true);
    expect(rows.offered.map((r) => r.as)).toEqual(["smiles"]);
    expect(rows.rows).toBe(2);
    expect(enterDoes(rows, 0, false)).toBe("smiles");
    expect(enterDoes(rows, 1, false)).toBe("look up");
  });

  it('"NBS": the SMILES first, N-bromosuccinimide the dictionary\'s second, the lookup third - never chosen silently', () => {
    const rows = field("NBS", true);
    expect(rows.offered.map((r) => r.as)).toEqual(["smiles", "label"]);
    expect([0, 1, 2, 3].map((c) => enterDoes(rows, c, false))).toEqual(["smiles", "named", "look up", "look up"]);
  });

  it("a SMILES alone: offered beside the lookup, and first; with no plugin for names, drawn as ever with no row", () => {
    expect(enterDoes(field("CCO", true), 0, false)).toBe("smiles");
    expect(field("CCO", true).rows).toBe(2);
    expect(field("CCO", false)).toEqual({ offered: [], lookup: false, rows: 0 });
    expect(enterDoes(field("CCO", false), 0, false)).toBe("smiles");
  });

  it('"aspirin": nothing else reads it, so the lookup is the one row and first - sent only on Enter; typed letter by letter, nothing goes', () => {
    const rows = field("aspirin", true);
    expect(rows).toMatchObject({ offered: [], lookup: true, rows: 1 });
    expect(enterDoes(rows, 0, false)).toBe("look up");
    // (each prefix typed is only rows shown: what Enter would do, never a request - the field asks only on Enter or a click)
    for (let i = 1; i <= "aspirin".length; i++) expect(field("aspirin".slice(0, i), true).lookup).toBe(true);
    // (an empty field offers no lookup)
    expect(field("  ", true).rows).toBe(0);
    // (several found on show: Enter draws the one chosen among them)
    expect(enterDoes(rows, 0, true)).toBe("found");
  });
});
