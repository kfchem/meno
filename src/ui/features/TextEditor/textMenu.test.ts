import { describe, expect, it } from "vitest";
import { readClipboard, writeClipboard } from "../../../lib/clipboard";
import { WordsEditor } from "../Workspace/utils/wordsEditor";
import { fieldTarget, runTextMenu, textMenuItems, type TextMenuTarget } from "./textMenu";

// (the maintainer, 2026-10-13: where the system's menu is kept shut - the
// column's text, words on the page - a right-click opens Meno's own: Cut,
// Copy, Paste, Select All, each enabled as it applies)
const enabled = (t: TextMenuTarget, clipboardText: boolean) =>
  Object.fromEntries(textMenuItems(t, clipboardText).map((i) => [i.kind, i.enabled]));

describe("the right-click menu on words", () => {
  const words = (text: string, from: number, to: number) => {
    const ed = new WordsEditor(text);
    ed.sel = { anchor: from, head: to };
    return { ed, t: fieldTarget(ed, () => null) };
  };

  it("enables Cut and Copy with words selected, Paste with text on the clipboard, Select All with any words", () => {
    expect(enabled(words("hello world", 11, 11).t, false)).toEqual({ cut: false, copy: false, paste: false, selectAll: true });
    expect(enabled(words("hello world", 6, 11).t, false)).toEqual({ cut: true, copy: true, paste: false, selectAll: true });
    expect(enabled(words("hello world", 11, 11).t, true)).toEqual({ cut: false, copy: false, paste: true, selectAll: true });
    expect(enabled(words("", 0, 0).t, true)).toEqual({ cut: false, copy: false, paste: true, selectAll: false });
  });

  it("enables only Copy and Select All on words that are only read - a Markdown text in the column", () => {
    const read: TextMenuTarget = { selected: () => "world", hasText: () => true, selectAll: () => {} };
    expect(enabled(read, true)).toEqual({ cut: false, copy: true, paste: false, selectAll: true });
  });

  it("names each with its key, as the canvas's menus do", () => {
    const t = words("a", 0, 1).t;
    expect(textMenuItems(t, true, true).map((i) => `${i.name} ${i.keys}`)).toEqual(["Cut ⌘X", "Copy ⌘C", "Paste ⌘V", "Select All ⌘A"]);
    expect(textMenuItems(t, true, false).map((i) => i.keys)).toEqual(["Ctrl+X", "Ctrl+C", "Ctrl+V", "Ctrl+A"]);
  });

  it("cuts, copies and pastes through the clipboard, and selects all, as the keys do", async () => {
    const { ed, t } = words("hello world", 6, 11);
    await runTextMenu("copy", t);
    expect((await readClipboard(["text"]))?.text).toBe("world");
    expect(ed.text).toBe("hello world");
    await runTextMenu("cut", t);
    expect(ed.text).toBe("hello ");
    expect((await readClipboard(["text"]))?.text).toBe("world");
    // (pasted where the caret is, its line ends made plain)
    await writeClipboard([{ flavor: "text", text: "big\r\nworld" }]);
    await runTextMenu("paste", t);
    expect(ed.text).toBe("hello big\nworld");
    await runTextMenu("selectAll", t);
    expect(ed.selectedText()).toBe("hello big\nworld");
  });

  it("is told after each, to show the caret and give the words the keys again", async () => {
    let told = 0;
    const ed = new WordsEditor("abc");
    ed.sel = { anchor: 0, head: 3 };
    await runTextMenu("copy", { ...fieldTarget(ed, () => null), after: () => told++ });
    await runTextMenu("selectAll", { ...fieldTarget(ed, () => null), after: () => told++ });
    expect(told).toBe(2);
  });
});
