import * as THREE from "three";
import { Suspense, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import type { Model, RecordSwap } from "../store/types";
import { layoutAtomOf, layoutBonds } from "../layoutOptions";
import { DrawnLayoutContext, useDrawnLayout } from "./drawnLayoutContext";
import { Bonds2D } from "./Bonds2D";
import JoinCaps2D from "./JoinCaps2D";
import Wedges2D from "./Wedges2D";
import Fills2D from "./Fills2D";
import { Texts2D } from "./Labels2D";
import { recordsOf, shownRecord, STACK_SWAP_MS } from "../utils/stacks";
import { layoutByStructure, structureLayouts } from "../../../../lib/chem/layoutStructures";
import { fitOnto, fitted, matchedAtoms, morphAt, unfitted, type Fit, type MatchDrawing } from "../../../../lib/layout/morph";

/** Steps through a stack come closer together than this, and a record goes over by fading alone: none moves while the next is already asked for. */
const HELD_MS = 120;
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
type Going = { stack: number; record: number; atoms: number[]; mode: "rest" | "in" | "out"; start: number; as?: Model; still?: true; morph?: Morph };

/**
 * A record becoming the next, atom for atom (lib/layout/morph): when it began; the fit of the next's atoms onto where the
 * one let go of stood, by what the two share; for each atom of the next, by id, where it begins - where its match in the
 * one let go of stood, or, outside what they share, where the fit puts it - and its match's id; and each atom of the one
 * let go of outside what they share, by id, where it stood. Both records are drawn on these places as they go, the one let
 * go of fading and the next coming - what they do not share riding with what they do, turned as one with it.
 */
type Morph = { start: number; fit: Fit; was: Map<number, { x: number; y: number }>; from: Map<number, number>; gone: Map<number, { x: number; y: number }> };

/** Where each atom of a record going over stands at `now`: by id - the next's atoms on their ways, and the one let go of on its matches' ways, or on its own. */
function morphPlaces(m: Morph, model: Model, role: "in" | "out", now: number): Map<number, { x: number; y: number }> {
  const u = easeInOutCubic((now - m.start) / STACK_SWAP_MS);
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  const out = new Map<number, { x: number; y: number }>();
  for (const [id, was] of m.was) {
    const a = at.get(id);
    if (!a) continue;
    if (role === "in") out.set(id, morphAt(m.fit, was, a, u));
    else if (m.from.has(id)) out.set(m.from.get(id)!, morphAt(m.fit, was, a, u));
  }
  // (of the one let go of, what the next does not share: turned with what it does, from where it stood)
  if (role === "out") for (const [id, was] of m.gone) out.set(id, morphAt(m.fit, was, unfitted(m.fit, was), u));
  return out;
}

/**
 * How the record let go of becomes the next (`to`, its atoms by id), where they share a core - the same structure atom for
 * atom, or analogues: from where the one let go of stands now (`from`, its atoms' places by id - on their way still, where
 * it was coming), each atom of the next matched to the one it is, where it has one. None where they share too little.
 */
function morphOf(model: Model, from: Map<number, { x: number; y: number }>, to: readonly number[], start: number): Morph | undefined {
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  const drawing = (ids: readonly number[], place: (id: number) => { x: number; y: number }): MatchDrawing => {
    const index = new Map(ids.map((id, k) => [id, k]));
    return {
      atoms: ids.map((id) => ({ el: at.get(id)!.el, ...(at.get(id)!.charge ? { charge: at.get(id)!.charge } : {}), ...place(id) })),
      bonds: model.bonds.flatMap((b) => (index.has(b.a) && index.has(b.b) ? [{ a: index.get(b.a)!, b: index.get(b.b)!, order: b.order }] : [])),
    };
  };
  const was = [...from.keys()].filter((id) => at.has(id));
  const now = to.filter((id) => at.has(id));
  const match = matchedAtoms(drawing(was, (id) => from.get(id)!), drawing(now, (id) => at.get(id)!));
  if (!match) return undefined;
  const pairs = now.flatMap((id, i) => (match[i] >= 0 ? [[id, was[match[i]]] as const] : []));
  const fit = fitOnto(
    pairs.map(([id]) => at.get(id)!),
    pairs.map(([, w]) => from.get(w)!),
  );
  const shared = new Set(pairs.map(([, w]) => w));
  return {
    start,
    fit,
    was: new Map(now.map((id, i) => [id, match[i] >= 0 ? from.get(was[match[i]])! : fitted(fit, at.get(id)!)])),
    from: new Map(pairs),
    gone: new Map(was.filter((w) => !shared.has(w)).map((w) => [w, from.get(w)!])),
  };
}

/**
 * Stacks of drawings going over from one record to the next (utils/stacks,
 * EditorState `recordSwaps`): atom for atom where the two share a core
 * (`morphOf`), else the one let go of fading where it stands as
 * the next comes in where it will stand, neither growing nor shrinking -
 * each drawn here, in the drawing's style, apart from the drawing, which
 * draws the next once it is there. Gone through quickly, a stack draws the last two it let go of
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
      const record = full.atoms.find((a) => a.id === swap.to[0])?.stack?.record;
      // (the one let go of becoming the next, atom for atom, where they share a core - from where it stands now, on
      //  its way still where it was coming; not where steps come faster than one can be followed)
      const held = before?.mode === "in" && now - before.start < HELD_MS;
      const from = before && (before.morph && before.mode === "in" ? morphPlaces(before.morph, full, "in", now) : new Map(before.atoms.flatMap((id) => {
        const a = full.atoms.find((x) => x.id === id);
        return a ? [[id, { x: a.x, y: a.y }] as const] : [];
      })));
      const morph = before && from && record != null && !held && !swap.gone?.atoms.length ? morphOf(full, from, swap.to, swap.start) : undefined;
      if (before) {
        const came = before.mode === "in" ? Math.min(1, (now - before.start) / STACK_SWAP_MS) : 1;
        // (going over atom for atom, it fades as the next comes, from where it stands: else from as far as it had come)
        list.set(keyOf(stack, before.record), morph ? { ...before, mode: "out", start: swap.start, morph, still: true } : { ...before, mode: "out", start: now - (1 - came) * STACK_SWAP_MS, still: true, morph: undefined });
      }
      const outs = [...list.entries()].filter(([, g]) => g.stack === stack && g.mode === "out");
      for (const [k] of outs.slice(0, -2)) list.delete(k);
      if (record != null) list.set(keyOf(stack, record), { stack, record, atoms: swap.to, mode: "in", start: swap.start, ...(morph ? { morph } : {}) });
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
  // (going over atom for atom: drawn again each frame, its atoms where their ways have come)
  const [, frame] = useState(0);
  const moving = going.morph && going.mode !== "rest" ? morphPlaces(going.morph, model, going.mode === "out" ? "out" : "in", performance.now()) : null;
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
  const kept2 = kept.current!;
  const part = useMemo(() => (moving ? { atoms: kept2.atoms.map((a) => (moving.has(a.id) ? { ...a, ...moving.get(a.id)! } : a)), bonds: kept2.bonds } : kept2), [kept2, moving]);
  const value = useMemo(() => {
    const drawn = part.atoms.map((a) => layoutAtomOf(a));
    const index = new Map(drawn.map((a, i) => [a.id, i]));
    const laid = layoutBonds(part.bonds, index);
    // (at the zoom the drawing is laid out at, as it is)
    return { atoms: drawn, bonds: laid, opts, layout: layoutByStructure(drawn, laid, opts, laidAt, structureLayouts()), laidAt };
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
    // (never larger or smaller: where it stands, fading - and, going over atom for atom, moving)
    const scale = 1;
    // (going over atom for atom: the next comes in over the first half while the one let go of stays, which goes over the
    //  second - so what the two share stays as it is all the way, never fading through half of each)
    const half = (v: number) => Math.min(1, Math.max(0, v));
    const seenBy = going.mode === "rest" ? 0 : going.morph ? (going.mode === "out" ? 1 - half(2 * u - 1) : half(2 * u)) : going.mode === "out" ? 1 - u : u;
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
    if (t < 1) {
      invalidate();
      if (going.morph) frame((k) => k + 1);
    }
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
