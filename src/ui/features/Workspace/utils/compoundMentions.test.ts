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
});
