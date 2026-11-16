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
  doc.edit("place", (d) => ({ ...d, steps: d.steps!.map((s) => (s.id === r ? { ...s, x: 100, y: 0, frame: { w: 3000, h: 2000 } } : s.id === f ? { ...s, x: 600, y: 600 } : s)) }));
  st().updateStep(r, { options });
  st().updateStep(f, { options: { conditions: "pass < 3" } });
  const exit = (step: number, id: string) => st().sets.find((b) => b.made?.step === step && b.made.exit === id)!.id;
  st().connect({ set: input }, r, "in");
  st().connect({ set: exit(r, "out") }, f);
  st().connect({ set: exit(f, "out") }, r, "again");
  st().connect({ set: exit(f, "rest") }, r, "done");
  return { st, r, f, exit };
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

describe("a Repeat made", () => {
  it("round a step (Repeat these steps): its frame round it, and the wires that crossed its edge routed through it, in one undo step", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const input = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
    const f = st().addStep("filter", "meno", 400, 300);
    const t = st().addStep("tag", "meno", 900, 300);
    const exit = (step: number, id: string) => st().sets.find((b) => b.made?.step === step && b.made.exit === id)!.id;
    st().connect({ set: input }, f);
    st().connect({ set: exit(f, "out") }, t);
    const r = st().repeatSteps([f])!;
    const step = st().steps.find((s) => s.id === r)!;
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

  it("is offered in Quick Add's Meno row, put down alone - never from a wire, which a step takes", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const flow = { ...doc.getState() } as never;
    const meno = (g: ReturnType<typeof offeredSteps>) => g.find((x) => x.by === "meno")?.steps.map((x) => x.kind) ?? [];
    expect(meno(offeredSteps(flow))).toContain("repeat");
  });
});

