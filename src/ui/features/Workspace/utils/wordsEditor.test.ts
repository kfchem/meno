import { describe, expect, it } from "vitest";
import { captionPlaces } from "../../../../lib/chem/captions";
import { caretAt } from "../../../../lib/text/editing";
import { WordsEditor } from "./wordsEditor";

/** Words being written, laid as the drawing lays them - about (0, 0), a label's size 1, a page's unit 10 pixels. */
function writing(text: string) {
  const ed = new WordsEditor(text);
  const lay = () => {
    const places = captionPlaces(ed.text, 0, 0, 1);
    ed.layout = { places, shown: places, toScreen: (p) => ({ x: 100 + p.x * 10, y: 100 - p.y * 10 }), linePx: 12.5, font: "10px Arial", measure: (t) => t.length * 5 };
  };
  ed.onChange = lay;
  lay();
  return ed;
}

describe("words written in place", () => {
  it("are written on from their end, and undone a run of typing at a time - the words as they were", () => {
    const ed = writing("K2CO3");
    expect(ed.sel).toEqual(caretAt(5));
    ed.replaceSelection(",");
    ed.replaceSelection(" DMF");
    expect(ed.text).toBe("K2CO3, DMF");
    ed.undo();
    expect(ed.text).toBe("K2CO3");
    ed.redo();
    expect(ed.text).toBe("K2CO3, DMF");
    // (a line begun: a step of its own)
    ed.replaceSelection("\n60 °C");
    ed.undo();
    expect(ed.text).toBe("K2CO3, DMF");
  });

  it("move up and down by their lines as they are set, and to a set line's ends", () => {
    const ed = writing("Pd2(dba)3\nK2CO3");
    ed.command({ kind: "move", unit: "line", dir: -1, extend: false }, true);
    expect(ed.lines.at(ed.sel.head)).toBe(0);
    ed.command({ kind: "move", unit: "lineEdge", dir: -1, extend: false }, true);
    expect(ed.sel.head).toBe(0);
    ed.command({ kind: "move", unit: "lineEdge", dir: 1, extend: true }, true);
    expect(ed.sel).toEqual({ anchor: 0, head: 9 });
    // (past the last line: the end)
    ed.command({ kind: "move", unit: "line", dir: 1, extend: false }, true);
    ed.command({ kind: "move", unit: "line", dir: 1, extend: false }, true);
    expect(ed.sel.head).toBe(ed.text.length);
  });

  it("take a click: the caret at the place nearest it, two clicks a word", () => {
    const ed = writing("60 °C, 12 h");
    const p = ed.layout!.places;
    const q = { x: p.at[7].x + 0.01, y: p.lines[0].y };
    ed.pressAt(q, 1, false);
    expect(ed.sel).toEqual(caretAt(7));
    ed.pressAt(q, 2, false);
    expect(ed.sel).toEqual({ anchor: 7, head: 9 });
  });

  it("lay the field with its caret on the drawn one, in their type at the size they are seen", () => {
    const ed = writing("a\nbc");
    const ta = { style: {} as Record<string, string> } as unknown as HTMLTextAreaElement;
    ed.layField(ta, 0, ed.text.length);
    const b = ed.boxAt(ed.sel.head);
    // (two letters before the caret on its line, each 5 pixels wide: its line's start 10 pixels before it, a line down)
    expect(parseFloat(ta.style.left)).toBeCloseTo(b.x - 10);
    expect(parseFloat(ta.style.top)).toBeCloseTo(b.top - 12.5);
    expect(ta.style.font).toBe("10px Arial");
  });

  it("write what is typed as it is meant, where said to: a step of its own to undo, the part then left as typed", () => {
    const ed = writing("");
    const type = (keys: string) => {
      for (const k of keys) ed.replaceSelection(k);
    };
    // (not unless said)
    type("-78dc ");
    expect(ed.text).toBe("-78dc ");
    const on = writing("");
    on.smart = () => true;
    const typeOn = (keys: string) => {
      for (const k of keys) on.replaceSelection(k);
    };
    typeOn("60dc ");
    expect(on.text).toBe("60 °C ");
    expect(on.sel).toEqual(caretAt(6));
    on.undo();
    expect(on.text).toBe("60dc ");
    expect(on.sel).toEqual(caretAt(5));
    // (left as typed: the same word ended again)
    on.command({ kind: "delete", unit: "letter", dir: -1 }, true);
    typeOn(")");
    expect(on.text).toBe("60dc)");
    on.kept();
    expect(on.text).toBe("60dc)");
    // (written again: as it is meant)
    on.command({ kind: "delete", unit: "letter", dir: -1 }, true);
    on.command({ kind: "delete", unit: "letter", dir: -1 }, true);
    typeOn("c)");
    expect(on.text).toBe("60 °C)");
    on.undo();
    on.redo();
    expect(on.text).toBe("60 °C)");
    // (undone a run of typing further: the words as they were)
    on.undo();
    on.undo();
    expect(on.text).toBe("60d");
  });

  it("leave what is pasted as it is, and write the word last typed as it is meant as they are kept", () => {
    const ed = writing("");
    ed.smart = () => true;
    ed.replaceSelection("-78dc, 1-2 h", true);
    expect(ed.text).toBe("-78dc, 1-2 h");
    ed.kept();
    expect(ed.text).toBe("-78dc, 1-2 h");
    ed.replaceSelection(", 0-25dc");
    expect(ed.text).toBe("-78dc, 1-2 h, 0-25dc");
    ed.kept();
    expect(ed.text).toBe("-78dc, 1-2 h, 0–25 °C");
    // (a minus as soon as its digit is typed; a digit typed after one left as typed, nothing)
    const m = writing("x ");
    m.smart = () => true;
    m.replaceSelection("-");
    m.replaceSelection("7");
    expect(m.text).toBe("x −7");
    m.undo();
    m.replaceSelection("8");
    expect(m.text).toBe("x -78");
  });
});
