import { describe, expect, it } from "vitest";
import { ARROW_CLEAR, ARROW_PAST_WORDS, arrowsWithWords, inArrowReach, captionLines, captionPlace, captionPlaceAt, captionPlaces, captionRuns, captionSet, captionWords, CAPTION_LINE, keptWords, LIST_INDENT, listItem, marksOf, stylesOf, withWordsNeed, wordsNeed } from "./captions";
import { labelBox, placeLabel, runsWidth } from "./layout2d";

const shown = (line: string) =>
  captionRuns(line)
    .map((r) => (r.sub ? `_${r.text}` : r.sup ? `^${r.text}` : r.italic ? `/${r.text}/` : r.text))
    .join("|");

describe("a caption's words", () => {
  it("are set as formulas are: counts low, a group's own count too", () => {
    expect(shown("K2CO3, DMF, 60 °C")).toBe("K|_2|CO|_3|, DMF, 60 °C");
    expect(shown("Pd2(dba)3")).toBe("Pd|_2|(dba)|_3");
    expect(shown("Et3N, CH2Cl2")).toBe("Et|_3|N, CH|_2|Cl|_2");
    expect(shown("Pd(PPh3)4")).toBe("Pd(PPh|_3|)|_4");
  });

  it("set a prefix in italics only at a word's start, and a sign at a formula's end as its charge", () => {
    expect(shown("t-BuOK, THF")).toBe("/t/|-BuOK, THF");
    expect(shown("m-CPBA, CH2Cl2")).toBe("/m/|-CPBA, CH|_2|Cl|_2");
    expect(shown("n-hexane")).toBe("/n/|-hexane");
    expect(shown("co-solvent")).toBe("co-solvent");
    expect(shown("NH4+")).toBe("NH|_4|^+");
    expect(shown("BF4-")).toBe("BF|_4|^−");
  });

  it("keep a name's digits as typed: only a word of element symbols and groups Meno knows is a formula", () => {
    // (worked from the rule first: A is no element's symbol and _ is in no formula; T, Fig, Run, G and Cat name nothing a formula counts, and an L alone is a name)
    expect(shown("AB1_CD002")).toBe("AB1_CD002");
    expect(shown("Sample_A1, TS1, Fig2")).toBe("Sample_A1, TS1, Fig2");
    expect(shown("Run12 Cat1 L1")).toBe("Run12 Cat1 L1");
    expect(shown("XPhos Pd G3")).toBe("XPhos Pd G3");
    expect(shown("3a, 2b")).toBe("3a, 2b");
    // (formulae keep their counts low: elements, deuterium, groups, ligands, a hydrate's dot, a bracket's count)
    expect(shown("H2O2")).toBe("H|_2|O|_2");
    expect(shown("CDCl3, D2O")).toBe("CDCl|_3|, D|_2|O");
    expect(shown("BF3·OEt2")).toBe("BF|_3|·OEt|_2");
    expect(shown("CuSO4·5H2O")).toBe("CuSO|_4|·5H|_2|O");
    expect(shown("[RuCl2(p-cymene)]2")).toBe("[RuCl|_2|(|/p/|-cymene)]|_2");
    expect(shown("Ni(cod)2, R2NH")).toBe("Ni(cod)|_2|, R|_2|NH");
    expect(shown("Ts2O, Boc2O")).toBe("Ts|_2|O, Boc|_2|O");
    // (a locant written as a formula is - C7-H, 6-H2 - reads as one: the rule cannot tell)
    expect(shown("C7-H")).toBe("C|_7|-H");
    expect(shown("6-H2")).toBe("6-H|_2");
  });

  it("keep a deuterated solvent's count low: a d and its count after a hyphen", () => {
    expect(shown("DMSO-d6")).toBe("DMSO-d|_6");
    expect(shown("acetone-d6")).toBe("acetone-d|_6");
    expect(shown("THF-d8")).toBe("THF-d|_8");
    expect(shown("methanol-d4")).toBe("methanol-d|_4");
    expect(shown("toluene-d8")).toBe("toluene-d|_8");
    expect(shown("benzene-d6")).toBe("benzene-d|_6");
    expect(shown("pyridine-d5")).toBe("pyridine-d|_5");
    expect(shown("CD3OD")).toBe("CD|_3|OD");
    expect(shown("CD2Cl2")).toBe("CD|_2|Cl|_2");
    expect(shown("C6D6")).toBe("C|_6|D|_6");
    expect(shown("D2O")).toBe("D|_2|O");
    expect(shown("CDCl3")).toBe("CDCl|_3");
  });

  it("set the names of mechanisms as typed", () => {
    for (const w of ["SN1", "SN2", "SN2'", "SNi", "SRN1", "E1", "E2", "E1cB"]) expect(shown(w)).toBe(w);
    expect(shown("an SN2 step")).toBe("an SN2 step");
    // (within brackets, before a stop or a comma, before a hyphen - what follows the hyphen set as any word)
    expect(shown("(SN2)")).toBe("(SN2)");
    expect(shown("by SN2.")).toBe("by SN2.");
    expect(shown("SN1, E1")).toBe("SN1, E1");
    expect(shown("SN2-type")).toBe("SN2-type");
    expect(shown("an SN2-like step")).toBe("an SN2-like step");
    expect(shown("[E2]")).toBe("[E2]");
    expect(shown("E1cB-like")).toBe("E1cB-like");
    // (the formulae beside them keep their counts)
    expect(shown("NO2, CS2")).toBe("NO|_2|, CS|_2");
  });

  it("set an element's symbol and a number alone as typed, but for an element's own molecules", () => {
    for (const w of ["P450", "K562", "U87", "H1299", "B16", "S9", "F12", "N95", "W2", "Y2", "H1", "D3", "C18", "B12", "S1", "R1", "L1", "M1"]) expect(shown(w)).toBe(w);
    expect(shown("H2, D2, N2, O2, O3")).toBe("H|_2|, D|_2|, N|_2|, O|_2|, O|_3");
    expect(shown("F2 Cl2 Br2 I2")).toBe("F|_2| Cl|_2| Br|_2| I|_2");
    expect(shown("S8, P4, C60, C70, X2")).toBe("S|_8|, P|_4|, C|_60|, C|_70|, X|_2");
  });

  it("read L, M and Ln as a ligand, a metal and a lanthanide where one is counted, beside a metal or alone", () => {
    expect(shown("L2Pd")).toBe("L|_2|Pd");
    expect(shown("PdL4")).toBe("PdL|_4");
    expect(shown("ML2")).toBe("ML|_2");
    expect(shown("M(CO)6")).toBe("M(CO)|_6");
    expect(shown("Ln(OTf)3")).toBe("Ln(OTf)|_3");
    expect(shown("PdCl2L2")).toBe("PdCl|_2|L|_2");
    // (names that hold an L or an M: no metal beside it, or it uncounted)
    for (const w of ["B3LYP-D3", "PM6", "MP2", "IM2", "MCF7", "IL6", "HL60", "M2", "L3"]) expect(shown(w)).toBe(w);
  });

  it("set a sign at a word's end as a charge only on a formula or an element's symbol", () => {
    expect(shown("H+, Cl-, OH-, Na+")).toBe("H|^+|, Cl|^−|, OH|^−|, Na|^+");
    expect(shown("NH4+, Me4N+, M+")).toBe("NH|_4|^+|, Me|_4|N|^+|, M|^+");
    // (the electron, and electrons counted)
    expect(shown("e-")).toBe("e|^−");
    expect(shown("+ 2e-")).toBe("+ 2e|^−");
    // (pH and a number: as typed)
    expect(shown("pH7, pH7.4")).toBe("pH7, pH7.4");
    for (const w of ["ortho-", "para-", "anti-", "syn-", "cis-", "trans-", "tert-", "TS1-", "Fig2-"]) expect(shown(w)).toBe(w);
    // (a hyphen within a word is a hyphen)
    expect(shown("N-methyl, O-alkylation, C-H, S-phenyl")).toBe("N-methyl, O-alkylation, C-H, S-phenyl");
  });

  it("raise a charge's number with its sign: a metal's digit, a bracket's, and the last of two or more", () => {
    expect(shown("Fe3+, Cu2+, Al3+")).toBe("Fe|^3+|, Cu|^2+|, Al|^3+");
    expect(shown("Ca2+ Pd2+ Ce4+")).toBe("Ca|^2+| Pd|^2+| Ce|^4+");
    expect(shown("SO42-")).toBe("SO|_4|^2−");
    expect(shown("PO43-, CO32-")).toBe("PO|_4|^3−|, CO|_3|^2−");
    expect(shown("Cr2O72-")).toBe("Cr|_2|O|_7|^2−");
    expect(shown("S2O32-, O22-")).toBe("S|_2|O|_3|^2−|, O|_2|^2−");
    expect(shown("Hg22+")).toBe("Hg|_2|^2+");
    // (a charge is never written 0 or 1: the last digit goes with the sign only where it is 2 to 9)
    expect(shown("C60-")).toBe("C|_60|^−");
    expect(shown("C70-")).toBe("C|_70|^−");
    expect(shown("S42-")).toBe("S|_4|^2−");
    // (a metal written M or Ln: its digit the charge)
    expect(shown("M2+, M3+, Ln3+")).toBe("M|^2+|, M|^3+|, Ln|^3+");
    expect(shown("[Fe(CN)6]4-")).toBe("[Fe(CN)|_6|]|^4−");
    expect(shown("[Rh(cod)Cl]2")).toBe("[Rh(cod)Cl]|_2");
    // (one digit on a formula of several parts, or on a nonmetal: the count)
    expect(shown("PF6-, BF4-, MnO4-")).toBe("PF|_6|^−|, BF|_4|^−|, MnO|_4|^−");
    expect(shown("NO3-, I3-, N3-")).toBe("NO|_3|^−|, I|_3|^−|, N|_3|^−");
    // (an oxide or a superoxide written O2- reads as the count: set by hand where it is the charge)
    expect(shown("O2-")).toBe("O|_2|^−");
  });

  it("leave what has no letters as typed: numbers, signs, ratios", () => {
    expect(shown("−78 °C, 2 h")).toBe("−78 °C, 2 h");
    expect(shown("A + B")).toBe("A + B");
    expect(shown("THF/H2O (1:1)")).toBe("THF/H|_2|O (1:1)");
    expect(shown("1M HCl")).toBe("1M HCl");
  });
});

describe("a caption set", () => {
  it("centres each line on its middle, line under line", () => {
    const set = captionSet("Pd(PPh3)4\nK2CO3, 80 °C", 10, 5, 1);
    expect(set.items).toHaveLength(2);
    expect(set.items[0].y - set.items[1].y).toBeCloseTo(CAPTION_LINE);
    expect((set.items[0].y + set.items[1].y) / 2).toBeCloseTo(5);
    for (const item of set.items) {
      const placed = placeLabel(item, 1);
      const start = placed[0].x;
      const width = runsWidth(item.runs!, 1);
      expect(start + width / 2).toBeCloseTo(10, 6);
      expect(width / 2).toBeLessThanOrEqual(set.halfW + 1e-9);
    }
    expect(set.halfH).toBeGreaterThan(CAPTION_LINE / 2);
    // (its ink inside what it reaches: a subscript's drop below the last line among it)
    for (const item of set.items) {
      const ink = labelBox(item, 1);
      expect(item.y - ink.bottom).toBeGreaterThanOrEqual(5 - set.halfH - 1e-9);
      expect(item.y + ink.top).toBeLessThanOrEqual(5 + set.halfH + 1e-9);
    }
    // (a blank line keeps its room, and draws nothing)
    expect(captionSet("a\n\nb", 0, 0, 1).items.map((i) => i.text)).toEqual(["a", "b"]);
  });
});

describe("a caption made as wide as something", () => {
  const text = "The rotational barrier of the hydroxyl group was found by conformational analysis to be small.";

  it("is broken at its spaces into lines no wider than it, as many words on each as fit", () => {
    const lines = captionLines(text, 1, undefined, 12);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe(text);
    for (const l of lines) expect(runsWidth(captionRuns(l), 1)).toBeLessThanOrEqual(12 + 1e-9);
    // (each line as full as it can be: the next word would not have fitted)
    for (let i = 0; i < lines.length - 1; i++) expect(runsWidth(captionRuns(`${lines[i]} ${lines[i + 1].split(" ")[0]}`), 1)).toBeGreaterThan(12);
    // (a line typed kept a line of its own; none, as typed)
    expect(captionLines("one two\nthree", 1, undefined, 100)).toEqual(["one two", "three"]);
    expect(captionLines("one two\nthree", 1)).toEqual(["one two", "three"]);
    // (a number and the unit after it kept together - where the two fit)
    for (const width of [4, 5, 6, 7, 8]) {
      const lines = captionLines("K2CO3, DMF, 60 °C, 12 h, then 2 equiv of base", 1, undefined, width);
      expect(lines.some((l) => /(^|\s)60$/.test(l) || /(^|\s)12$/.test(l) || /(^|\s)2$/.test(l))).toBe(false);
    }
    expect(captionLines("60 °C", 1, undefined, 3)).toEqual(["60 °C"]);
    expect(captionLines("−78–0 °C, 1–2 h", 1, undefined, 4)).toEqual(["−78–0", "°C,", "1–2 h"]);
    expect(captionLines("aged 3 days", 1, undefined, 3)).toEqual(["aged", "3 days"]);
    // (but where the two are wider than it: parted at the space between them, not in a word)
    expect(captionLines("60 °C", 1, undefined, 1.5)).toEqual(["60", "°C"]);
    expect(captionLines("aged 3 days", 1, undefined, 2.5)).toEqual(["aged", "3", "days"]);
  });

  it("breaks a word wider than it at its edge - after a hyphen, a comma or a closing bracket, or before an opening one, where one fits (the maintainer, 2026-10-13)", () => {
    const name = "2-amino-3-(4-hydroxyphenyl)propanoic acid";
    expect(captionLines(name, 1, undefined, 7)).toEqual(["2-amino-3-(4-", "hydroxyphenyl)", "propanoic acid"]);
    expect(captionLines(name, 1, undefined, 5).slice(0, 2)).toEqual(["2-amino-3-", "(4-"]);
    for (const width of [2, 3, 5, 7]) {
      const lines = captionLines(name, 1, undefined, width);
      // (no letter lost or added: a word's pieces end to end, words a space apart)
      expect(lines.join("").replace(/ /g, "")).toBe(name.replace(/ /g, ""));
      // (each line as it is set - a broken word's ends as typed - no wider than it)
      for (const t of captionSet(name, 0, 0, 1, undefined, width).items) expect(runsWidth(t.runs!, 1)).toBeLessThanOrEqual(width + 1e-9);
    }
    // (none to break at: at the edge, as much on each line as fits; the last piece goes on with the words after it)
    const lines = captionLines("a conformationally b", 1, undefined, 2);
    expect(lines[0]).toBe("a");
    expect(lines[lines.length - 1].endsWith(" b")).toBe(true);
    expect(lines.join("").replace(/ /g, "")).toBe("aconformationallyb");
    for (const l of lines) expect(runsWidth(captionRuns(l), 1)).toBeLessThanOrEqual(2 + 1e-9);
    expect(captionLines("x".repeat(20), 1, undefined, 3)).toEqual(["xxxxxx", "xxxxxx", "xxxxxx", "xx"]);
    // (a letter alone wider than it: a line of its own, and no line left empty)
    expect(captionLines("aged", 1, undefined, 0.5)).toEqual(["a", "g", "e", "d"]);
    // (a list's bullet kept with the first piece of its word)
    expect(captionLines("• Pneumonoultramicroscopic", 1, undefined, 4)[0].startsWith("• P")).toBe(true);
  });

  it("breaks a word of thousands of letters - formulas among its pieces - as it breaks a short one", () => {
    const piece = "CH3,C12H22O11,NH4+;Cl−/(S)-BINAP-";
    const long = piece.repeat(120);
    for (const width of [1.5, 4, 9]) {
      const lines = captionLines(long, 1, undefined, width);
      expect(lines.join("")).toBe(long);
      for (const t of captionSet(long, 0, 0, 1, undefined, width).items) expect(runsWidth(t.runs!, 1)).toBeLessThanOrEqual(width + 1e-9);
      // (each piece breaks as it does alone)
      const alone = captionLines(piece.repeat(3), 1, undefined, width);
      expect(lines.slice(0, alone.length - 1)).toEqual(alone.slice(0, -1));
    }
  });

  it("sets the ends of a word it broke as typed - a hyphen at a break no charge, a locant no count", () => {
    const set = captionSet("2-amino-3-(4-hydroxyphenyl)propanoic acid", 0, 0, 1, undefined, 7);
    expect(set.items.map((t) => t.text)).toEqual(["2-amino-3-(4-", "hydroxyphenyl)", "propanoic acid"]);
    for (const t of set.items) expect(t.runs!.some((r) => r.sup || r.sub)).toBe(false);
    expect(captionSet("N,N-diisopropylethylamine", 0, 0, 1, undefined, 4).items[0].runs).toEqual([{ text: "N,N-" }]);
    // (a formula whole on its line still set as one)
    expect(captionSet("K2CO3 in water", 0, 0, 1, undefined, 4).items[0].runs!.some((r) => r.sub)).toBe(true);
  });

  it("leaves no line of a space alone, nor one ending in it, where a bullet is wider than the room", () => {
    expect(captionLines("– e", 1, undefined, 0.7)).toEqual(["–", "e"]);
    expect(captionLines("53. O", 1, undefined, 2)).toEqual(["53.", "O"]);
  });

  it("keeps a list's lines in the width however deep the list, and a justified item's bullet where it begins", () => {
    const deep = captionWords("\t\t\t\t\t• abc def", 0, 0, 1, undefined, 3, "left");
    for (const w of deep.words) {
      expect(w.x).toBeGreaterThanOrEqual(-1.5 - 1e-9);
      expect(w.x + w.w).toBeLessThanOrEqual(1.5 + 1e-9);
    }
    const item = captionWords("• aaa bbb ccc ddd eee fff ggg hhh", 0, 0, 1, undefined, 6, "justify");
    // (the bullet at the edge; the first word where the lines under it hang)
    expect(item.words[0].x).toBeCloseTo(-3, 9);
    const hangs = item.words.filter((w) => w.y < item.words[0].y - 1e-9)[0].x;
    expect(item.words[1].x).toBeCloseTo(hangs, 9);
  });

  it("puts no caret inside a letter as the reader sees it - an emoji's halves", () => {
    const places = captionPlaces("x😀y", 0, 0, 1);
    expect(places.at.map((a) => !!a.inside)).toEqual([false, false, true, false, false]);
    // (a click on the emoji's right half: after it, not between its halves)
    expect(captionPlaceAt(places, { x: places.at[3].x - 0.01, y: places.lines[0].y })).toBe(3);
  });

  it("has a place for the caret at every letter of a word it broke, on the line it fell on", () => {
    const text = "a conformationally b";
    const places = captionPlaces(text, 0, 0, 1, undefined, 2);
    expect(places.at).toHaveLength(text.length + 1);
    expect(places.lines).toHaveLength(captionLines(text, 1, undefined, 2).length);
    // (the word's letters on the lines after the first, in order down them)
    const lines = places.at.slice(2, 18).map((p) => p.line);
    expect(lines[0]).toBe(1);
    expect(lines.every((l, i) => i === 0 || l >= lines[i - 1])).toBe(true);
    expect(lines[lines.length - 1]).toBeGreaterThan(1);
  });

  it("reaches as wide as it was made, and as tall as its lines, each centred", () => {
    const set = captionSet(text, 0, 0, 1, undefined, 12);
    expect(set.halfW).toBeGreaterThanOrEqual(6);
    expect(set.items.length).toBe(captionLines(text, 1, undefined, 12).length);
    expect(set.items[0].y - set.items[1].y).toBeCloseTo(CAPTION_LINE);
    // (narrower words, narrower lines: more of them)
    expect(captionSet(text, 0, 0, 1, undefined, 6).items.length).toBeGreaterThan(set.items.length);
  });
});

describe("a caption's lines laid", () => {
  const text = "The rotational barrier of the hydroxyl group was found by conformational analysis to be small.";
  /** Where a line's ink starts and ends, as placed. */
  const ends = (items: ReturnType<typeof captionSet>["items"], y: number) => {
    const on = items.filter((i) => Math.abs(i.y - y) < 1e-9);
    const starts = on.map((i) => placeLabel(i, 1)[0].x);
    const stops = on.map((i, k) => starts[k] + runsWidth(i.runs!, 1));
    return { start: Math.min(...starts), stop: Math.max(...stops) };
  };

  it("to the left or the right of the width, or about its middle", () => {
    const left = captionSet(text, 0, 0, 1, undefined, 12, "left");
    for (const item of left.items) expect(ends(left.items, item.y).start).toBeCloseTo(-6);
    const right = captionSet(text, 0, 0, 1, undefined, 12, "right");
    for (const item of right.items) expect(ends(right.items, item.y).stop).toBeCloseTo(6);
    const centre = captionSet(text, 0, 0, 1, undefined, 12);
    for (const item of centre.items) {
      const e = ends(centre.items, item.y);
      expect((e.start + e.stop) / 2).toBeCloseTo(0);
    }
    // (with no width, in the widest line's)
    const two = captionSet("a\nlonger line", 0, 0, 1, undefined, undefined, "left");
    expect(ends(two.items, two.items[0].y).start).toBeCloseTo(ends(two.items, two.items[1].y).start);
  });

  it("spread to both edges, each but a typed line's last, which lies to the left", () => {
    const set = captionSet(text, 0, 0, 1, undefined, 12, "justify");
    const ys = [...new Set(set.items.map((i) => i.y))].sort((a, b) => b - a);
    expect(ys.length).toBeGreaterThan(2);
    for (const y of ys.slice(0, -1)) {
      const e = ends(set.items, y);
      expect(e.start).toBeCloseTo(-6);
      expect(e.stop).toBeCloseTo(6);
    }
    const last = ends(set.items, ys[ys.length - 1]);
    expect(last.start).toBeCloseTo(-6);
    expect(last.stop).toBeLessThan(6);
    // (its words all there, in order)
    expect(set.items.map((i) => i.text).join(" ")).toBe(text);
  });

  it("word by word, each where its line set whole has it", () => {
    for (const align of ["left", "center", "right", "justify"] as const) {
      const whole = captionSet(text, 0, 0, 1, undefined, 12, align);
      const words = captionWords(text, 0, 0, 1, undefined, 12, align);
      expect(words.items.map((i) => i.text)).toEqual(text.split(" "));
      expect(words.words).toHaveLength(words.items.length);
      expect(words.halfW).toBeCloseTo(whole.halfW);
      expect(words.halfH).toBeCloseTo(whole.halfH);
      for (const y of new Set(whole.items.map((i) => i.y))) {
        const a = ends(whole.items, y);
        const b = ends(words.items, y);
        expect(b.start).toBeCloseTo(a.start);
        expect(b.stop).toBeCloseTo(a.stop, 1);
      }
    }
  });
});

describe("where a caption put down goes", () => {
  const arrow = { id: 7, x: 0, y: 0, angle: 0, length: 4.8 };
  const half = { w: 1.5, h: 0.6 };

  it("near an arrow: over it, or under it, centred on its middle and clear of it - the arrow's", () => {
    const over = captionPlace({ x: 1, y: 1.2 }, half, [arrow], 1);
    expect(over.arrow).toBe(7);
    expect(over.x).toBeCloseTo(0);
    expect(over.y).toBeCloseTo(ARROW_CLEAR + 0.6);
    const under = captionPlace({ x: -1.5, y: -0.4 }, half, [arrow], 1);
    expect(under.y).toBeCloseTo(-(ARROW_CLEAR + 0.6));
    // (a vertical arrow: beside it)
    const down = captionPlace({ x: 0.5, y: 0 }, half, [{ ...arrow, angle: -Math.PI / 2 }], 1);
    expect(down.x).toBeCloseTo(ARROW_CLEAR + 1.5);
    expect(down.y).toBeCloseTo(0);
  });

  it("beyond a caption already over it", () => {
    const first = { x: 0, y: ARROW_CLEAR + 0.6, arrow: 7, halfW: 1.5, halfH: 0.6 };
    const second = captionPlace({ x: 0, y: 0.5 }, half, [arrow], 1, [first]);
    expect(second.y).toBeCloseTo(first.y + 0.6 + 0.25 + 0.6);
  });

  it("where it was put, away from any arrow or past its ends", () => {
    expect(captionPlace({ x: 0, y: 6 }, half, [arrow], 1)).toEqual({ x: 0, y: 6 });
    expect(captionPlace({ x: 3, y: 0.5 }, half, [arrow], 1)).toEqual({ x: 3, y: 0.5 });
  });
});

describe("where a caret stands in a caption", () => {
  it("is before each letter and at the end, as the line is set: a formula's counts set low, narrower", () => {
    const p = captionPlaces("K2CO3", 0, 0, 1);
    expect(p.at).toHaveLength(6);
    expect(p.lines).toHaveLength(1);
    // (from the line's start to its end, as wide as it is set, about its middle)
    const w = runsWidth(captionRuns("K2CO3"), 1);
    expect(p.at[0].x).toBeCloseTo(-w / 2);
    expect(p.at[5].x).toBeCloseTo(w / 2);
    for (let k = 1; k < 6; k++) expect(p.at[k].x).toBeGreaterThan(p.at[k - 1].x);
    // (the count's place no further on than a letter's would be)
    expect(p.at[2].x - p.at[1].x).toBeLessThan(p.at[1].x - p.at[0].x);
  });

  it("goes down a line at a line typed, and where the setting breaks it", () => {
    const text = "Pd2(dba)3\nK2CO3,  dioxane";
    const p = captionPlaces(text, 0, 0, 1);
    expect(p.at).toHaveLength(text.length + 1);
    expect(p.at[9].line).toBe(0);
    expect(p.at[10].line).toBe(1);
    expect(p.lines[0].y - p.lines[1].y).toBeCloseTo(CAPTION_LINE);
    const wide = captionPlaces("one two three", 0, 0, 1, undefined, runsWidth(captionRuns("one two"), 1) + 0.01, "left");
    expect(wide.lines).toHaveLength(2);
    // ("three" begins the second line: the space before it at the first's end, its t at the second's start)
    expect(wide.at[7]).toMatchObject({ line: 0 });
    expect(wide.at[8]).toMatchObject({ line: 1, x: wide.lines[1].x0 });
    expect(wide.lines[1].x0).toBeCloseTo(wide.lines[0].x0);
  });

  it("moves on a space for each space typed - between words set as typed, at a line's ends hung off it", () => {
    const sp = runsWidth([{ text: " " }], 1);
    // (at the end: past the last letter a space at a time, the letters where they were)
    const end = captionPlaces("OMe  ", 0, 0, 1);
    const bare = captionPlaces("OMe", 0, 0, 1);
    expect(end.at.slice(0, 4)).toEqual(bare.at);
    expect(end.at[4].x - end.at[3].x).toBeCloseTo(sp);
    expect(end.at[5].x - end.at[4].x).toBeCloseTo(sp);
    expect(captionSet("OMe  ", 0, 0, 1).items).toEqual(captionSet("OMe", 0, 0, 1).items);
    // (between words: each its own place, the words after them on by as many - set so, not run together)
    const two = captionPlaces("O  Me", 0, 0, 1);
    for (let k = 1; k < 6; k++) expect(two.at[k].x).toBeGreaterThan(two.at[k - 1].x);
    expect(captionSet("O  Me", 0, 0, 1).items.map((i) => i.text)).toEqual(["O  Me"]);
    expect(captionLines("5  mol%", 1)).toEqual(["5  mol%"]);
    // (before the first letter: hung before it, the letters where they were)
    const lead = captionPlaces("  O", 0, 0, 1);
    expect(lead.at.slice(2)).toEqual(captionPlaces("O", 0, 0, 1).at);
    expect(lead.at[2].x - lead.at[1].x).toBeCloseTo(sp);
    expect(lead.at[1].x - lead.at[0].x).toBeCloseTo(sp);
    // (where the setting breaks a line: past its last letter, as many as were typed)
    const w = runsWidth(captionRuns("one two"), 1) + 0.01;
    const wide = captionPlaces("one two  three", 0, 0, 1, undefined, w, "left");
    expect(wide.at[8]).toMatchObject({ line: 0 });
    expect(wide.at[8].x - wide.at[7].x).toBeCloseTo(sp);
    expect(wide.at[9]).toMatchObject({ line: 1, x: wide.lines[1].x0 });
  });

  it("is kept without the spaces hung at its lines' ends, each letter with its style", () => {
    expect(keptWords("  OMe  ", []).text).toBe("OMe");
    expect(keptWords("a  b \n  c", []).text).toBe("a  b\nc");
    expect(keptWords("\n \nx\n\n", []).text).toBe("x");
    // (an item with nothing after its bullet yet, and a list's tabs: kept)
    expect(keptWords("• one\n• ", []).text).toBe("• one\n• ");
    expect(keptWords("\t• two", []).text).toBe("\t• two");
    const b = { bold: true as const };
    const kept = keptWords(" ab \n cd", [undefined, b, undefined, undefined, undefined, undefined, b, undefined]);
    expect(kept.text).toBe("ab\ncd");
    expect(kept.styles).toEqual([b, undefined, undefined, b, undefined]);
  });

  it("is found nearest a point: on the nearest line, the nearest place across", () => {
    const text = "60 °C\n12 h";
    const p = captionPlaces(text, 0, 0, 1);
    expect(captionPlaceAt(p, { x: p.at[2].x + 0.01, y: p.lines[0].y + 0.1 })).toBe(2);
    expect(captionPlaceAt(p, { x: 100, y: p.lines[1].y - 0.2 })).toBe(text.length);
    // (an empty caption: its one place)
    expect(captionPlaceAt(captionPlaces("", 3, 4, 1), { x: 0, y: 0 })).toBe(0);
  });

  it("keeps every letter of a line where its runs set it, whatever the setting makes of it", () => {
    for (const t of ["t-BuOK, THF", "NH4+ BF4-", "(R)-BINAP, 2 equiv", "THF/H2O (1:1)", "−78 °C"]) {
      expect(captionRuns(t).map((r) => r.text).join("").length).toBe(t.length);
    }
  });
});


describe("an arrow and its words", () => {
  const fs = 10;
  const arrow = { id: 1, x: 0, y: 0, angle: 0, length: 40 };

  it("is as long as it was made while its words are shorter", () => {
    const [a] = arrowsWithWords([arrow], [{ arrow: 1, x: 0, y: 8, text: "THF" }], fs);
    expect(a.length).toBe(40);
  });

  it("grows about its middle to reach past its longest words at either end", () => {
    const text = "Pd(PPh3)4, K2CO3, dioxane, 100 °C";
    const { halfW } = captionSet(text, 0, 8, fs);
    const [a] = arrowsWithWords([arrow], [{ arrow: 1, x: 0, y: 8, text }, { arrow: 1, x: 0, y: -8, text: "12 h" }], fs);
    expect(a.length).toBeCloseTo(2 * (halfW + ARROW_PAST_WORDS * fs), 6);
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
  });

  it("goes back to the length it was made as its words get shorter", () => {
    const long = arrowsWithWords([arrow], [{ arrow: 1, x: 0, y: 8, text: "Pd(PPh3)4, K2CO3, dioxane, 100 °C" }], fs)[0];
    const short = arrowsWithWords([arrow], [{ arrow: 1, x: 0, y: 8, text: "THF" }], fs)[0];
    expect(long.length).toBeGreaterThan(40);
    expect(short.length).toBe(40);
  });

  it("takes words beside it, going up the page, by their height", () => {
    const up = { id: 2, x: 0, y: 0, angle: Math.PI / 2, length: 10 };
    const need = wordsNeed([up], [{ arrow: 2, x: 12, y: 0, halfW: 30, halfH: 9 }], fs);
    expect(need.get(2)).toBeCloseTo(2 * (9 + ARROW_PAST_WORDS * fs), 6);
  });

  it("takes no words that are another arrow's, or none's", () => {
    const need = wordsNeed([arrow], [{ arrow: 3, x: 0, y: 8, halfW: 90, halfH: 5 }, { x: 0, y: 8, halfW: 90, halfH: 5 }], fs);
    expect(need.has(1)).toBe(false);
  });
});

describe("letters marked in words on the page", () => {
  it("are set as they were marked: bold, italic, coloured, raised or lowered - a formula's counts low all the same", () => {
    const text = "dG kcal mol-1 K2CO3";
    const marks = [
      { from: 0, to: 2, bold: true as const },
      { from: 11, to: 13, script: "sup" as const },
      { from: 14, to: 19, color: "#cd4560" },
    ];
    const runs = captionRuns(text, stylesOf(text.length, marks));
    expect(runs.map((r) => r.text).join("")).toBe(text);
    expect(runs.find((r) => r.text === "dG")).toMatchObject({ bold: true });
    expect(runs.find((r) => r.text === "-1")).toMatchObject({ sup: true });
    // (the carbonate in its colour, its counts still low)
    const red = runs.filter((r) => r.color === "#cd4560");
    expect(red.map((r) => r.text).join("")).toBe("K2CO3");
    expect(red.filter((r) => r.sub).map((r) => r.text)).toEqual(["2", "3"]);
  });

  it("keep their marks as letters set alike, apart and in order - none for plain letters", () => {
    const styles = stylesOf(8, [
      { from: 1, to: 3, bold: true },
      { from: 2, to: 5, italic: true },
    ]);
    expect(marksOf(styles)).toEqual([
      { from: 1, to: 2, bold: true },
      { from: 2, to: 3, bold: true, italic: true },
      { from: 3, to: 5, italic: true },
    ]);
    expect(marksOf(stylesOf(4, []))).toEqual([]);
  });

  it("lay out as wide as their runs are set: a raised part narrower", () => {
    const plain = captionSet("x 10-3", 0, 0, 1);
    const raised = captionSet("x 10-3", 0, 0, 1, undefined, undefined, "center", [{ from: 4, to: 6, script: "sup" }]);
    expect(raised.halfW).toBeLessThan(plain.halfW);
  });
});

describe("a list in words on the page", () => {
  const width = 8;
  it("is told by a bullet or a number at a line's start, after a tab for each level", () => {
    expect(listItem("• first")).toEqual({ level: 0, mark: "•", head: 2 });
    expect(listItem("\t\t– deeper")).toEqual({ level: 2, mark: "–", head: 4 });
    expect(listItem("12. twelfth")).toEqual({ level: 0, mark: "12.", head: 4 });
    expect(listItem("- a hyphen")).toBeNull();
    expect(listItem("−78 °C")).toBeNull();
  });

  it("hangs its item's lines after the first under its words, and sets a level further in", () => {
    const text = "• the carboxylic acid holds the aldehyde\n\t– a hydrogen bond";
    const p = captionPlaces(text, 0, 0, 1, undefined, width, "left");
    const box0 = -width / 2;
    // (the bullet at the edge; the item's next line where its first word began)
    expect(p.lines[0].x0).toBeCloseTo(box0);
    const firstWord = p.at[2].x;
    expect(p.lines[1].x0).toBeCloseTo(firstWord);
    // (the second item a level in, its tab where its line begins)
    const second = text.indexOf("\t");
    const line = p.at[second].line;
    expect(p.lines[line].x0).toBeCloseTo(box0 + LIST_INDENT);
    expect(p.at[second].x).toBeCloseTo(box0 + LIST_INDENT);
    expect(p.at).toHaveLength(text.length + 1);
  });

  it("keeps every place in order down its lines", () => {
    const text = "1. one two three four five six\n2. seven";
    const p = captionPlaces(text, 0, 0, 1, undefined, width, "left");
    for (let k = 1; k < p.at.length; k++) {
      const a = p.at[k - 1];
      const b = p.at[k];
      expect(b.line > a.line || (b.line === a.line && b.x >= a.x - 1e-9)).toBe(true);
    }
  });
});

describe("words over an arrow that turns", () => {
  it("go over its longest stretch, the arrow growing as a whole until that stretch holds them", () => {
    const bent = { id: 1, x: 5, y: 0, angle: 0, length: 10, corners: [{ along: 0.2, across: 3 }] };
    // (its longest stretch: from the corner at (2, 3) to its point at (10, 0))
    const placed = captionPlace({ x: 6, y: 2 }, { w: 1, h: 0.5 }, [bent], 1);
    expect(placed.arrow).toBe(1);
    const stretch = Math.hypot(8, 3);
    const grown = withWordsNeed([bent], new Map([[1, 2 * stretch]]))[0];
    expect(grown.length).toBeCloseTo(20, 9);
    expect(withWordsNeed([bent], new Map([[1, stretch / 2]]))[0]).toBe(bent);
  });
});

describe("words within an arrow's reach", () => {
  it("are those along it, within its length, and across it within two and a half ems and their own half height - as words are put by it", () => {
    const arrow = { x: 0, y: 0, angle: 0, length: 4 };
    const half = { w: 1, h: 0.3 };
    // (font of 1: the reach across is 2.5 + 0.3)
    expect(inArrowReach({ x: 0, y: 1 }, half, arrow, 1)).toBe(true);
    expect(inArrowReach({ x: 2, y: -2.8 }, half, arrow, 1)).toBe(true);
    expect(inArrowReach({ x: 2.01, y: 0.5 }, half, arrow, 1)).toBe(false);
    expect(inArrowReach({ x: 0, y: 2.81 }, half, arrow, 1)).toBe(false);
    // (an arrow at an angle: measured along it and across it)
    const turned = { x: 0, y: 0, angle: Math.PI / 2, length: 4 };
    expect(inArrowReach({ x: 1, y: 1.9 }, half, turned, 1)).toBe(true);
    expect(inArrowReach({ x: 1, y: 2.1 }, half, turned, 1)).toBe(false);
    // (where one is put by it, it is within its reach: captionPlace and this agree)
    expect(captionPlace({ x: 0, y: 2.8 }, half, [{ ...arrow, id: 1 }], 1).arrow).toBe(1);
    expect(captionPlace({ x: 0, y: 2.81 }, half, [{ ...arrow, id: 1 }], 1).arrow).toBeUndefined();
  });
});
