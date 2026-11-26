import { describe, expect, it } from "vitest";
import { holdOutputsOf } from "../../../../lib/calc/asks";
import { readMenoFile } from "../../../../lib/doc/menoFile";
import { openedAs, textsOf } from "../../../views/openFile";
import { createWorkspaceDocument } from "../document";
import { recordText, readRecord } from "../utils/copyPaste";
import { sheetOfText } from "../utils/textSheets";
import { keptNamedIn, readKept, readWorkspace, workspaceFile } from "../utils/workspace";
import { connectStoreToDocument, createEditorStore } from "./index";
import type { Drawn } from "./types";

const WORDS = "# Aim\n\nTwo *alcohols* and a water.\n";

function page() {
  const held = createWorkspaceDocument();
  const store = createEditorStore(held);
  connectStoreToDocument(store, held);
  return store;
}

describe("a text is Markdown by what it was read as, not by its name", () => {
  it("is Markdown where the file it was opened from is, and not where that file is plain text", () => {
    expect(textsOf(openedAs("aim.md", WORDS))?.[0]).toMatchObject({ name: "aim.md", markdown: true });
    expect(textsOf(openedAs("aim.txt", WORDS))?.[0].markdown).toBeUndefined();
  });

  it("is shown formatted by its record's kind: one named without .md formatted, one named x.md without the kind its lines", () => {
    const store = page();
    store.getState().addTexts([
      { name: "Aim", text: WORDS, markdown: true, at: { x: 0, y: 0 } },
      { name: "x.md", text: WORDS, at: { x: 40, y: 0 } },
    ]);
    const [aim, x] = store.getState().texts;
    expect(aim).toMatchObject({ name: "Aim", markdown: true });
    expect(sheetOfText(aim).md).toBeDefined();
    expect(x.markdown).toBeUndefined();
    expect(sheetOfText(x).md).toBeUndefined();
  });

  it("keeps its kind through Save and Open of a .meno, and through a copy pasted", async () => {
    const store = page();
    store.getState().addTexts([
      { name: "Aim", text: WORDS, markdown: true, at: { x: 0, y: 0 } },
      { name: "plain", text: "just words", at: { x: 40, y: 0 } },
    ]);
    const { bytes } = await workspaceFile(store.getState());
    const file = readMenoFile(bytes, keptNamedIn);
    holdOutputsOf(file);
    const { ws } = await readKept(readWorkspace(file.workspace)!);
    const opened = page();
    opened.getState().openWorkspace(ws, true);
    expect(opened.getState().texts.map((t) => [t.name, t.markdown ?? false])).toEqual([
      ["Aim", true],
      ["plain", false],
    ]);
    // (copied as Meno's record, read back as a paste reads it)
    const sheets = opened.getState().texts.map(({ id: _id, ...t }) => t);
    const pasted = readRecord(recordText({ atoms: [], bonds: [], sheets } as unknown as Drawn));
    expect(pasted?.sheets?.map((t) => [t.name, t.markdown ?? false])).toEqual([
      ["Aim", true],
      ["plain", false],
    ]);
  });
});
