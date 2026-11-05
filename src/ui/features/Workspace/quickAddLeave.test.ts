import { describe, expect, it, vi } from "vitest";
import { askKeys } from "../../layouts/asking";
import { quickAddLeaves } from "./quickAddLeave";
import { readSmiles } from "./quickAddSmiles";
import { addOffered } from "./offerSteps";
import { NoPlugin } from "../../../lib/roles/worker";
import type { CatalogueEntry } from "../../../lib/plugins/catalogue";

/** An event as the window hands it on: its type, where it came from, and whether it was stopped. */
const event = (type: string, target: object, key?: string) => ({ type, target, key, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as Event & KeyboardEvent;

const inQuickAdd = {};
const inQuestion = {};
const onPage = {};

describe("what closes Quick Add", () => {
  it("a turn of the wheel or Escape from outside it, with no question asked; nothing inside it", () => {
    const close = vi.fn();
    const leaves = quickAddLeaves((t) => t === inQuickAdd, close);
    leaves.outside(event("pointerdown", inQuickAdd));
    expect(close).not.toHaveBeenCalled();
    leaves.outside(event("wheel", onPage));
    leaves.key(event("keydown", onPage, "Escape"));
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("not a press in a question asked over the window - 'Allow and download' answered with the first click, Quick Add left open with what was typed", () => {
    const close = vi.fn();
    const leaves = quickAddLeaves((t) => t === inQuickAdd, close);
    const question = askKeys((t) => t === inQuestion, () => {});
    try {
      const press = event("pointerdown", inQuestion);
      leaves.outside(press);
      // (nor swallowed: the question's button hears the press, and its click)
      expect(press.stopPropagation).not.toHaveBeenCalled();
      expect(press.preventDefault).not.toHaveBeenCalled();
      // (its backdrop, its scrolled list of sources, and Escape, the question's "Not now", the same)
      leaves.outside(event("pointerdown", onPage));
      leaves.outside(event("wheel", inQuestion));
      leaves.key(event("keydown", inQuestion, "Escape"));
      expect(close).not.toHaveBeenCalled();
    } finally {
      question.done();
    }
    // (answered: a press elsewhere closes it again)
    leaves.outside(event("wheel", onPage));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes as before where the question waits in a tab behind", () => {
    const close = vi.fn();
    const leaves = quickAddLeaves((t) => t === inQuickAdd, close);
    const behind = askKeys((t) => t === inQuestion, () => {}, () => false);
    try {
      leaves.outside(event("wheel", onPage));
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      behind.done();
    }
  });
});

describe("a SMILES typed in Quick Add that no plugin here reads", () => {
  it("is drawn once the plugin offered for it is added - not typed again", async () => {
    let added = false;
    const onSmiles = vi.fn(async () => {
      if (!added) throw new NoPlugin("smiles");
    });
    const first = await readSmiles("CCO", onSmiles);
    expect(first).toEqual({ error: "Needs a plugin: SMILES to a structure, and back.", needs: "smiles" });
    // (the offer's Add: got and set up, then done - Quick Add reads what was typed again: QuickAdd's RoleOffer `done`)
    let again: Awaited<ReturnType<typeof readSmiles>> | undefined;
    const entry = { id: "rdkit", name: "RDKit" } as CatalogueEntry;
    await addOffered(entry, async () => void (again = await readSmiles("CCO", onSmiles)), () => {}, async () => void (added = true));
    await vi.waitFor(() => expect(again).toBeNull());
    expect(onSmiles.mock.calls).toEqual([["CCO"], ["CCO"]]);
  });
});
