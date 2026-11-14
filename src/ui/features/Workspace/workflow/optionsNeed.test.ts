/**
 * What a step still needs of its options before it can run, in its card's words (doers `optionsNeed`): what opens its
 * card as it is put down, its field focused - never a program found nowhere (`missingFor`), which no option gives.
 */
import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { notReadyFor, optionsNeed, stepRole } from "./doers";
import { useAppSettings } from "../../../../lib/settings/appSettings";

const putDown = (kind: Parameters<ReturnType<ReturnType<typeof createEditorStore>["getState"]>["addStep"]>[0], by = "meno") => {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const id = store.getState().addStep(kind, by, 0, 0);
  return store.getState().steps.find((s) => s.id === id)!;
};

describe("what a step put down still needs of its options", () => {
  it("is an Energy window's window, until given - the card's own words", () => {
    const step = putDown("energy-window");
    expect(optionsNeed(step)).toBe("Give the window, in kcal/mol");
    expect(notReadyFor(step)).toBe(optionsNeed(step));
    expect(optionsNeed({ ...step, options: { ...step.options, window: 3 } })).toBeUndefined();
  });

  it("is nothing for a step whose options all hold a value", () => {
    expect(optionsNeed(putDown("duplicates"))).toBeUndefined();
  });
});

describe("a step put down from Quick Add", () => {
  const editor = () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    return store.getState;
  };
  it("that still needs a value of its options has its card opened at once; one that needs none, not", () => {
    const st = editor();
    const asks = st().putDownStep("energy-window", "meno", 0, 0);
    expect(st().openStep).toBe(asks);
    const other = editor();
    other().putDownStep("duplicates", "meno", 0, 0);
    expect(other().openStep).toBeNull();
    // (put down otherwise - a paste, a procedure: nothing opened)
    const pasted = editor();
    pasted().addStep("energy-window", "meno", 0, 0);
    expect(pasted().openStep).toBeNull();
  });
});

describe("a step whose window Settings keeps", () => {
  it("put down otherwise than from Quick Add - a template's, with no options of its own - is ready, needing nothing", () => {
    useAppSettings.setState((s) => ({ ...s, options: { [stepRole("energy-window", "meno")]: { window: 2.5 } } }));
    try {
      const bare = { kind: "energy-window" as const, by: "meno", options: undefined };
      expect(optionsNeed(bare)).toBeUndefined();
      expect(notReadyFor(bare)).toBeUndefined();
      // (and put down from Quick Add, its card is not opened: it asks for nothing)
      const doc = createWorkspaceDocument();
      const store = createEditorStore(doc);
      connectStoreToDocument(store, doc);
      store.getState().putDownStep("energy-window", "meno", 0, 0);
      expect(store.getState().openStep).toBeNull();
    } finally {
      useAppSettings.setState((s) => ({ ...s, options: {} }));
    }
  });

  it("with no window anywhere - none of its own, none in Settings - needs one", () => {
    expect(optionsNeed({ kind: "energy-window", by: "meno", options: undefined })).toBe("Give the window, in kcal/mol");
  });
});
