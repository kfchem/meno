import { describe, expect, it } from "vitest";
import { pageTextFrom } from "../../../../lib/pdf/text";
import { mentionAt } from "./compoundMentions";

/** A line of words, each letter 6 points wide; the words in `bold` set bold. */
function line(text: string, bold: string[] = []) {
  const chars = [...text];
  const marks = chars.map(() => false);
  for (const w of bold) {
    const at = text.indexOf(w);
    for (let k = at; k < at + w.length; k++) marks[k] = true;
  }
  return pageTextFrom(text, chars.map((c, k) => (c === " " ? null : ([72 + 6 * k, 100, 78 + 6 * k, 112] as const))), marks);
}
const at = (text: string, word: string) => text.indexOf(word);

describe("a compound's number mentioned in the text, in the shapes beyond a number alone (found in review)", () => {
  it("is a Roman numeral, or a number with its enantiomer's or rotation's mark, set bold", () => {
    const text = "From IV, ent-21 gave (+)-12 and (\u2212)\u201312.";
    const t = line(text, ["IV", "ent-21", "12 ", "12."]);
    expect(["IV", "ent-21"].map((w) => mentionAt(t, at(text, w) + 1)?.label)).toEqual(["IV", "ent-21"]);
    // (the pointer on the number: the number with its mark before it, its dash and sign written as typed)
    expect(mentionAt(t, at(text, "(+)-12") + 4)).toEqual({ label: "(+)-12", start: at(text, "(+)-12"), end: at(text, "(+)-12") + 6 });
    expect(mentionAt(t, at(text, "(\u2212)") + 5)?.label).toBe("(-)-12");
  });

  it("is a plain number where no mark stands before it, and none for a dash before a number alone", () => {
    const text = "and 12 or -3";
    const t = line(text, ["12", "-3"]);
    expect(mentionAt(t, at(text, "12"))?.label).toBe("12");
    expect(mentionAt(t, at(text, "-3") + 1)).toBeNull();
  });
});

describe("a compound's number mentioned in the text", () => {
  it("is a number of that shape set bold", () => {
    const text = "Ketone 12 gave 13a in 2 h.";
    const t = line(text, ["12", "13a"]);
    expect(mentionAt(t, at(text, "12"))).toEqual({ label: "12", start: 7, end: 9 });
    expect(mentionAt(t, at(text, "13a") + 1)?.label).toBe("13a");
    // (the 2 of "2 h" not bold: none)
    expect(mentionAt(t, at(text, "2 h"))).toBeNull();
  });

  it("is a number named a compound by the words before it, past other numbers and joining words", () => {
    const text = "compounds 3, 4 and 5 were made; product 7' too, as was entry 8";
    const t = line(text);
    expect(["3,", "4 ", "5 ", "7'"].map((w) => mentionAt(t, at(text, w))?.label)).toEqual(["3", "4", "5", "7'"]);
    expect(mentionAt(t, at(text, "8"))).toBeNull();
  });

  it("is a number in parentheses just after a name - camphor (12) - but not after a table's, a figure's or a reference's word", () => {
    const text = "camphor (12) and cocaine (3a); Table (2), ref. (14), in (5 h)";
    const t = line(text);
    expect(mentionAt(t, at(text, "12"))?.label).toBe("12");
    expect(mentionAt(t, at(text, "3a"))?.label).toBe("3a");
    for (const [w, k] of [["Table (2)", 7], ["ref. (14)", 6], ["(5 h)", 1]] as const) expect(mentionAt(t, at(text, w) + k)).toBeNull();
  });

  it("is none where the words are none: hours, a year, a table, a reference - unless every number is asked for", () => {
    const text = "after 12 h in 2019 (Table 2, ref. 14)";
    const t = line(text);
    for (const w of ["12", "2019", "2,", "14"]) expect(mentionAt(t, at(text, w))).toBeNull();
    expect(mentionAt(t, at(text, "12"), true)?.label).toBe("12");
    expect(mentionAt(t, at(text, "14"), true)?.label).toBe("14");
    // (a year is no compound's number at all: four figures)
    expect(mentionAt(t, at(text, "2019"), true)).toBeNull();
    expect(mentionAt(t, at(text, "Table"), true)).toBeNull();
  });

  it("joins numbers named together by \"or\" as by \"and\", within reach of the naming word - six words back, no further", () => {
    const or = "compounds 3 or 4 were made";
    expect(mentionAt(line(or), at(or, "4"))?.label).toBe("4");
    const far = "compounds 1, 2, 3, 4, 5, 6, 7 were made";
    const t = line(far);
    expect(mentionAt(t, at(far, "6"))?.label).toBe("6");
    // (seven words back: past reach)
    expect(mentionAt(t, at(far, "7"))).toBeNull();
  });

  it("is none in parentheses after a word that makes a number no compound's - a figure's, a scheme's, an equation's, an entry's, a step's, a time's - nor after one letter", () => {
    for (const w of ["Figure", "Fig", "Scheme", "eq", "Equation", "entry", "steps", "days", "h", "min", "years", "a"]) {
      const text = `see ${w} (5) here`;
      expect(mentionAt(line(text), at(text, "5)")), w).toBeNull();
    }
    const named = "see camphor (5) here";
    expect(mentionAt(line(named), at(named, "5)"))?.label).toBe("5");
  });

  it("is a number in parentheses after a naming word, as that word names it", () => {
    const text = "compound (12) was made";
    expect(mentionAt(line(text), at(text, "12"))?.label).toBe("12");
  });

  it("is none after a display item's word, set bold or not, singular or plural, past other numbers, joining words and an abbreviation's point", () => {
    const cases: [string, string][] = [
      ["Scheme 4 shows it", "4"],
      ["as in Schemes 2 and 3 here", "3"],
      ["as in Figures 1\u20133 here", "3"],
      ["see Fig. 3 here", "3"],
      ["see Figs. 2 and 5 here", "5"],
      ["as in Chart 2 here", "2"],
      ["see Charts 1, 2 and 6", "6"],
      ["see Table 2 here", "2"],
      ["see Tables 1 or 4 here", "4"],
      ["by Equation 7 here", "7"],
      ["by Equations 7 to 9 here", "9"],
      ["by eq 3 here", "3"],
      ["by eqs. 2 and 3 here", "3"],
    ];
    for (const [text, n] of cases) {
      // (the item's numbers all plain, as in the text, and all bold, as in a caption)
      for (const t of [line(text), line(text, [text])]) {
        expect(mentionAt(t, text.lastIndexOf(n)), text).toBeNull();
        // (every number asked for with the lens's own key: it is one)
        expect(mentionAt(t, text.lastIndexOf(n), true)?.label, text).toBe(n);
      }
    }
    // (and the one number bold, just after its word)
    for (const [text, n] of [cases[0], cases[3], cases[11]]) expect(mentionAt(line(text, [n]), text.lastIndexOf(n)), text).toBeNull();
  });

  it("is still a compound's number after a naming word, after a name, opening a sentence, or with its letter", () => {
    const cases: [string, string, string[]][] = [
      ["then compound 4 was made", "4", []],
      ["the alcohol 5 was made", "5", ["5"]],
      ["as in Table 2. 4 was then made", "4", ["4"]],
      ["4 was made from it", "4", ["4"]],
      ["as in Scheme 1, 4a was made", "4a", ["4a"]],
      ["see Schemes 2 and 3, and 7 then", "7", ["7"]],
      ["as in Scheme 1, compound 4 was made", "4", []],
    ];
    for (const [text, n, bold] of cases) expect(mentionAt(line(text, bold), text.lastIndexOf(n))?.label, text).toBe(n);
  });
});
