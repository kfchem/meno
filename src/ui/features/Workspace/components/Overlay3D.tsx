import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ParsedBond } from "../../../../lib/chem/molecule";
import type { Solid } from "../utils/molecule3d";
import { most as mostOf } from "../../../../lib/extremes";

/** How thick the other frames' bonds are, as the molecule's own; how they come and go. */
const THIN = 0.55;
const TAU = 0.08;
/** The other frames' grey: the likeliest darkest, the least likely nearly white. */
const DARK = new THREE.Color("#7a828a");
const LIGHT = new THREE.Color("#e4e7ea");

const up = new THREE.Vector3(0, 1, 0);

/**
 * A molecule's other frames - its other conformers - drawn over the one it
 * shows: their bonds between heavy atoms, thin and grey, each as dark as its
 * conformer is likely (`weights`, by Boltzmann; all alike, without). They
 * fade in and out. In the molecule's own frame, about its centre.
 */
export default function Overlay3D({
  solid,
  bonds,
  els,
  frame,
  on,
  radius,
  weights,
}: {
  solid: Solid;
  bonds: ParsedBond[];
  els: string[];
  frame: number;
  on: boolean;
  radius: number;
  weights?: number[];
}) {
  const invalidate = useThree((s) => s.invalidate);
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const level = useRef(0);
  const heavy = useMemo(() => bonds.filter((b) => els[b.a1] !== "H" && els[b.a2] !== "H"), [bonds, els]);
  const others = useMemo(() => solid.frames.map((_, i) => i).filter((i) => i !== frame), [solid, frame]);
  const count = Math.max(1, others.length * heavy.length);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const s = new THREE.Vector3();
    const colour = new THREE.Color();
    const most = weights ? Math.max(mostOf(weights), 1e-12) : 1;
    let k = 0;
    for (const f of others) {
      const p = solid.frames[f];
      // (the likeliest dark; one a hundredth as likely, nearly white)
      const w = weights ? Math.max(0, 1 + Math.log10(Math.max(weights[f] / most, 1e-6)) / 2) : 0.6;
      colour.copy(LIGHT).lerp(DARK, w);
      for (const bond of heavy) {
        a.set(p[3 * bond.a1], p[3 * bond.a1 + 1], p[3 * bond.a1 + 2]);
        b.set(p[3 * bond.a2], p[3 * bond.a2 + 1], p[3 * bond.a2 + 2]);
        const along = b.clone().sub(a);
        const length = along.length();
        q.setFromUnitVectors(up, length > 1e-9 ? along.divideScalar(length) : up);
        m.compose(mid.addVectors(a, b).multiplyScalar(0.5), q, s.set(radius * THIN, length, radius * THIN));
        mesh.current.setMatrixAt(k, m);
        mesh.current.setColorAt(k, colour);
        k++;
      }
    }
    mesh.current.count = k;
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    invalidate();
  }, [solid, heavy, others, weights, radius, invalidate]);
  useFrame((_, dt) => {
    const to = on ? 1 : 0;
    const v = to + (level.current - to) * Math.exp(-Math.min(dt, 1 / 30) / TAU);
    level.current = Math.abs(v - to) < 0.01 ? to : v;
    (mesh.current.material as THREE.MeshBasicMaterial).opacity = 0.85 * level.current;
    mesh.current.visible = level.current > 0;
    if (level.current !== to) invalidate();
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false} raycast={() => {}} renderOrder={99}>
      <cylinderGeometry args={[1, 1, 1, 8]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}
