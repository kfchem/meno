import { describe, expect, it } from "vitest";
import { CHECK_OPTIONS } from "../workflow/checkStructures";
import { howOf, KINDS } from "../workflow/kinds";
import { cardLines, listLines, SETTING_MOST, settingLines, WORDS_COL } from "./cardFace";
import { textWidth } from "./texts";

const DOT = " · ";
/** A step's setting on its card, as Workflow2D says it: what it does, and how - its options as they are. */
const settingOf = (name: string, how: string) => [name, how].filter(Boolean).join(DOT);
/** The parts a setting's line breaks between: its parts joined by dots, and inside each the items of a list it names. */
const pieces = (text: string) => text.split(DOT).flatMap((p) => p.split(", "));
/** Where `lines` break inside a piece of `text` (not after a dot or a list's comma): each such piece, and whether it is wider than a line by itself. */
function breaksInside(text: string, lines: string[]): { piece: string; wide: boolean }[] {
  expect(lines.join(" "), "the words are the setting's, nothing put in or left out").toBe(text);
  const out: { piece: string; wide: boolean }[] = [];
  let at = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    at += lines[i].length;
    const between = lines[i].endsWith(" ·") || lines[i].endsWith(",") || lines[i + 1].startsWith("· ");
    if (!between) {
      const before = text.slice(0, at);
      const piece = pieces(text)[pieces(before).length - 1];
      out.push({ piece, wide: textWidth(`${piece},`, 11) > WORDS_COL });
    }
    at += 1;
  }
  return out;
}

describe("a step's setting on its card", () => {
  it("is whole in the case seen, Check structures as it is first added: its list broken between its items, none cut", () => {
    const text = settingOf("Check structures", howOf(CHECK_OPTIONS, undefined));
    expect(text).toBe("Check structures · Set aside: more than one part, too many bonds, no electrons, radicals");
    const lines = settingLines(text, WORDS_COL);
    expect(lines.some((l) => l.includes("…"))).toBe(false);
    expect(breaksInside(text, lines).filter((b) => !b.wide)).toEqual([]);
    expect(lines.some((l) => l.includes("too many bonds"))).toBe(true);
    for (const l of lines) expect(textWidth(l, 11)).toBeLessThanOrEqual(WORDS_COL + 1e-6);
  });

  it("is whole for every kind of step as it is first added, broken only between its parts where each fits a line", () => {
    for (const k of KINDS) {
      const text = settingOf(k.name, howOf(k.options ?? [], undefined, k.how));
      const lines = settingLines(text, WORDS_COL);
      expect(lines.length, text).toBeLessThanOrEqual(SETTING_MOST);
      expect(lines.join(" "), text).toBe(text);
      expect(breaksInside(text, lines).filter((b) => !b.wide), text).toEqual([]);
    }
  });

  it("takes the card down a line for each line it takes", () => {
    const one = cardLines({ summary: "Optimise", state: { text: "Ready", tone: "quiet" } });
    const text = settingOf("Check structures", howOf(CHECK_OPTIONS, undefined));
    const more = cardLines({ summary: text, state: { text: "Ready", tone: "quiet" } });
    expect(more.summary).toEqual(settingLines(text, WORDS_COL));
    expect(more.words - one.words).toBe((more.summary.length - 1) * 16);
  });

  it("is cut only past its most lines, a text far longer than any option says", () => {
    const long = settingOf("Note", Array.from({ length: 40 }, (_, i) => `word${i}`).join(" "));
    const lines = settingLines(long, WORDS_COL);
    expect(lines).toHaveLength(SETTING_MOST);
    expect(lines[SETTING_MOST - 1].endsWith("…")).toBe(true);
  });
});

describe("a list's lines", () => {
  it("break after a comma, an item wider than a line by itself among its own words", () => {
    expect(listLines("a, b, c", 11, 1000)).toEqual(["a, b, c"]);
    const lines = listLines("one item, another item, a third", 11, textWidth("another item,", 11));
    expect(lines).toEqual(["one item,", "another item,", "a third"]);
    const wide = listLines("a very long item indeed that runs on, short", 11, textWidth("a very long item", 11));
    expect(wide.join(" ")).toBe("a very long item indeed that runs on, short");
    expect(wide.length).toBeGreaterThan(2);
  });
});
