/**
 * What a step still needs of its options before it can run, in its card's words (doers `optionsNeed`): what opens its
 * card as it is put down, its field focused - never a program found nowhere (`missingFor`), which no option gives.
 */
import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { notReadyFor, optionsNeed } from "./doers";

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
