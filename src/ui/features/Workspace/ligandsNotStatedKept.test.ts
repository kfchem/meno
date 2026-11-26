/**
 * A metal whose ligands are not stated (docs/EDITOR-2D.md, *Ligands not stated*) is kept through the .meno as its label, and read in the
 * state again as it opens; a step on structures drawn never sends one, and sets it aside saying why.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import { connectStoreToDocument, createEditorStore } from "./store";
import { createWorkspaceDocument } from "./document";
import { readWorkspace, workspaceText } from "./utils/workspace";
import type { Drawn, Model } from "./store/types";
import { notStatedIn } from "./chem/make3d";
import { NOT_STATED_CHECK_WHY, NOT_STATED_COMPOSITION_WHY, notStatedAside } from "./store/slices/stepRuns";

// Invented: a methyl on LnPd, Pd with an X drawn on it, and ethane.
const atom = (id: number, el: string, x = 0) => ({ id, x, y: 0, r: 0.9, el });
const onMethyl: Model = { atoms: [atom(1, "C"), atom(2, "LnPd", 1.5)], bonds: [{ id: 1, a: 1, b: 2, order: 1 }] } as Model;
const pdX: Model = { atoms: [atom(1, "Pd"), atom(2, "X", 1.5)], bonds: [{ id: 1, a: 1, b: 2, order: 1 }] } as Model;
const ethane: Model = { atoms: [atom(1, "C"), atom(2, "C", 1.5)], bonds: [{ id: 1, a: 1, b: 2, order: 1 }] } as Model;

describe("a metal whose ligands are not stated, kept and set aside", () => {
  it("opens from its .meno with its label as written, in the state again", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().pasteModel({ atoms: onMethyl.atoms, bonds: onMethyl.bonds } as Drawn);
    const text = workspaceText(store.getState());
    const otherDoc = createWorkspaceDocument();
    const other = createEditorStore(otherDoc);
    connectStoreToDocument(other, otherDoc);
    other.getState().openWorkspace(readWorkspace(text)!, true);
    const opened = other.getState().model;
    expect(opened.atoms.map((a) => a.el).sort()).toEqual(["C", "LnPd"]);
    expect(notStatedIn(opened).map((a) => a.el)).toEqual(["LnPd"]);
  });

  it("is never sent by a step on structures drawn: set aside, its why said, the rest asked in order", async () => {
    const asked: Model[][] = [];
    const ask = async (rest: Model[]) => {
      asked.push(rest);
      return rest.map(() => ({ as: "drawn" as const }));
    };
    const aside = { aside: NOT_STATED_CHECK_WHY, kind: "ligands not stated" };
    const said = await notStatedAside<{ as: "drawn" } | { aside: string; kind: string }>([onMethyl, ethane, pdX], ask, aside);
    expect(said).toEqual([aside, { as: "drawn" }, aside]);
    expect(asked).toEqual([[ethane]]);
    // (none left to ask: nothing asked)
    expect(await notStatedAside<{ as: "drawn" } | { aside: string; kind: string }>([pdX], ask, aside)).toEqual([aside]);
    expect(asked).toHaveLength(1);
    // (what the plugin says it could not answer, said)
    expect(await notStatedAside([ethane], async () => "answered for 0 of 1", aside)).toBe("answered for 0 of 1");
    expect(NOT_STATED_CHECK_WHY).toBe("not checked: its ligands are not stated");
    expect(NOT_STATED_COMPOSITION_WHY).toBe("no formula: its ligands are not stated");
  });
});
