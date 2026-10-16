import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { magnifiedOfAtom, structuresOf } from "../../../../lib/chem/magnified2d";
import { drawnBox } from "../../../../utils/importers";
import { follow } from "../../../theme/motion";
import { useEditor, useEditorStore } from "../store";
import type { Model } from "../store/types";
import MagnifiedMark from "./MagnifiedMark";
import PageHtml from "./PageHtml";

const MARK_TAU = 0.12;

/**
 * The marks of the structures in 2D shown magnified (docs/WORKSPACE.md,
 * *Magnified display*): how large each is shown - "150 %" - at its top
 * right, while it is hovered or selected, or its mark is in use.
 */
export default function MagnifiedMarks2D() {
  const model = useEditor((s) => s.model);
  const shown = useMemo(
    () =>
      structuresOf(model.atoms, model.bonds).flatMap((group) => {
        const k = magnifiedOfAtom(model.atoms[group[0]]);
        return k === 1 ? [] : [{ k, atoms: new Set(group.map((i) => model.atoms[i].id)) }];
      }),
    [model],
  );
  return (
    <>
      {shown.map((s) => (
        <MagnifiedMark2D key={[...s.atoms][0]} model={model} k={s.k} atoms={s.atoms} />
      ))}
    </>
  );
}

function MagnifiedMark2D({ model, k, atoms }: { model: Model; k: number; atoms: ReadonlySet<number> }) {
  const store = useEditorStore();
  const { invalidate } = useThree();
  const [active, setActive] = useState(false);
  const near = useEditor((s) => {
    const { atomId, bondId } = s.hovered;
    if (atomId != null && atoms.has(atomId)) return true;
    if (bondId != null && s.model.bonds.some((b) => b.id === bondId && atoms.has(b.a))) return true;
    for (const id of atoms) if (s.sel.atoms.has(id)) return true;
    return false;
  });
  // (its top right as it is drawn, its labels and all)
  const corner = useMemo(() => {
    const box = drawnBox({ atoms: model.atoms.filter((a) => atoms.has(a.id)), bonds: model.bonds.filter((b) => atoms.has(b.a) && atoms.has(b.b)) });
    return { x: box.maxX, y: box.maxY };
  }, [model, atoms]);
  const group = useRef<THREE.Group>(null!);
  const at = useRef<{ x: number; y: number } | null>(null);
  useFrame((_, dt) => {
    const step = Math.min(dt, 1 / 20);
    const was = at.current;
    at.current = was ? { x: follow(was.x, corner.x, step, MARK_TAU), y: follow(was.y, corner.y, step, MARK_TAU) } : { ...corner };
    if (Math.abs(at.current.x - corner.x) > 1e-3 || Math.abs(at.current.y - corner.y) > 1e-3) invalidate();
    group.current.position.set(at.current.x, at.current.y, 0);
  });
  const on = near || active;
  return (
    <group ref={group}>
      <PageHtml zIndexRange={[35, 25]}>
        <div className="transition-opacity duration-150" style={{ transform: "translate(4px, -100%)", opacity: on ? 1 : 0, pointerEvents: on ? "auto" : "none" }}>
          <MagnifiedMark k={k} onActive={setActive} onSet={(to, gesture) => store.getState().setMagnified([[...atoms][0]], [], to, gesture)} />
        </div>
      </PageHtml>
    </group>
  );
}
