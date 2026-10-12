import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import Frames3D from "./Frames3D";
import { useEditor, useEditorStore } from "../store";
import type { Model } from "../store/types";
import { drawnBox } from "../../../../utils/importers";
import { recordsOf, shownRecord } from "../utils/stacks";
import { follow } from "../../../theme/motion";

/** How gently a chip follows the foot of the record its stack shows, as one record gives way to the next, in seconds (as StackChip3D's does). */
const CHIP_TAU = 0.12;

/** Each stack of drawings' chip (utils/stacks), just below the record it shows. */
export default function StackChips2D() {
  const model = useEditor((s) => s.model);
  const full = useEditor((s) => s.fullModel);
  const shown = useEditor((s) => s.recordsShown);
  const stacks = useMemo(() => {
    const ids = new Set<number>();
    for (const a of full.atoms) if (a.stack && !a.stack.spread) ids.add(a.stack.id);
    return [...ids].flatMap((stack) => {
      const records = recordsOf(full, stack);
      const record = shownRecord(full, stack, shown);
      const index = records.findIndex((r) => r.record === record);
      if (records.length < 2 || index < 0) return [];
      return [{ stack, records: records.map((r) => r.record), index, title: records[index].title, atoms: new Set(records[index].atoms) }];
    });
  }, [full, shown]);
  return (
    <>
      {stacks.map((s) => (
        <StackChip2D key={s.stack} model={model} {...s} />
      ))}
    </>
  );
}

/**
 * A stack of drawings' chip, just below the record it shows: which of how
 * many, and the record's title (*3 / 60  aspirin*) - and, the record
 * hovered or selected, a slider through them, as a stack of molecules'
 * chip has. The stack's own, not its records': it stays as they go over
 * one to the next, a drag along its slider going on through them.
 */
function StackChip2D({ model, stack, records, index, title, atoms }: { model: Model; stack: number; records: number[]; index: number; title?: string; atoms: ReadonlySet<number> }) {
  const store = useEditorStore();
  const { gl, invalidate } = useThree();
  const open = useEditor((s) => {
    const { atomId, bondId } = s.hovered;
    if (atomId != null && atoms.has(atomId)) return true;
    if (bondId != null && s.model.bonds.some((b) => b.id === bondId && atoms.has(b.a))) return true;
    for (const id of atoms) if (s.sel.atoms.has(id)) return true;
    return false;
  });
  // (where the record it shows reaches as it is drawn: its labels and all)
  const foot = useMemo(() => {
    const box = drawnBox({ atoms: model.atoms.filter((a) => atoms.has(a.id)), bonds: model.bonds.filter((b) => atoms.has(b.a) && atoms.has(b.b)) });
    return { x: (box.minX + box.maxX) / 2, y: box.minY };
  }, [model, atoms]);
  const group = useRef<THREE.Group>(null!);
  const at = useRef<{ x: number; y: number } | null>(null);
  useFrame((_, dt) => {
    const k = Math.min(dt, 1 / 20);
    const was = at.current;
    at.current = was ? { x: follow(was.x, foot.x, k, CHIP_TAU), y: follow(was.y, foot.y, k, CHIP_TAU) } : { ...foot };
    if (Math.abs(at.current.x - foot.x) > 1e-3 || Math.abs(at.current.y - foot.y) > 1e-3) invalidate();
    group.current.position.set(at.current.x, at.current.y, 0);
  });
  return (
    <group ref={group}>
      <Frames3D count={records.length} frame={index} open={open} onFrame={(k) => store.getState().showRecord(stack, records[k])} area={gl.domElement} title={title} />
    </group>
  );
}
