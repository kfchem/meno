import { describe, expect, it } from "vitest";
import { LIGANDS_NOT_STATED } from "../../../../lib/chem/ligandsNotStated";
import { countsOnly, whyCounted } from "../../../../lib/whyCounted";
import type { Model } from "../store/types";
import type { DrawnEntry } from "../workflow/entries";
import { enumerated } from "../workflow/enumerate";
import { substituted } from "../workflow/substituents";
import { template } from "../workflow/testdata/enumerationCases";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import { enumerateOutcome, runMenoDrawn } from "../workflow/meno";
import { clock, drawnSaid } from "../workflow/programs";
import { failuresSaid, type Failure } from "../workflow/failures";
import { CARD, cardLines } from "./cardFace";
import { textWidth } from "./texts";

// Invented drawings: a methyl on LnPd (its metal's ligands not stated) and ethane.
const atom = (id: number, el: string, x = 0) => ({ id, x, y: 0, r: 0.9, el });
const onMethyl = { atoms: [atom(1, "C"), atom(2, "LnPd", 1.5)], bonds: [{ id: 1, a: 1, b: 2, order: 1 }] } as Model;
const ethane = { atoms: [atom(1, "C"), atom(2, "C", 1.5)], bonds: [{ id: 1, a: 1, b: 2, order: 1 }] } as Model;

/** The state's lines on the card, as the card lays them out. */
const shown = (text: string) => cardLines({ summary: "Duplicates", state: { text, tone: "base" } }).state;
const COUNTS = [2, 6, 12, 48, 999];
const METHOD = "Duplicates judged by Meno's identity: constitution and configurations as drawn, aromatic rings as one form";

/** Duplicates' line through its own builder: `n` drawings in the state, the rest ethane - one kept, the others the same as it. */
function duplicatesLine(all: number, n: number): string {
  const entries: DrawnEntry[] = Array.from({ length: all }, (_, place) => ({ place, drawn: place < n ? onMethyl : ethane }));
  const out = runMenoDrawn("duplicates", entries);
  if (!out.ok) throw new Error(out.said);
  return out.said;
}
/** Check structures' line through its own builder: `n` set aside as in the state. */
const checkLine = (all: number, n: number) => drawnSaid([...Array(all - n).fill({ as: "drawn" }), ...Array(n).fill({ aside: "x", kind: LIGANDS_NOT_STATED })]);
/** A ring drawn by Meno's engine with one of its atoms a metal whose ligands are not stated: every product of it is not compared. */
const withMetal = (m: Model): Model => ({ ...m, atoms: m.atoms.map((a, i) => (i === m.atoms.length - 1 ? { ...a, el: "LnPd" } : a)) });
/** Enumerate's and Substituents' line through each one's own builder and Enumerate's outcome: `n` options, each product not compared. */
function enumerateLines(n: number): { made: number; line: string }[] {
  const options = Array.from({ length: n }, (_, k) => `*[${k + 1}C]`).join("\n");
  const built = [enumerated(withMetal(template("*c1ccccc1")), `R1: ${options}`), substituted(withMetal(drawnFromSmiles("c1ccccc1")), [1], options, "one")];
  return built.map((r) => {
    if (!r.ok) throw new Error(r.problems.join(" "));
    const out = enumerateOutcome(r, [{ place: 0, drawn: ethane }], ["Valence not checked"]);
    if (!out.ok) throw new Error(out.said);
    return { made: r.made.length, line: out.said };
  });
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

  it("holds Enumerate's and Substituents' counts whole at every count, so that an ellipsis cuts only the method sentence", { timeout: 120_000 }, () => {
    for (const n of COUNTS) {
      for (const { made, line } of enumerateLines(n)) {
        expect(line.indexOf(METHOD), line).toBeGreaterThan(line.indexOf("not compared"));
        const text = shown(line).join(" ");
        const cut = text.indexOf("…");
        const before = cut < 0 ? text : text.slice(0, cut);
        expect(before, line).toContain(`${made} made`);
        expect(before, line).toContain(`${n} not compared`);
        // (the ellipsis, where there is one, falls inside the method sentence)
        if (cut >= 0) expect(before.slice(before.indexOf("not compared")), line).toContain("Duplicates judged");
      }
    }
  });
});

/** The card's column for its state's words, in page px, as `cardLines` takes it; a line's parts, as joined by " · ". */
const COL = CARD.w - 2 * CARD.hair - 2 * CARD.side - CARD.icon - CARD.gap;
const DOT = " \u00b7 ";
/** A run's line on its card as the store writes it: its time first. */
const timed = (said: string) => `${clock(0)}${DOT}${said}`;
/** A failures line as a calculation step says it: those that ended, then the failures counted by kind. */
function failedLine(all: number, n: number): string {
  const failures: Failure[] = Array.from({ length: n }, (_, k) => (k % 3 ? { kind: "not-converged", why: "" } : { kind: "program-error", why: "An invented reason." }));
  return `${all - n} of ${all}${DOT}${failuresSaid(failures, all)}`;
}

/**
 * Where `lines` break `text` (or its counts-only form, whichever they show), each break that is not between two parts -
 * beside a dot that ends a line or starts the next: the part it falls in, and whether that part alone (with its dot) is
 * wider than the card - none may be not.
 */
function breaksInsideParts(text: string, lines: string[]): { at: string; wide: boolean }[] {
  const said = lines.join(" ").replace(/\u2026$/, "");
  const shownText = text.startsWith(said) ? text : countsOnly(text);
  expect(shownText.startsWith(said), said).toBe(true);
  const parts = shownText.split(DOT);
  const inside: { at: string; wide: boolean }[] = [];
  let at = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    at += lines[i].length;
    if (!lines[i].endsWith(" \u00b7") && !lines[i + 1].startsWith("\u00b7 ")) {
      const part = parts[shownText.slice(0, at).split(DOT).length - 1];
      inside.push({ at: part, wide: textWidth(`${part} \u00b7`, 11) > COL });
    }
    at += 1;
  }
  return inside;
}

describe("a step's line on its card, where it takes two lines", () => {
  it("breaks between its parts in the case seen: a count stays with its words", () => {
    const line = timed("2 of 3 entries kept · rest 1");
    const lines = shown(line);
    expect(lines.join(" ")).toBe(line);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const l of lines) for (const p of l.replace(/ \u00b7$/, "").replace(/^\u00b7 /, "").split(DOT)) expect(line.split(DOT), l).toContain(p);
  });

  it("breaks between parts at every count, inside one only where that part alone is wider than the card", { timeout: 120_000 }, () => {
    const lines: string[] = [];
    for (const all of COUNTS) {
      const n = Math.max(1, Math.floor(all / 4));
      lines.push(duplicatesLine(all, n), checkLine(all, n), failedLine(all, n), ...enumerateLines(n).map((e) => e.line));
    }
    let between = 0;
    for (const line of lines.map(timed)) {
      const laid = shown(line);
      expect(laid.length, line).toBeLessThanOrEqual(2);
      const inside = breaksInsideParts(line, laid);
      expect(inside.filter((b) => !b.wide), line).toEqual([]);
      if (laid.length > 1 && !inside.length) between += 1;
    }
    // (the sweep holds lines that do take two lines and break between parts)
    expect(between).toBeGreaterThan(0);
  });
});

describe("Duplicates on structures drawn, ligands not stated", () => {
  it("compares none whose metal's ligands are not stated, saying so by the state's own name", () => {
    const out = runMenoDrawn("duplicates", [onMethyl, onMethyl, ethane, ethane].map((drawn, place) => ({ place, drawn })));
    expect(out.ok && out.said).toBe(`3 of 4 entries kept · rest 1 · 2 not compared (2: ${LIGANDS_NOT_STATED})`);
    expect(out.ok && out.kept.map((e) => e.place)).toEqual([0, 1, 2]);
  });
});
