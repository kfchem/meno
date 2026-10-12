import { describe, expect, it } from "vitest";
import { applyEdit } from "./editing";
import { typedChanges, wordEnded, writtenAsMeant, type Change } from "./smartWords";

const written = (text: string, changes: Change[]) => changes.reduceRight((t, c) => applyEdit(t, c), text);

/** Words typed a letter at a time, each written as it is meant as it is typed - and, `kept`, as they are kept at their end. */
function typing(keys: string, kept = true): string {
  let text = "";
  for (const k of keys) {
    text += k;
    text = written(text, typedChanges(text, text.length - 1, text.length));
  }
  return kept ? written(text, wordEnded(text, text.length)) : text;
}

describe("words on the page typed as they are meant", () => {
  it("write a temperature typed as dc as °C, one space after its number", () => {
    expect(typing("60dc")).toBe("60 °C");
    expect(typing("60 dc, 12 h")).toBe("60 °C, 12 h");
    expect(typing("80DC)")).toBe("80 °C)");
    expect(typing("25.5dC")).toBe("25.5 °C");
    expect(typing("(60dc)")).toBe("(60 °C)");
    expect(typing("rt-60dc")).toBe("rt-60 °C");
    // (not until the word has ended: dc may yet go on)
    expect(typing("60dc", false)).toBe("60dc");
    expect(typing("60dcx")).toBe("60dcx");
    // (no number before it: a word of its own)
    for (const w of ["DCC", "DCM, rt", "1,2-DCE", "dCTP", "pdc ", "Bu3SnH, AIBN, DCE"]) expect(typing(w)).toBe(w);
  });

  it("begin a list's item with a bullet for a hyphen or a star typed at a line's start", () => {
    expect(typing("- first")).toBe("• first");
    expect(typing("* first")).toBe("• first");
    expect(typing("one\n\t- deeper")).toBe("one\n\t• deeper");
    // (not within a line, nor before a number)
    for (const w of ["a - b", "x -", "-5 mL", "--"]) expect(typing(w)).toBe(w.replace("-5", "−5"));
  });

  it("write a hyphen before a number at a word's start as a minus sign", () => {
    expect(typing("-78dc")).toBe("−78 °C");
    expect(typing("(-20 °C)")).toBe("(−20 °C)");
    expect(typing("THF, -78 to 0 °C")).toBe("THF, −78 to 0 °C");
    // (as soon as its digit is typed)
    expect(typing("-7", false)).toBe("−7");
    // (hyphens in words stay)
    for (const w of ["2-propanol", "N-methyl", "t-BuOK", "18-crown-6", "1,2-dichloroethane", "-OH"]) expect(typing(w)).toBe(w);
    // (a hyphen and a space at a line's start begin a list's item instead)
    expect(typing("- 5 mL")).toBe("• 5 mL");
  });

  it("write a range typed with a hyphen with an en dash, once its word has ended", () => {
    expect(typing("1-2 h")).toBe("1–2 h");
    expect(typing("0-25dc")).toBe("0–25 °C");
    expect(typing("-78-0dc")).toBe("−78–0 °C");
    expect(typing("0-25 dc")).toBe("0–25 °C");
    expect(typing("compounds 3-5")).toBe("compounds 3–5");
    expect(typing("10-20% EtOAc")).toBe("10–20% EtOAc");
    expect(typing("(1-2 equiv)")).toBe("(1–2 equiv)");
    expect(typing("pages 123-130.")).toBe("pages 123–130.");
    expect(typing("1.5-2.5 h")).toBe("1.5–2.5 h");
    // (not while the word may yet be a CAS number or a date)
    expect(typing("7647-0", false)).toBe("7647-0");
  });

  it("leave hyphens that join no range: CAS numbers, dates, a letter on either side", () => {
    for (const w of ["7647-01-0", "CAS 7647-01-0, HCl", "2026-10-10", "on 2026-10-10.", "4-Å MS", "Pd-118", "C1-C2", "K2CO3-1", "ZSM-5", "B3LYP-D3"]) expect(typing(w)).toBe(w);
  });

  it("change only what what was typed touches", () => {
    // (a hyphen before a number typed only now)
    expect(typedChanges("x -5", 3, 4)).toEqual([{ from: 2, to: 3, insert: "−" }]);
    expect(typedChanges("x -5", 2, 3)).toEqual([{ from: 2, to: 3, insert: "−" }]);
    // (one more digit, after a minus left as typed: nothing)
    expect(typedChanges("-55", 2, 3)).toEqual([]);
    // (several typed at once - an input method's - written as one)
    expect(written("-78-0dc, 2 h", typedChanges("-78-0dc, 2 h", 0, 12))).toBe("−78–0 °C, 2 h");
  });
});

describe("words written as meant, all at once", () => {
  const plain = (t: string) => writtenAsMeant(t, Array.from(t, () => 0)).text;
  it("writes a minus, ranges, and a temperature with one space before °C - the last word too - and begins no list", () => {
    expect(plain("-78°C to rt, 1-2 h")).toBe("\u221278 \u00b0C to rt, 1\u20132 h");
    expect(plain("\u201378 \u00b0 C")).toBe("\u221278 \u00b0C");
    expect(plain("60-80")).toBe("60\u201380");
    expect(plain("2-propanol, t-BuOK, 7647-01-0")).toBe("2-propanol, t-BuOK, 7647-01-0");
    expect(plain("- not a list")).toBe("- not a list");
  });

  it("keeps each letter's style with it, what is put in taking the style of what it replaced", () => {
    const r = writtenAsMeant("60\u00b0C", ["a", "b", "c", "d"]);
    expect(r.text).toBe("60 \u00b0C");
    expect(r.styles).toEqual(["a", "b", "c", "c", "c"]);
  });
});
