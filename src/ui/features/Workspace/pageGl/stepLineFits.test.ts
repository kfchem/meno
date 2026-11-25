import { describe, expect, it } from "vitest";
import { LIGANDS_NOT_STATED, notComparedSaid } from "../../../../lib/chem/ligandsNotStated";
import { countsOnly, whyCounted } from "../../../../lib/whyCounted";
import type { Model } from "../store/types";
import type { DrawnEntry } from "../workflow/entries";
import { enumerateOutcome, runMenoDrawn } from "../workflow/meno";
import { drawnSaid } from "../workflow/programs";
import { cardLines } from "./cardFace";

// Invented drawings: a methyl on LnPd (its metal's ligands not stated) and ethane.
const atom = (id: number, el: string, x = 0) => ({ id, x, y: 0, r: 0.9, el });
const onMethyl = { atoms: [atom(1, "C"), atom(2, "LnPd", 1.5)], bonds: [{ id: 1, a: 1, b: 2, order: 1 }] } as Model;
const ethane = { atoms: [atom(1, "C"), atom(2, "C", 1.5)], bonds: [{ id: 1, a: 1, b: 2, order: 1 }] } as Model;

/** The state's lines on the card, as the card lays them out. */
const shown = (text: string) => cardLines({ summary: "Duplicates", state: { text, tone: "base" } }).state;
const COUNTS = [2, 6, 12, 48, 999];

/** Duplicates' line through its own builder: `n` drawings in the state, the rest ethane - one kept, the others the same as it. */
function duplicatesLine(all: number, n: number): string {
  const entries: DrawnEntry[] = Array.from({ length: all }, (_, place) => ({ place, drawn: place < n ? onMethyl : ethane }));
  const out = runMenoDrawn("duplicates", entries);
  if (!out.ok) throw new Error(out.said);
  return out.said;
}
/** Check structures' line through its own builder: `n` set aside as in the state. */
const checkLine = (all: number, n: number) => drawnSaid([...Array(all - n).fill({ as: "drawn" }), ...Array(n).fill({ aside: "x", kind: LIGANDS_NOT_STATED })]);
/** Enumerate's and Substituents' line (they say the same) through Enumerate's own outcome. */
function enumerateLine(all: number, n: number): string {
  const said = [`${all} made`, "Duplicates judged by Meno's identity: constitution and configurations as drawn, aromatic rings as one form", notComparedSaid(n)];
  const out = enumerateOutcome({ ok: true, made: [], aside: [], said, core: { atoms: [], bonds: [], attach: {} } } as never, [{ place: 0, drawn: ethane }], ["Valence not checked"]);
  if (!out.ok) throw new Error(out.said);
  return out.said;
}

describe("a step's line on its card", () => {
  it("counts the reasons the way every step says them, and leaves out only them", () => {
    expect(whyCounted([["stereo open", 2], ["too many", 1]])).toBe("(2: stereo open; 1: too many)");
    expect(countsOnly("4 of 9 kept · rest 2 · 3 not compared (2: ligands not stated; 1: wedges that do not read)")).toBe("4 of 9 kept · rest 2 · 3 not compared");
    // (parentheses written otherwise are not reasons: left as they are)
    expect(countsOnly("1 of 2 kept (by value)")).toBe("1 of 2 kept (by value)");
  });

  it("is whole where it fits, and else its counts with no count or reason cut, for Duplicates and Check structures", { timeout: 60_000 }, () => {
    for (const all of COUNTS) {
      const n = Math.max(1, Math.floor(all / 4));
      for (const line of [duplicatesLine(all, n), checkLine(all, n)]) {
        const lines = shown(line);
        expect(lines.length, line).toBeLessThanOrEqual(2);
        expect(lines.join(" "), line).not.toContain("…");
        expect(lines.join(" ") === line || lines.join(" ") === countsOnly(line), line).toBe(true);
        // (the whole line where the whole fits: Check structures' at every count)
        if (line.includes("set aside")) expect(lines.join(" ")).toBe(line);
      }
    }
  });

  it("cuts with an ellipsis, as a last resort, only Enumerate's and Substituents' line, too long without its reasons too", () => {
    for (const all of COUNTS) {
      const line = enumerateLine(all, 1);
      expect(countsOnly(line)).not.toBe(line);
      expect(shown(line).join(" ")).toContain("…");
    }
  });
});

describe("Duplicates on structures drawn, ligands not stated", () => {
  it("compares none whose metal's ligands are not stated, saying so by the state's own name", () => {
    const out = runMenoDrawn("duplicates", [onMethyl, onMethyl, ethane, ethane].map((drawn, place) => ({ place, drawn })));
    expect(out.ok && out.said).toBe(`3 of 4 entries kept · rest 1 · 2 not compared (2: ${LIGANDS_NOT_STATED})`);
    expect(out.ok && out.kept.map((e) => e.place)).toEqual([0, 1, 2]);
  });
});
