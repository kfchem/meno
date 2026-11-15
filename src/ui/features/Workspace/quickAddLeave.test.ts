import { describe, expect, it, vi } from "vitest";
import { askKeys } from "../../layouts/asking";
import { quickAddLeaves, typedIntoQuickAdd } from "./quickAddLeave";
import { afterAdded, chemistryLine, chemistryStep, readSmiles } from "./quickAddSmiles";
import { addOffered } from "./offerSteps";
import { NoPlugin } from "../../../lib/roles/worker";
import { firstSetUpSaid } from "../../../lib/plugins/firstSetUp";
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

  it("stays open where one question is asked in the tab in front and another waits in a tab behind", () => {
    const close = vi.fn();
    const leaves = quickAddLeaves((t) => t === inQuickAdd, close);
    const behind = askKeys((t) => t === inQuestion, () => {}, () => false);
    const here = askKeys((t) => t === inQuestion, () => {});
    try {
      leaves.outside(event("wheel", onPage));
      expect(close).not.toHaveBeenCalled();
    } finally {
      here.done();
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
    expect(first).toEqual({ error: "Needs a plugin: Structures from SMILES, and SMILES from structures.", needs: "smiles" });
    // (the offer's Add: got and set up, then done - Quick Add reads what was typed again: QuickAdd's RoleOffer `done`)
    let again: Awaited<ReturnType<typeof readSmiles>> | undefined;
    const entry = { id: "rdkit", name: "RDKit" } as CatalogueEntry;
    await addOffered(entry, async () => void (again = await readSmiles("CCO", onSmiles)), () => {}, async () => void (added = true));
    await vi.waitFor(() => expect(again).toBeNull());
    expect(onSmiles.mock.calls).toEqual([["CCO"], ["CCO"]]);
  });

  it("the plugin added, Quick Add reads what was typed again - or, nothing typed or a read under way, only lets the offer go", () => {
    const read = vi.fn();
    const letGo = vi.fn();
    afterAdded("  CCO ", false, read, letGo);
    expect(read.mock.calls).toEqual([["CCO"]]);
    expect(letGo).not.toHaveBeenCalled();
    afterAdded("CCO", true, read, letGo);
    afterAdded("  ", false, read, letGo);
    expect(read).toHaveBeenCalledTimes(1);
    expect(letGo).toHaveBeenCalledTimes(2);
  });
});

describe("a key typed in Quick Add with none of its icons chosen", () => {
  const key = (k: Partial<KeyboardEvent> & { key: string }) => ({ ctrlKey: false, metaKey: false, altKey: false, repeat: false, isComposing: false, keyCode: 0, target: null, ...k });
  it("goes to the SMILES field: its letter, a digit, a bracket - the field opening with it", () => {
    for (const k of ["C", "c", "1", "[", "=", "#"]) expect(typedIntoQuickAdd(key({ key: k }), false), k).toEqual({ seed: k });
  });
  it("from an input method, opens the field for it to compose in, its letter not taken", () => {
    expect(typedIntoQuickAdd(key({ key: "Process", keyCode: 229 }), false)).toEqual({ focus: true });
    // (each sign on its own: the key named "Process", and the key code 229 with a letter's key)
    expect(typedIntoQuickAdd(key({ key: "Process", keyCode: 0 }), false)).toEqual({ focus: true });
    expect(typedIntoQuickAdd(key({ key: "a", keyCode: 229 }), false)).toEqual({ focus: true });
    expect(typedIntoQuickAdd(key({ key: "k", isComposing: true }), false)).toEqual({ focus: true });
  });
  it("is left alone with a row or field open, a chord, a key held, a key that writes nothing, or one typed into a field", () => {
    expect(typedIntoQuickAdd(key({ key: "C" }), true)).toBeNull();
    for (const k of [{ key: "c", metaKey: true }, { key: "c", ctrlKey: true }, { key: "c", altKey: true }, { key: "c", repeat: true }, { key: "Escape" }, { key: "Enter" }, { key: "ArrowDown" }, { key: " " }]) {
      expect(typedIntoQuickAdd(key(k), false), JSON.stringify(k)).toBeNull();
    }
    expect(typedIntoQuickAdd(key({ key: "C", target: { tagName: "INPUT", isContentEditable: false } as unknown as EventTarget }), false)).toBeNull();
    expect(typedIntoQuickAdd(key({ key: "C", target: { tagName: "TEXTAREA", isContentEditable: false } as unknown as EventTarget }), false)).toBeNull();
    expect(typedIntoQuickAdd(key({ key: "C", target: { tagName: "DIV", isContentEditable: true } as unknown as EventTarget }), false)).toBeNull();
    // (a key on the page itself is taken)
    expect(typedIntoQuickAdd(key({ key: "C", target: { tagName: "DIV", isContentEditable: false } as unknown as EventTarget }), false)).toEqual({ seed: "C" });
  });
});

describe("where chemistry stands, one phrase for the workspace's chip and the line under the field", () => {
  it("is the set-up's step - its share rounded and held to 0 to 100 - or its start; none where it is ready, idle or failed", () => {
    const setting = { state: "setting-up" as const, plugin: "P", id: "p" };
    expect(chemistryStep(setting, 0.424)).toBe("Setting up chemistry: downloading P (42%)");
    expect(chemistryStep(setting, 0.426)).toBe("Setting up chemistry: downloading P (43%)");
    expect(chemistryStep(setting, 0)).toBe("Setting up chemistry: downloading P (0%)");
    expect(chemistryStep(setting, -0.2)).toBe("Setting up chemistry: downloading P (0%)");
    expect(chemistryStep(setting, undefined)).toBe("Setting up chemistry: setting up P's environment");
    expect(chemistryStep({ state: "starting", plugin: "P" }, undefined)).toBe("Starting P");
    expect(chemistryStep({ state: "ready", plugin: "P", version: "1" }, 0.5)).toBeNull();
    expect(chemistryStep({ state: "idle" }, undefined)).toBeNull();
    expect(chemistryStep({ state: "failed", message: "x" }, undefined)).toBeNull();
  });
});

describe("the line under the SMILES field", () => {
  it("says where chemistry stands while it is set up - the step, how far where reported, and that a SMILES waiting is drawn when it is ready - or started", () => {
    const setting = { state: "setting-up" as const, plugin: "P", id: "p" };
    // (the plugin's files coming, their share reported; its environment, which reports none)
    expect(chemistryLine(setting, 0.424, false)).toBe("Setting up chemistry: downloading P (42%).");
    expect(chemistryLine(setting, 0.426, false)).toBe("Setting up chemistry: downloading P (43%).");
    expect(chemistryLine(setting, 1.2, false)).toBe("Setting up chemistry: downloading P (100%).");
    expect(chemistryLine(setting, 0.424, true)).toBe("Setting up chemistry: downloading P (42%). This is drawn when it is ready.");
    expect(chemistryLine(setting, undefined, false)).toBe("Setting up chemistry: setting up P's environment.");
    expect(chemistryLine(setting, undefined, true)).toBe("Setting up chemistry: setting up P's environment. This is drawn when it is ready.");
    expect(chemistryLine({ state: "starting", plugin: "P" }, undefined, true)).toBe("Starting P. The first one takes a moment.");
    expect(chemistryLine({ state: "starting", plugin: "P" }, undefined, false)).toBe("Starting P. The first one takes a moment.");
  });
  it("says nothing where chemistry is ready, not yet asked for, or failed (said as before)", () => {
    expect(chemistryLine({ state: "ready", plugin: "P", version: "1" }, undefined, true)).toBeNull();
    expect(chemistryLine({ state: "idle" }, undefined, false)).toBeNull();
    expect(chemistryLine({ state: "failed", message: "x" }, undefined, true)).toBeNull();
  });
});

describe("one phrase for where chemistry's set-up stands", () => {
  it("the corner chip and the Quick Add line say the card's words, step for step", () => {
    const setting = { state: "setting-up" as const, plugin: "P", id: "p" };
    expect(`${chemistryStep(setting, 0.42)}.`).toBe(firstSetUpSaid("files", "P", 0.42));
    expect(`${chemistryStep(setting, undefined)}.`).toBe(firstSetUpSaid("environment", "P"));
  });
});
