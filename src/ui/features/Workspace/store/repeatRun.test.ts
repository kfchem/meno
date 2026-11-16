/**
 * A Repeat run pass by pass (docs/WORKFLOWS.md, *Repeat*; store `runRepeat`): two waters into a Repeat holding a Filter that keeps
 * what is in a pass before the third - kept to Again, the rest to Done. Until none goes again it makes three passes and both reach Done;
 * twice, both are still going round as the passes run out and leave by Out, marked so.
 */
import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { addMolecule3d, createWorkspaceDocument } from "../document";
import { setMolecules } from "../workflow/entries";
import { PASS, RAN_OUT, TIMES_ROUND } from "../workflow/repeatRun";
import { offeredSteps } from "../workflow/offered";
import { inputKey } from "../workflow/flow";
import { repeatBox } from "../workflow/repeat";
import { cardHighOf } from "../workflow/kinds";
import { CARD_W, GAP } from "../workflow/look";
import { unseenSets } from "../workflow/onPage";

/** The page: two waters in a set, wired into a Repeat whose frame holds a Filter (pass < 3): its kept to Again, its rest to Done. */
function page(options: Record<string, string | number>) {
  const doc = createWorkspaceDocument();
  for (const x of [0, 2])
    doc.edit("water", (d) =>
      addMolecule3d(d, {
        atoms: [
          { el: "O", x, y: 0, z: 0 },
          { el: "H", x, y: 0.76, z: 0.59 },
          { el: "H", x, y: -0.76, z: 0.59 },
        ],
        bonds: [
          { a1: 0, a2: 1, order: 1 },
          { a1: 0, a2: 2, order: 1 },
        ],
        at: { x: x - 1, y: 0 },
      }),
    );
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const input = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
  const r = st().addStep("repeat", "meno", 100, 0);
  const f = st().addStep("filter", "meno", 400, 300);
  // (the Repeat's frame round the Filter, and each card where it is meant to be: the Filter's middle inside the frame)
  doc.edit("place", (d) => ({ ...d, steps: d.steps!.map((s) => (s.id === r ? { ...s, x: 100, y: 0, frame: { w: 3000, h: 2000 } } : s.id === f ? { ...s, x: 600, y: -600 } : s)) }));
  st().updateStep(r, { options });
  st().updateStep(f, { options: { conditions: "pass < 3" } });
  const exit = (step: number, id: string) => st().sets.find((b) => b.made?.step === step && b.made.exit === id)!.id;
  st().connect({ set: input }, r, "in");
  st().connect({ set: exit(r, "out") }, f);
  st().connect({ set: exit(f, "out") }, r, "again");
  st().connect({ set: exit(f, "rest") }, r, "done");
  return { st, r, f, exit, doc, input };
}

const props = (m: { properties?: Record<string, { value: unknown }>[] }, name: string) => m.properties?.[0]?.[name]?.value;

describe("a Repeat run pass by pass", () => {
  it("holds the steps inside its frame, its wires all made", () => {
    const { st, r, f } = page({});
    expect(st().steps.find((s) => s.id === r)!.holds).toEqual([f]);
    expect(st().wires).toHaveLength(4);
  });

  it("until none goes again: three passes, both waters reaching Done in the third, said", async () => {
    const { st, r, exit } = page({ repeat: "until", most: 10 });
    await st().runStep(r);
    const ran = st().steps.find((s) => s.id === r)!.ran!;
    expect(ran).toMatchObject({ ok: true, said: "3 passes · 2 done" });
    // (its pass under way said on its tab while it ran: gone once it has ended)
    expect(st().repeatPasses[r]).toBeUndefined();
    const out = setMolecules(st(), st().sets.find((b) => b.id === exit(r, "reached"))!);
    expect(out.map((m) => [props(m, PASS), props(m, TIMES_ROUND), props(m, RAN_OUT) ?? null])).toEqual([
      [3, 2, null],
      [3, 2, null],
    ]);
  });

  it("reads as run, not changed, once it has run: what its passes fill on Again and Done is not what it ran on (found in the GUI check)", async () => {
    const { st, r } = page({ repeat: "until", most: 10 });
    await st().runStep(r);
    const step = st().steps.find((s) => s.id === r)!;
    expect(step.ran?.input).toBe(inputKey(st() as never, step, "meno"));
  });

  it("twice: both still going round as the passes run out, out by Out, marked so - and said", async () => {
    const { st, r, exit } = page({ repeat: "times", times: 2 });
    await st().runStep(r);
    expect(st().steps.find((s) => s.id === r)!.ran).toMatchObject({ ok: true, said: "2 passes · 0 done · 2 still going round, out by Out" });
    const out = setMolecules(st(), st().sets.find((b) => b.id === exit(r, "reached"))!);
    expect(out.map((m) => [props(m, PASS), props(m, RAN_OUT)])).toEqual([
      [2, "yes"],
      [2, "yes"],
    ]);
  });

  it("with its cap reached until none goes again: the cap's passes, the rest out by Out, marked", async () => {
    const { st, r } = page({ repeat: "until", most: 2 });
    await st().runStep(r);
    expect(st().steps.find((s) => s.id === r)!.ran).toMatchObject({ said: "2 passes · 0 done · 2 still going round, out by Out" });
  });

  it("refuses to run with nothing wired to Again until none goes again, saying so", async () => {
    const { st, r } = page({ repeat: "until" });
    const w = st().wires.find((x) => x.to.step === r && x.to.port === "again")!;
    st().removeWire(w.id);
    expect(st().wires.some((x) => x.id === w.id)).toBe(false);
    await st().runStep(r);
    expect(st().steps.find((s) => s.id === r)!.ran).toMatchObject({ ok: false, said: "Nothing is wired to Again: wire what is to go round once more, or repeat a number of times" });
  });
});

describe("a Repeat whose frame a wire crosses", () => {
  it("refuses to run where a card was dragged into its frame with a wire from outside on it, saying why (found in review)", async () => {
    const { st, r, doc, input } = page({ repeat: "times", times: 2 });
    const t = st().addStep("tag", "meno", 4000, 300);
    st().connect({ set: input }, t);
    // (dragged in: its middle inside the frame now, its wire from the set outside still on it)
    doc.edit("drag", (d) => ({ ...d, steps: d.steps!.map((s) => (s.id === t ? { ...s, x: 1500, y: -600 } : s)) }));
    expect(st().steps.find((s) => s.id === r)!.holds).toContain(t);
    await st().runStep(r);
    expect(st().steps.find((s) => s.id === r)!.ran).toMatchObject({ ok: false, said: expect.stringMatching(/^A wire crosses its frame's edge, a card moved in or out with its wires on: This step is inside a Repeat/) });
  });
});

describe("a Repeat made", () => {
  it("round a step (Repeat these steps): its frame round it, and the wires that crossed its edge routed through it, in one undo step", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    // (what comes in, a card's width and a little to the left of the step - as Quick Add lays a set before its step)
    const input = st().addSet({ x0: 400 - CARD_W - 100, y0: 300 - 120, x1: 400 - 100, y1: 300 });
    const f = st().addStep("filter", "meno", 400, 300);
    const t = st().addStep("tag", "meno", 900, 300);
    const exit = (step: number, id: string) => st().sets.find((b) => b.made?.step === step && b.made.exit === id)!.id;
    st().connect({ set: input }, f);
    st().connect({ set: exit(f, "out") }, t);
    const r = st().repeatSteps([f]) as number;
    const step = st().steps.find((s) => s.id === r)!;
    // (its card at its frame's top left, above the step it holds, inside it; the frame clear of what comes in, to its left - the
    //  page's y runs up, found in the GUI check)
    const box = repeatBox({ x: step.x, y: step.y, frame: step.frame! });
    const held = st().steps.find((s) => s.id === f)!;
    expect(held.y).toBeLessThan(step.y - cardHighOf("repeat"));
    expect([held.x >= box.x0, held.x + CARD_W <= box.x1, held.y - cardHighOf("filter") > box.y0]).toEqual([true, true, true]);
    expect(box.x0).toBeGreaterThan(st().sets.find((b) => b.id === input)!.x1);
    // (the sets the step it holds gives, inside the frame; its own Out wholly outside it, to its right)
    const shown = st().sets.filter((x) => x.made?.step === f && !unseenSets(st() as never).has(x.id));
    for (const b of shown) expect([b.x0 >= box.x0, b.x1 <= box.x1, b.y0 >= box.y0, b.y1 <= box.y1]).toEqual([true, true, true, true]);
    // (no deeper than what it holds on the page and a gap or two: a set held off the page takes no room)
    expect(box.y0).toBeGreaterThan(Math.min(held.y - cardHighOf("filter"), ...shown.map((b) => b.y0)) - 3 * GAP);
    expect(st().sets.find((b) => b.made?.step === r && b.made.exit === "reached")!.x0).toBeGreaterThan(box.x1);
    expect(step.kind).toBe("repeat");
    expect(step.holds).toEqual([f]);
    const ends = st().wires.map((w) => [st().sets.find((b) => b.id === w.from.set)?.made ?? "input", w.to.step, w.to.port]);
    expect(ends).toEqual(
      expect.arrayContaining([
        ["input", r, "in"],
        [{ step: r, exit: "out" }, f, "in"],
        [{ step: f, exit: "out" }, r, "done"],
        [{ step: r, exit: "reached" }, t, "in"],
      ]),
    );
    expect(st().wires).toHaveLength(4);
    // (undone at once, as it was made: the Repeat gone, the wires as they were)
    expect(doc.undo()).toBe(true);
    expect(st().steps.some((s) => s.id === r)).toBe(false);
    expect(st().wires).toHaveLength(2);
  });

  it("round a step whose second exit's set is held off the page, empty: its frame not drawn down round that set (found in the GUI check)", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const input = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
    const f = st().addStep("filter", "meno", 400, 300);
    st().connect({ set: input }, f);
    const rest = st().sets.find((b) => b.made?.step === f && b.made.exit === "rest")!;
    expect(unseenSets(st() as never).has(rest.id)).toBe(true);
    const r = st().repeatSteps([f]) as number;
    const step = st().steps.find((s) => s.id === r)!;
    const box = repeatBox({ x: step.x, y: step.y, frame: step.frame! });
    // (its foot two gaps below the lowest of the step's card and the sets of it drawn on the page)
    const card = st().steps.find((s) => s.id === f)!;
    const shown = st().sets.filter((b) => b.made?.step === f && !unseenSets(st() as never).has(b.id));
    expect(box.y0).toBeCloseTo(Math.min(card.y - cardHighOf("filter"), ...shown.map((b) => b.y0)) - 2 * GAP);
  });

  it("round steps that structures drawn come into: refused, saying why, and nothing changed - never made with the wire lost (found in the GUI check)", () => {
    const doc = createWorkspaceDocument();
    doc.edit("draw", (d) => ({ ...d, model: { atoms: [{ id: 1, el: "C", x: 0, y: 0 }, { id: 2, el: "O", x: 1.3, y: 0 }], bonds: [{ id: 3, a: 1, b: 2, order: 1 }] } as never, nextId: 10 }));
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const input = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
    const f = st().addStep("filter", "meno", 400, 300);
    st().connect({ set: input }, f);
    const before = doc.getState();
    expect(st().repeatSteps([f])).toEqual({ why: expect.stringMatching(/^What comes into these steps cannot go into a Repeat: /) });
    expect(doc.getState()).toBe(before);
  });

  it("is offered in Quick Add's Meno row, put down alone - never from a wire, which a step takes", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const flow = { ...doc.getState() } as never;
    const meno = (g: ReturnType<typeof offeredSteps>) => g.find((x) => x.by === "meno")?.steps.map((x) => x.kind) ?? [];
    expect(meno(offeredSteps(flow))).toContain("repeat");
  });
});

