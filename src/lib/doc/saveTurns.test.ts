import { describe, expect, it } from "vitest";
import { oneAtATime, turnsOf } from "./saveTurns";

/** Whatever is ready to go on, gone on. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * A tab's saves, each writing the workspace as it is when it begins, and
 * held at the disk until let go: what each wrote, in order, and the most
 * ever writing at once.
 */
function tab() {
  const turns = oneAtATime();
  const doc = { state: 1 };
  const written: string[] = [];
  const holds: { go: () => void; fail: () => void }[] = [];
  let open = 0;
  let most = 0;
  const write = (as: string) => async () => {
    const state = doc.state;
    open++;
    most = Math.max(most, open);
    try {
      await new Promise<void>((go, fail) => holds.push({ go, fail: () => fail(new Error("the disk is full")) }));
      written.push(`${as} ${state}`);
      return state;
    } finally {
      open--;
    }
  };
  return {
    doc,
    written,
    holds,
    most: () => most,
    save: () => turns("save", write("save")),
    saveAs: () => turns("saveAs", write("saveAs")),
  };
}

describe("one save at a time", () => {
  it("runs a save asked for while one writes once more, after it, with the workspace as it is then", async () => {
    const t = tab();
    const first = t.save();
    await settle();
    t.doc.state = 2;
    const second = t.save();
    t.doc.state = 3;
    await settle();
    // (the second waits: one writing at a time)
    expect(t.holds.length).toBe(1);
    t.holds[0].go();
    expect(await first).toBe(1);
    await settle();
    expect(t.holds.length).toBe(2);
    t.holds[1].go();
    // (the workspace as it was when the second began, not as it was asked for)
    expect(await second).toBe(3);
    expect(t.written).toEqual(["save 1", "save 3"]);
    expect(t.most()).toBe(1);
  });

  it("runs three asked for while one writes as one more", async () => {
    const t = tab();
    const first = t.save();
    await settle();
    const more = [t.save(), t.save(), t.save()];
    t.doc.state = 4;
    t.holds[0].go();
    await first;
    await settle();
    expect(t.holds.length).toBe(2);
    t.holds[1].go();
    expect(await Promise.all(more)).toEqual([4, 4, 4]);
    await settle();
    expect(t.holds.length).toBe(2);
    expect(t.written).toEqual(["save 1", "save 4"]);
    expect(t.most()).toBe(1);
  });

  it("goes on to the next after one that fails", async () => {
    const t = tab();
    const first = t.save();
    await settle();
    t.doc.state = 2;
    const second = t.save();
    t.holds[0].fail();
    await expect(first).rejects.toThrow("the disk is full");
    await settle();
    expect(t.holds.length).toBe(2);
    t.holds[1].go();
    expect(await second).toBe(2);
    expect(t.written).toEqual(["save 2"]);
  });

  it("runs Save As asked for during a save after it, and a save asked for during Save As after that", async () => {
    const t = tab();
    const first = t.save();
    await settle();
    const as = t.saveAs();
    await settle();
    expect(t.holds.length).toBe(1);
    t.holds[0].go();
    await first;
    await settle();
    const after = t.save();
    t.holds[1].go();
    await as;
    await settle();
    t.holds[2].go();
    await after;
    expect(t.written).toEqual(["save 1", "saveAs 1", "save 1"]);
    expect(t.most()).toBe(1);
  });

  it("begins at once where nothing is under way, and again after", async () => {
    const t = tab();
    const first = t.save();
    await settle();
    expect(t.holds.length).toBe(1);
    t.holds[0].go();
    await first;
    t.doc.state = 2;
    const again = t.save();
    await settle();
    expect(t.holds.length).toBe(2);
    t.holds[1].go();
    expect(await again).toBe(2);
    expect(t.written).toEqual(["save 1", "save 2"]);
  });

  it("keeps one tab's turns for it, apart from another's", async () => {
    const a = {};
    const b = {};
    expect(turnsOf(a)).toBe(turnsOf(a));
    expect(turnsOf(a)).not.toBe(turnsOf(b));
    // (a save of one tab under way holds up no other tab's)
    let release = () => {};
    const held = turnsOf(a)("save", () => new Promise<void>((go) => (release = go)));
    expect(await turnsOf(b)("save", async () => "b")).toBe("b");
    release();
    await held;
  });
});
