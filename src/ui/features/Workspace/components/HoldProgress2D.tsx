import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { ALPHA, COLORS } from "../../../theme/colors";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { ATOM_HOVER_RING_RADIUS_RATIO } from "../constants";
import { holdProgress } from "./held";
import { SELECTION_SHADE } from "./selectionShade";

/** How quickly what a hold showed goes once it is let go, or done, in seconds. */
const FADE_S = 0.14;

/**
 * A press being held, as it is held (`pressHold`): on an atom, the
 * selection's shade spreading out from it along the bonds, reaching the
 * whole structure as the hold selects it - the selection then shaded in
 * the same colour - and on empty space a ring opening where a box is to
 * begin. Let go early, it goes again.
 */
export default function HoldProgress2D() {
  const hold = useEditor((s) => s.pressHold);
  const model = useEditor((s) => s.model);
  const { invalidate } = useThree();
  const shade = SELECTION_SHADE;
  const r = ATOM_HOVER_RING_RADIUS_RATIO * NOMINAL_BOND_LENGTH;
  // the structure the press is on, by how many bonds each atom is from it
  const reach = useMemo(() => {
    const id = hold?.atomId;
    if (id == null) return null;
    const near = new Map<number, number[]>();
    for (const b of model.bonds) {
      near.set(b.a, [...(near.get(b.a) ?? []), b.b]);
      near.set(b.b, [...(near.get(b.b) ?? []), b.a]);
    }
    const level = new Map<number, number>([[id, 0]]);
    let edge = [id];
    while (edge.length) {
      const next: number[] = [];
      for (const a of edge) {
        for (const o of near.get(a) ?? []) {
          if (level.has(o)) continue;
          level.set(o, level.get(a)! + 1);
          next.push(o);
        }
      }
      edge = next;
    }
    const deepest = Math.max(...level.values());
    return { level, deepest };
  }, [hold?.atomId, model.bonds]);
  // what is shown, kept to fade once the hold is over
  // (and when the hold was over: let go early, what it showed stays as it was then, fading - a click shows nothing)
  const shown = useRef<{ hold: NonNullable<typeof hold>; reach: typeof reach; fade: number; ended?: number } | null>(null);
  const atomMeshes = useRef(new Map<number, THREE.Mesh>());
  const bondMeshes = useRef(new Map<number, THREE.Mesh>());
  const ring = useRef<THREE.Mesh>(null!);
  if (hold && shown.current?.hold !== hold) shown.current = { hold, reach, fade: 1 };

  useFrame((_, dt) => {
    const s = shown.current;
    if (!s) return;
    if (!hold || hold !== s.hold) {
      s.ended ??= performance.now();
      s.fade = Math.max(0, s.fade - Math.min(dt, 1 / 30) / FADE_S);
    }
    const u = holdProgress(s.hold.start, performance.now(), s.ended);
    if (s.reach) {
      // (the farthest atoms reached just as the hold is done)
      const front = u * (s.reach.deepest + 1);
      const of = (id: number) => Math.min(1, Math.max(0, front - (s.reach!.level.get(id) ?? Infinity)));
      for (const [id, m] of atomMeshes.current) (m.material as THREE.MeshBasicMaterial).opacity = of(id) * s.fade;
      for (const [id, m] of bondMeshes.current) {
        const b = model.bonds.find((x) => x.id === id);
        (m.material as THREE.MeshBasicMaterial).opacity = b ? Math.min(of(b.a), of(b.b)) * s.fade : 0;
      }
    }
    if (ring.current) {
      ring.current.visible = !!s.hold.at;
      if (s.hold.at) {
        ring.current.position.set(s.hold.at.x, s.hold.at.y, 0.5);
        ring.current.scale.setScalar(Math.max(1e-3, 0.4 * NOMINAL_BOND_LENGTH * (1 - Math.pow(1 - u, 3))));
        (ring.current.material as THREE.MeshBasicMaterial).opacity = ALPHA.highlight * u * s.fade;
      }
    }
    if (s.fade <= 0) shown.current = null;
    invalidate();
  });

  const s = shown.current;
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const atoms = s?.reach ? model.atoms.filter((a) => s.reach!.level.has(a.id)) : [];
  const bonds = s?.reach ? model.bonds.filter((b) => s.reach!.level.has(b.a) && s.reach!.level.has(b.b)) : [];
  atomMeshes.current.clear();
  bondMeshes.current.clear();
  return (
    <group>
      {atoms.map((a) => (
        <mesh
          key={`ha-${a.id}`}
          ref={(m) => {
            if (m) atomMeshes.current.set(a.id, m);
          }}
          position={[a.x, a.y, -0.041]}
          renderOrder={-2}
        >
          <circleGeometry args={[r, 32]} />
          <meshBasicMaterial color={shade} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      {bonds.map((b) => {
        const p = byId.get(b.a);
        const q = byId.get(b.b);
        if (!p || !q) return null;
        const len = Math.hypot(q.x - p.x, q.y - p.y);
        return (
          <mesh
            key={`hb-${b.id}`}
            ref={(m) => {
              if (m) bondMeshes.current.set(b.id, m);
            }}
            position={[(p.x + q.x) / 2, (p.y + q.y) / 2, -0.046]}
            rotation={[0, 0, Math.atan2(q.y - p.y, q.x - p.x)]}
            renderOrder={-2}
          >
            <planeGeometry args={[len, r * 1.1]} />
            <meshBasicMaterial color={shade} transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>
        );
      })}
      <mesh ref={ring} visible={false} renderOrder={40}>
        <ringGeometry args={[0.82, 1, 48]} />
        <meshBasicMaterial color={COLORS.highlight} transparent opacity={0} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
