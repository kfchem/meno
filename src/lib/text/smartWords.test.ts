import { describe, expect, it } from "vitest";
import { applyEdit } from "./editing";
import { typedChanges, wordEnded, type Change } from "./smartWords";

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

  it("write a hyphen before a number at a word's start as a minus sign", () => {
    expect(typing("-78dc")).toBe("−78 °C");
    expect(typing("(-20 °C)")).toBe("(−20 °C)");
    expect(typing("THF, -78 to 0 °C")).toBe("THF, −78 to 0 °C");
    // (as soon as its digit is typed)
    expect(typing("-7", false)).toBe("−7");
    // (hyphens in words stay)
    for (const w of ["2-propanol", "N-methyl", "t-BuOK", "18-crown-6", "1,2-dichloroethane", "- 5 mL", "-OH"]) expect(typing(w)).toBe(w);
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
