import * as THREE from "three";
import { Suspense, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import type { Model, RecordSwap } from "../store/types";
import { layoutMolecule } from "../../../../lib/chem/layout2d";
import { layoutAtomOf, layoutBonds } from "../layoutOptions";
import { DrawnLayoutContext, useDrawnLayout } from "./drawnLayoutContext";
import { Bonds2D } from "./Bonds2D";
import JoinCaps2D from "./JoinCaps2D";
import Wedges2D from "./Wedges2D";
import Fills2D from "./Fills2D";
import { Texts2D } from "./Labels2D";
import { recordsOf, shownRecord, STACK_SWAP_MS } from "../utils/stacks";

/**
 * A stack going over from one record to the next (as long as
 * STACK_SWAP_MS): how much larger the one let go of grows as it fades, and
 * how much smaller the next starts as it comes into view - as a stack of
 * molecules in 3D goes over (Molecule3DView).
 */
const SWAP_NEAR = 0.35;
const SWAP_FAR = 0.3;
const easeInOutCubic = (u: number) => {
  const t = Math.min(Math.max(u, 0), 1);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};

/**
 * A record drawn here: the one its stack shows, ready and out of sight
 * (`rest`) - its labels set already, so that it goes at once when it is let
 * go of - or one coming into view, or going; and since when. Records
 * going out of sight as their stack is stacked again go as one, as they
 * stood (`as`), fading where they are (`still`).
 */
type Going = { stack: number; record: number; atoms: number[]; mode: "rest" | "in" | "out"; start: number; as?: Model; still?: true };

/**
 * Stacks of drawings going over from one record to the next (utils/stacks,
 * EditorState `recordSwaps`): the one let go of growing a little as it
 * fades, the next coming up from smaller into view - each drawn here, in
 * the drawing's style, apart from the drawing, which draws the next once it
 * is there. Gone through quickly, a stack draws the last two it let go of
 * as they go, no more; one let go of before it had all come into view goes
 * from as far as it had come.
 */
export default function StackSwap2D() {
  const swaps = useEditor((s) => s.recordSwaps);
  const full = useEditor((s) => s.fullModel);
  const shown = useEditor((s) => s.recordsShown);
  const going = useRef(new Map<string, Going>());
  const seen = useRef<Record<number, RecordSwap>>({});
  const now = performance.now();
  const list = going.current;
  const keyOf = (stack: number, record: number) => `${stack}-${record}`;
  // (gone, or there: done with)
  for (const [key, g] of list) {
    if (now - g.start < STACK_SWAP_MS) continue;
    if (g.mode === "out") list.delete(key);
    else if (g.mode === "in") list.set(key, { ...g, mode: "rest" });
  }
  // a stack going over: the one let go of going - from as far as it had come - and the next coming
  if (seen.current !== swaps) {
    const was = seen.current;
    seen.current = swaps;
    for (const [key, swap] of Object.entries(swaps)) {
      const stack = Number(key);
      if (was[stack] === swap) continue;
      const before = [...list.values()].find((g) => g.stack === stack && g.mode !== "out");
      if (before) {
        const came = before.mode === "in" ? Math.min(1, (now - before.start) / STACK_SWAP_MS) : 1;
        list.set(keyOf(stack, before.record), { ...before, mode: "out", start: now - (1 - came) * STACK_SWAP_MS });
      }
      const outs = [...list.entries()].filter(([, g]) => g.stack === stack && g.mode === "out");
      for (const [k] of outs.slice(0, -2)) list.delete(k);
      const record = full.atoms.find((a) => a.id === swap.to[0])?.stack?.record;
      if (record != null) list.set(keyOf(stack, record), { stack, record, atoms: swap.to, mode: "in", start: swap.start });
      // (stacked again: the others fading where they stood, all as one)
      if (swap.gone?.atoms.length) list.set(`${stack}-gone-${swap.start}`, { stack, record: -1, atoms: swap.from, mode: "out", start: swap.start, as: swap.gone, still: true });
    }
  }
  // each stack's record shown, ready to go; none for one no longer shown
  const showing = new Map<number, number>();
  for (const a of full.atoms) if (a.stack && !a.stack.spread && !showing.has(a.stack.id)) showing.set(a.stack.id, shownRecord(full, a.stack.id, shown) ?? a.stack.record);
  for (const [key, g] of list) if (g.mode === "rest" && showing.get(g.stack) !== g.record) list.delete(key);
  for (const [stack, record] of showing) {
    const key = keyOf(stack, record);
    const records = recordsOf(full, stack);
    const atoms = records.find((r) => r.record === record)?.atoms;
    const g = list.get(key);
    if (!atoms || records.length < 2) {
      if (g?.mode === "rest") list.delete(key);
    } else if (!g) list.set(key, { stack, record, atoms, mode: "rest", start: 0 });
    // (as it is now: drawn onto, it goes with what was drawn on it)
    else if (g.mode !== "out" && (g.atoms.length !== atoms.length || g.atoms.some((id, i) => id !== atoms[i]))) list.set(key, { ...g, atoms });
  }
  return (
    <>
      {[...list.entries()].map(([key, g]) => (
        <RecordGoing key={key} going={g} model={g.as ?? full} />
      ))}
    </>
  );
}

/** One record as it goes or comes, or ready to: drawn in a layout of its own, about its middle. */
function RecordGoing({ going, model }: { going: Going; model: Model }) {
  const { opts, laidAt } = useDrawnLayout();
  const invalidate = useThree((s) => s.invalidate);
  // (as it is - and once it goes, as it was as it began to go: what it is drawn from all the way)
  const kept = useRef<Model | null>(null);
  if (going.mode !== "out" || !kept.current) {
    const ids = new Set(going.atoms);
    const atoms = model.atoms.filter((a) => ids.has(a.id));
    const bonds = model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b));
    const was = kept.current;
    const same = <T,>(p: readonly T[], q: readonly T[]) => p.length === q.length && p.every((x, i) => x === q[i]);
    if (!was || !same(atoms, was.atoms) || !same(bonds, was.bonds)) kept.current = { atoms, bonds };
  }
  const part = kept.current!;
  const value = useMemo(() => {
    const drawn = part.atoms.map((a) => layoutAtomOf(a));
    const index = new Map(drawn.map((a, i) => [a.id, i]));
    const laid = layoutBonds(part.bonds, index);
    // (at the zoom the drawing is laid out at, as it is)
    return { atoms: drawn, bonds: laid, opts, layout: layoutMolecule(drawn, laid, opts, laidAt), laidAt };
  }, [part, opts, laidAt]);
  const middle = useMemo(() => {
    const xs = value.atoms.map((a) => a.x);
    const ys = value.atoms.map((a) => a.y);
    return xs.length ? { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 } : { x: 0, y: 0 };
  }, [value]);
  const outer = useRef<THREE.Group>(null!);
  const inner = useRef<THREE.Group>(null!);
  useFrame(() => {
    const t = going.mode === "rest" ? 1 : Math.min(1, (performance.now() - going.start) / STACK_SWAP_MS);
    const u = easeInOutCubic(t);
    const scale = going.still ? 1 : going.mode === "out" ? 1 + SWAP_NEAR * u : 1 - SWAP_FAR * (1 - u);
    const seenBy = going.mode === "rest" ? 0 : going.mode === "out" ? 1 - u : u;
    outer.current.position.set(middle.x, middle.y, going.mode === "out" ? 0.02 : 0.01);
    outer.current.scale.setScalar(scale);
    inner.current.position.set(-middle.x, -middle.y, 0);
    outer.current.visible = seenBy > 1e-3;
    if (!outer.current.visible) return;
    inner.current.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !Array.isArray(m)) {
        if (!m.transparent) {
          m.transparent = true;
          m.needsUpdate = true;
        }
        m.opacity = seenBy;
      }
      if ("fillOpacity" in o) {
        const text = o as unknown as { fillOpacity: number; outlineWidth?: number | string; outlineOpacity?: number };
        text.fillOpacity = seenBy;
        if (text.outlineWidth) text.outlineOpacity = seenBy;
      }
    });
    if (t < 1) invalidate();
  });
  return (
    <group ref={outer} visible={false}>
      <group ref={inner}>
        <DrawnLayoutContext.Provider value={value}>
          <Fills2D />
          <Bonds2D />
          <JoinCaps2D />
          <Wedges2D />
          <Suspense fallback={null}>
            <Texts2D texts={value.layout.texts} moved fade={false} />
          </Suspense>
        </DrawnLayoutContext.Provider>
      </group>
    </group>
  );
}
