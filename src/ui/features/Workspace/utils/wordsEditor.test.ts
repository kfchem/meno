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

  it("set a comma's space as it writes a temperature: a step of its own to undo, the comma then left as typed", () => {
    const on = writing("");
    on.smart = () => true;
    const type = (keys: string) => {
      for (const k of keys) on.replaceSelection(k);
    };
    type("rt,12 ");
    expect(on.text).toBe("rt, 12 ");
    on.undo();
    expect(on.text).toBe("rt,12 ");
    // (left as typed: typing on, and keeping, leave it so)
    type("h");
    on.kept();
    expect(on.text).toBe("rt,12 h");
  });

  it("write a minus after a comma as its digit is typed, and the comma's space as the word ends - each a step of its own to undo", () => {
    const on = writing("");
    on.smart = () => true;
    for (const k of "LDA,-7") on.replaceSelection(k);
    expect(on.text).toBe("LDA,\u22127");
    for (const k of "8dc") on.replaceSelection(k);
    on.kept();
    expect(on.text).toBe("LDA, \u221278 \u00b0C");
    on.undo();
    expect(on.text).toBe("LDA,\u221278dc");
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

describe("letters set otherwise, and lists, as words are written", () => {
  it("set what is selected bold, and back; what is typed after it as the letter before", () => {
    const ed = writing("dG kcal");
    ed.sel = { anchor: 0, head: 2 };
    ed.toggle("bold");
    expect(ed.marks()).toEqual([{ from: 0, to: 2, bold: true }]);
    ed.sel = caretAt(2);
    ed.replaceSelection("‡");
    expect(ed.marks()).toEqual([{ from: 0, to: 3, bold: true }]);
    ed.sel = { anchor: 0, head: 3 };
    ed.toggle("bold");
    expect(ed.marks()).toEqual([]);
    // (each a step to undo)
    ed.undo();
    expect(ed.marks()).toEqual([{ from: 0, to: 3, bold: true }]);
  });

  it("type raised at the caret once asked, until the caret moves", () => {
    const ed = writing("mol");
    ed.replaceSelection(" ");
    ed.toggle("sup");
    ed.replaceSelection("−");
    ed.replaceSelection("1");
    expect(ed.text).toBe("mol −1");
    expect(ed.marks()).toEqual([{ from: 4, to: 6, script: "sup" }]);
  });

  it("keep their marks through what is written as it is meant", () => {
    const ed = writing("");
    ed.smart = () => true;
    ed.toggle("bold");
    for (const k of "-78") ed.replaceSelection(k);
    expect(ed.text).toBe("−78");
    expect(ed.marks()).toEqual([{ from: 0, to: 3, bold: true }]);
  });

  it("go on with a list's item on a new line, its number one on, and end it on an empty one", () => {
    const ed = writing("1. first");
    ed.newLine();
    expect(ed.text).toBe("1. first\n2. ");
    ed.replaceSelection("second");
    ed.newLine();
    ed.newLine();
    expect(ed.text).toBe("1. first\n2. second\n");
    const bullets = writing("\t• a");
    bullets.newLine();
    expect(bullets.text).toBe("\t• a\n\t• ");
    // (not on a plain line)
    const plain = writing("plain");
    plain.newLine();
    expect(plain.text).toBe("plain\n");
  });

  it("make lines a list, and plain again; take items in and out a level", () => {
    const ed = writing("one\ntwo");
    ed.sel = { anchor: 0, head: 7 };
    ed.toggleList();
    expect(ed.text).toBe("• one\n• two");
    expect(ed.indent(1)).toBe(true);
    expect(ed.text).toBe("\t• one\n\t• two");
    ed.indent(-1);
    expect(ed.text).toBe("• one\n• two");
    ed.sel = { anchor: 0, head: ed.text.length };
    ed.toggleList();
    expect(ed.text).toBe("one\ntwo");
    expect(writing("plain").indent(1)).toBe(false);
  });
});
