import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { COLORS } from "../../../theme/colors";
import { DURATION, EASE, eased } from "../../../theme/motion";
import { fadingOut } from "./labelFade";
import { boxFill, outlineBand, type MarkBoxShape } from "./markBox";

/** A mark's box where it stands on the page, in the page's units: its middle, and its shape. */
export type MarkBox = Omit<MarkBoxShape, "radius"> & { key: string; x: number; y: number; dashed?: boolean };

/** Its outline's width, its corners' radius and a dashed one's dashes, in screen pixels: a CSS border's. */
const BORDER_PX = 1.5;
const RADIUS_PX = 3;
const DASH_PX = { on: 4.5, off: 3 };
/** How opaque its fill is: the accent a tenth. */
const FILL = 0.1;
/** Over the drawing - its bonds and labels - as the marks always were. */
const ORDER = 40;

/**
 * The marks' boxes on the page (ChemMarks2D) - a valence problem's round
 * its atom's label, a ring round an atom with none, dashed round what can
 * be read either way - drawn by WebGL with the page, so that they never
 * lag a pan or a zoom: their place and size in the page's units, their
 * outline as wide on the screen at any zoom. Each comes in and goes out as
 * an element's meno-fade-in and -out would (`leaving`: the keys going).
 */
export default function MarkBoxes2D({ boxes, leaving, zoom }: { boxes: readonly MarkBox[]; leaving: ReadonlySet<string>; zoom: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const level = useRef(new Map<string, number>());
  const materials = useRef(new Map<string, THREE.MeshBasicMaterial[]>());
  useEffect(() => invalidate(), [boxes, leaving, invalidate]);
  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 20);
    let going = false;
    for (const b of boxes) {
      const was = level.current.get(b.key) ?? 0;
      const to = leaving.has(b.key) ? 0 : 1;
      const now = to > was ? Math.min(1, was + d / DURATION.quick) : fadingOut(was, d, DURATION.quick);
      level.current.set(b.key, now);
      if (now !== to) going = true;
      // (on Meno's curve, in and back out along it: one going as it comes has no jump)
      const shown = eased(EASE, now);
      for (const m of materials.current.get(b.key) ?? []) m.opacity = (m.userData.most as number) * shown;
    }
    for (const k of [...level.current.keys()]) if (!boxes.some((b) => b.key === k)) level.current.delete(k);
    if (going) invalidate();
  });
  const z = Math.max(zoom, 1e-6);
  return (
    <group renderOrder={ORDER}>
      {boxes.map((b) => (
        <Box
          key={b.key}
          box={b}
          width={BORDER_PX / z}
          radius={b.round ? 0 : RADIUS_PX / z}
          dash={b.dashed ? { on: DASH_PX.on / z, off: DASH_PX.off / z } : undefined}
          onMaterials={(ms) => {
            if (ms) materials.current.set(b.key, ms);
            else materials.current.delete(b.key);
          }}
        />
      ))}
    </group>
  );
}

function Box({
  box,
  width,
  radius,
  dash,
  onMaterials,
}: {
  box: MarkBox;
  width: number;
  radius: number;
  dash?: { on: number; off: number };
  onMaterials: (ms: THREE.MeshBasicMaterial[] | null) => void;
}) {
  const shape = { w: box.w, h: box.h, radius, round: box.round };
  const key = `${box.w},${box.h},${radius},${box.round},${width},${dash?.on ?? ""}`;
  const band = useMemo(() => triangles(outlineBand(shape, width, dash)), [key]); // eslint-disable-line react-hooks/exhaustive-deps -- key: what shapes it
  const fill = useMemo(() => (dash ? null : triangles(boxFill(shape))), [key]); // eslint-disable-line react-hooks/exhaustive-deps -- key: what shapes it
  useEffect(() => () => band.dispose(), [band]);
  useEffect(() => () => fill?.dispose(), [fill]);
  const mats = useRef<THREE.MeshBasicMaterial[]>([]);
  const take = (i: number) => (m: THREE.MeshBasicMaterial | null) => {
    if (m) mats.current[i] = m;
    onMaterials(mats.current.filter(Boolean));
  };
  return (
    <group position={[box.x, box.y, 0]}>
      {fill && (
        <mesh geometry={fill} renderOrder={ORDER}>
          <meshBasicMaterial ref={take(0)} userData={{ most: FILL }} color={COLORS.attention} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <mesh geometry={band} renderOrder={ORDER + 1}>
        <meshBasicMaterial ref={take(1)} userData={{ most: 1 }} color={COLORS.attention} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function triangles(xy: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array((xy.length / 2) * 3);
  for (let i = 0; i < xy.length / 2; i++) {
    p[3 * i] = xy[2 * i];
    p[3 * i + 1] = xy[2 * i + 1];
  }
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  return g;
}
