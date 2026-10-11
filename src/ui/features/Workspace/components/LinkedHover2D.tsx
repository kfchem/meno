import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { ALPHA, COLORS } from "../../../theme/colors";
import { ATOM_HOVER_RING_RADIUS_RATIO } from "../constants";
import { useEditor } from "../store";
import { lightSpot, spotLit } from "./figureTie";

/** How long the ring takes to come and go. */
const TAU = 0.05;

/**
 * The drawing's atom that the atom of a molecule in 3D under the pointer was
 * made from - or that was read from the place in a PDF's figure under it -
 * ringed as an atom under the pointer is: the same atom, lit in both
 * (docs/WORKSPACE.md, docs/PDF.md). It fades in and out.
 */
export default function LinkedHover2D() {
  const hovered = useEditor((s) => s.hoveredAtom3d);
  const figureLit = useEditor((s) => s.figureLit);
  const molecules = useEditor((s) => s.molecules3d);
  const model = useEditor((s) => s.model);
  const invalidate = useThree((s) => s.invalidate);
  const mesh = useRef<THREE.Mesh>(null!);
  const level = useRef(0);
  const from3d = hovered ? molecules.find((m) => m.id === hovered.id)?.drawnFrom?.[hovered.atom] : undefined;
  const id = from3d ?? figureLit;
  const atom = id == null ? undefined : model.atoms.find((a) => a.id === id);
  // (where it was, kept while it fades)
  const last = useRef<{ x: number; y: number } | null>(null);
  if (atom) last.current = { x: atom.x, y: atom.y };
  useEffect(() => invalidate(), [atom, invalidate]);
  // (the place in a figure an atom under the pointer was read from, lit there: drawn on the pages and pictures that show it)
  const hoveredAtom = useEditor((s) => s.hovered.atomId);
  useEffect(() => {
    lightSpot(spotLit(model, hoveredAtom, figureLit));
    invalidate();
  }, [model, hoveredAtom, figureLit, invalidate]);
  useFrame((_, dt) => {
    const to = atom ? 1 : 0;
    const v = to + (level.current - to) * Math.exp(-Math.min(dt, 1 / 30) / TAU);
    level.current = Math.abs(v - to) < 0.01 ? to : v;
    const p = last.current;
    mesh.current.visible = level.current > 0 && !!p;
    if (p) mesh.current.position.set(p.x, p.y, 0);
    (mesh.current.material as THREE.MeshBasicMaterial).opacity = ALPHA.highlight * level.current;
    if (level.current !== to) invalidate();
  });
  const r = ATOM_HOVER_RING_RADIUS_RATIO * NOMINAL_BOND_LENGTH;
  return (
    <mesh ref={mesh} visible={false} renderOrder={5}>
      <ringGeometry args={[r * 0.82, r, 48]} />
      <meshBasicMaterial color={COLORS.highlight} transparent opacity={0} depthTest={false} depthWrite={false} />
    </mesh>
  );
}
