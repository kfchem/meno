/**
 * A step's results seen as what they came from (docs/WORKFLOWS.md, *Results*; workflow/run `viewKept`): a water a Filter passes through,
 * its atoms where they were, is turned as the water it came from - face-on in the Input, face-on in the Filter's set - and one the step
 * moved or made is seen as it is first seen.
 */
import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { addMolecule3d, createWorkspaceDocument } from "../document";
import { setMolecules } from "../workflow/entries";
import type { Turn3D } from "./types";
import { style3dOf } from "../style3dOf";
import { reachOverFrames } from "../utils/molecule3d";
import { viewKept } from "../workflow/run";
import type { SetEntry } from "../workflow/entries";

/** Two waters in a set, wired into a Filter that keeps both; the first turned to be seen face-on. */
function page() {
  const doc = createWorkspaceDocument();
  for (const x of [0, 4])
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
  const input = st().addSet({ x0: -3, y0: -3, x1: 7, y1: 3 });
  const f = st().addStep("filter", "meno", 400, 0);
  st().updateStep(f, { options: { conditions: "number ≥ 1", match: "all" } });
  st().connect({ set: input }, f);
  return { st, f };
}

describe("a step's results, seen as what they came from", () => {
  it("turns a water a Filter passed through as the water it came from; one never turned stays as it is first seen (found in the GUI check)", async () => {
    const { st, f } = page();
    const [first] = st().molecules3d.map((m) => m.id);
    const faceOn: Turn3D = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
    st().setTurn3d(first, faceOn);
    await st().runStep(f);
    const out = setMolecules(st(), st().sets.find((b) => b.made?.step === f && b.made.exit === "out")!);
    expect(out).toHaveLength(2);
    expect(out.map((m) => st().turns3d[m.id])).toEqual([faceOn, undefined]);
  });
});

type Box = { x0: number; x1: number; y0: number; y1: number };
const overlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** A chain of seven atoms along x, thin (some 11 A long on the page, 1 A tall). */
const chain = (x: number) => ({
  atoms: Array.from({ length: 7 }, (_, i) => ({ el: "C", x: x + 1.5 * i, y: (i % 2) * 0.3, z: 0 })),
  bonds: Array.from({ length: 6 }, (_, i) => ({ a1: i, a2: i + 1, order: 1 })),
});
const water = (at: number) => ({
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0, y: 0.76, z: 0.59 },
    { el: "H", x: 0, y: -0.76, z: 0.59 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  at: { x: at, y: 0 },
});

function pageOf(molecules: Parameters<typeof addMolecule3d>[1][], frame: { x0: number; y0: number; x1: number; y1: number }) {
  const doc = createWorkspaceDocument();
  for (const m of molecules) doc.edit("add", (d) => addMolecule3d(d, m));
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const input = st().addSet(frame);
  const f = st().addStep("filter", "meno", 500, 0);
  st().updateStep(f, { options: { conditions: "number ≥ 1", match: "all" } });
  st().connect({ set: input }, f);
  return { st, f };
}

describe("a step's results seen as what they came from: room and copies (found in review)", () => {
  it("leaves each molecule room as it is turned: none over another, none out of the set's frame", async () => {
    const { st, f } = pageOf([0, 14, 28].map((x) => ({ ...chain(x), at: { x: x + 4, y: 0 } })), { x0: -3, y0: -6, x1: 40, y1: 6 });
    const ids = st().molecules3d.map((m) => m.id);
    const standing: Turn3D = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    st().setTurn3d(ids[0], standing);
    st().setTurn3d(ids[1], standing);
    await st().runStep(f);
    const set = st().sets.find((b) => b.made?.step === f && b.made.exit === "out")!;
    const out = setMolecules(st(), set);
    expect(out).toHaveLength(3);
    const seen: Box[] = out.map((m) => {
      const e = reachOverFrames({ ...m, id: 0, at: { x: 0, y: 0 } } as never, style3dOf(st()), st().turns3d[m.id]);
      return { x0: m.at.x + e.x0, x1: m.at.x + e.x1, y0: m.at.y + e.y0, y1: m.at.y + e.y1 };
    });
    const hits: string[] = [];
    for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) if (overlap(seen[i], seen[j])) hits.push(`${i} x ${j}`);
    expect(hits).toEqual([]);
    const outside = seen.map((b, i) => (b.x0 < set.x0 || b.x1 > set.x1 || b.y0 < set.y0 || b.y1 > set.y1 ? i : -1)).filter((i) => i >= 0);
    expect(outside).toEqual([]);
  });

  it("leaves room as they are turned in the set a step puts aside too: a Filter's rest", async () => {
    const { st, f } = pageOf([0, 14, 28].map((x) => ({ ...chain(x), at: { x: x + 4, y: 0 } })), { x0: -3, y0: -6, x1: 40, y1: 6 });
    st().updateStep(f, { options: { conditions: "number > 99", match: "all" } });
    const ids = st().molecules3d.map((m) => m.id);
    const standing: Turn3D = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    st().setTurn3d(ids[0], standing);
    st().setTurn3d(ids[1], standing);
    await st().runStep(f);
    const set = st().sets.find((b) => b.made?.step === f && b.made.exit === "rest")!;
    const rest = setMolecules(st(), set);
    expect(rest).toHaveLength(3);
    expect(rest.map((m) => st().turns3d[m.id])).toEqual([standing, standing, undefined]);
    const seen: Box[] = rest.map((m) => {
      const e = reachOverFrames({ ...m, id: 0, at: { x: 0, y: 0 } } as never, style3dOf(st()), st().turns3d[m.id]);
      return { x0: m.at.x + e.x0, x1: m.at.x + e.x1, y0: m.at.y + e.y0, y1: m.at.y + e.y1 };
    });
    const hits: string[] = [];
    for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) if (overlap(seen[i], seen[j])) hits.push(`${i} x ${j}`);
    expect(hits).toEqual([]);
    expect(seen.map((b, i) => (b.x0 < set.x0 || b.x1 > set.x1 || b.y0 < set.y0 || b.y1 > set.y1 ? i : -1)).filter((i) => i >= 0)).toEqual([]);
  });

  it("turns what Duplicates keeps and what it puts aside as each came, run in turns as it is", async () => {
    const { st } = pageOf([water(0), water(5)], { x0: -3, y0: -3, x1: 8, y1: 3 });
    const d = st().addStep("duplicates", "meno", 500, -400);
    st().connect({ set: st().sets.find((b) => !b.made)!.id }, d);
    const [a, b] = st().molecules3d.map((m) => m.id);
    const A: Turn3D = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
    const B: Turn3D = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
    st().setTurn3d(a, A);
    st().setTurn3d(b, B);
    await st().runStep(d);
    const of = (exit: string) => setMolecules(st(), st().sets.find((x) => x.made?.step === d && x.made.exit === exit)!).map((m) => st().turns3d[m.id]);
    expect([...of("out"), ...of("rest")].sort()).toEqual([A, B].sort());
  });

  it("turns each of two identical copies as the copy it came from, not both as the first", async () => {
    const { st, f } = pageOf([water(0), water(5)], { x0: -3, y0: -3, x1: 8, y1: 3 });
    const [a, b] = st().molecules3d.map((m) => m.id);
    const A: Turn3D = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
    const B: Turn3D = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
    st().setTurn3d(a, A);
    st().setTurn3d(b, B);
    await st().runStep(f);
    const out = setMolecules(st(), st().sets.find((s) => s.made?.step === f && s.made.exit === "out")!);
    expect(out.map((m) => st().turns3d[m.id])).toEqual([A, B]);
  });
});

describe("which entry a result is seen as (viewKept)", () => {
  const turn: Turn3D = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
  const entry = (els: string[], xyz: number[]): SetEntry => ({ atoms: els.map((el) => ({ el })), xyz, from: 7 }) as unknown as SetEntry;
  const molecule = (els: string[], xyz: number[], frames?: number[][]) => ({ atoms: els.map((el, i) => ({ el, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] })), ...(frames ? { frames } : {}) }) as never;
  const turnOf = () => turn;

  it("takes none that a step moved, nor one of other elements or another count of atoms", () => {
    const e = entry(["O", "H"], [0, 0, 0, 0, 0.96, 0]);
    expect(viewKept([molecule(["O", "H"], [0, 0, 0, 0, 0.96, 0])], [e], turnOf)).toEqual([turn]);
    expect(viewKept([molecule(["O", "H"], [0, 0, 0, 0, 0.97, 0])], [e], turnOf)).toEqual([undefined]);
    expect(viewKept([molecule(["S", "H"], [0, 0, 0, 0, 0.96, 0])], [e], turnOf)).toEqual([undefined]);
    expect(viewKept([molecule(["O"], [0, 0, 0])], [e], turnOf)).toEqual([undefined]);
    // (a step that added an atom - an H on the end - its first atoms where they were: none)
    expect(viewKept([molecule(["O", "H", "H"], [0, 0, 0, 0, 0.96, 0, 0.9, -0.3, 0])], [e], turnOf)).toEqual([undefined]);
  });

  it("asks a molecule of several frames by its last", () => {
    const e = entry(["O", "H"], [0, 0, 0, 0, 0.96, 0]);
    expect(viewKept([molecule(["O", "H"], [9, 9, 9, 9, 9, 9], [[9, 9, 9, 9, 9, 9], [0, 0, 0, 0, 0.96, 0]])], [e], turnOf)).toEqual([turn]);
  });
});
