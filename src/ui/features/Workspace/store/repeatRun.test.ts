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
  return { st, r, f, exit, doc, input, store };
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

  it("says the pass under way on its tab as it runs - pass 1 of 3, 2, 3 - and none once it has ended", async () => {
    const { st, r, store } = page({ repeat: "times", times: 3 });
    const seen: string[] = [];
    const off = store.subscribe((now) => {
      const p = now.repeatPasses[r];
      const said = p ? `${p.pass}${p.of ? ` of ${p.of}` : ""}${p.stopping ? " stopping" : ""}` : "";
      if (said && seen[seen.length - 1] !== said) seen.push(said);
    });
    await st().runStep(r);
    off();
    expect(seen).toEqual(["1 of 3", "2 of 3", "3 of 3"]);
    expect(st().repeatPasses[r]).toBeUndefined();
  });

  it("stopped as a pass begins: says it is stopping at once, makes no pass after it, and says how many it made", async () => {
    const { st, r, store } = page({ repeat: "times", times: 3 });
    const seen: string[] = [];
    let pressed = false;
    const off = store.subscribe((now) => {
      const p = now.repeatPasses[r];
      if (!p) return;
      seen.push(`${p.pass}${p.stopping ? " stopping" : ""}`);
      if (p.pass === 2 && !pressed) {
        pressed = true;
        queueMicrotask(() => st().stopStep(r));
      }
    });
    await st().runStep(r);
    off();
    expect(seen).toContain("2 stopping");
    expect(seen.some((x) => x.startsWith("3"))).toBe(false);
    expect(st().steps.find((s) => s.id === r)!.ran).toMatchObject({ said: expect.stringMatching(/^Stopped after 2 passes/) });
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

describe("a Repeat run with the page round it (found in review)", () => {
  /** The labels of the document's edits from here on: each step's run is one "run". */
  const counting = (doc: unknown) => {
    const labels: string[] = [];
    const d = doc as { edit: (label: string, fn: unknown, ...rest: unknown[]) => unknown };
    const orig = d.edit.bind(d);
    d.edit = (label: string, fn: unknown, ...rest: unknown[]) => {
      labels.push(label);
      return orig(label, fn, ...rest);
    };
    return labels;
  };

  it("Run all runs a step inside once per pass, none after the passes: the Repeat runs it", async () => {
    const { st, doc } = page({ repeat: "until", most: 10 });
    const labels = counting(doc);
    await st().runAll();
    expect(labels.filter((l) => l === "run")).toHaveLength(3);
  });

  it("shows what leaves by Out as it came into In: a water turned there, turned the same in Out", async () => {
    const { st, r, exit } = page({ repeat: "until", most: 10 });
    const [first] = st().molecules3d.map((m) => m.id);
    const faceOn: [number, number, number, number] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
    st().setTurn3d(first, faceOn);
    await st().runStep(r);
    const out = setMolecules(st(), st().sets.find((b) => b.id === exit(r, "reached"))!);
    expect(out.map((m) => st().turns3d[m.id])).toContainEqual(faceOn);
  });

  it("puts each entry in Out once where its values run out at the top of a pass", async () => {
    const { st, r, doc, exit } = page({ repeat: "over", variable: "k", values: "1\n2\n3", counted: "entry", startsOver: "last" });
    // (each water come in having gone round once already - as another Repeat's Out has them)
    doc.edit("count", (d) => ({ ...d, molecules3d: d.molecules3d!.map((m) => ({ ...m, properties: [{ [TIMES_ROUND]: { value: 1, unit: "none", status: "computed", label: true } }] })) }));
    await st().runStep(r);
    expect(setMolecules(st(), st().sets.find((b) => b.id === exit(r, "reached"))!)).toHaveLength(2);
    expect(st().steps.find((s) => s.id === r)!.ran?.said).not.toContain("4 still going round");
  });

  it("moved, takes the sets of the steps it holds with them: still inside its frame", async () => {
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
    const f = st().addStep("filter", "meno", 400, 0);
    st().updateStep(f, { options: { conditions: "number ≥ 1", match: "all" } });
    st().connect({ set: input }, f);
    await st().runStep(f);
    st().repeatSteps([f]);
    const r = st().steps.find((s) => s.kind === "repeat")!;
    const box = () => {
      const now = st().steps.find((s) => s.id === r.id)!;
      return repeatBox({ x: now.x, y: now.y, frame: now.frame! });
    };
    const inside = () => st().sets.filter((b) => b.made?.step === f && !unseenSets(st() as never).has(b.id)).map((b) => b.x0 >= box().x0 && b.x1 <= box().x1 && b.y0 >= box().y0 && b.y1 <= box().y1);
    expect(inside().every(Boolean)).toBe(true);
    st().moveStep(r.id, r.x + 1500, r.y - 400);
    expect(inside().every(Boolean)).toBe(true);
    expect(inside().length).toBeGreaterThan(0);
  });

  it("says where a step inside failed, and ends there: never as run well", async () => {
    const { st, r, f } = page({ repeat: "until", most: 4 });
    st().updateStep(f, { options: { conditions: "this is no condition (((" } });
    await st().runStep(r);
    expect(st().steps.find((s) => s.id === f)!.ran?.ok).toBe(false);
    expect(st().steps.find((s) => s.id === r)!.ran).toMatchObject({ ok: false, said: expect.stringMatching(/^Filter failed in pass 1: /) });
    expect(st().repeatPasses[r]).toBeUndefined();
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

