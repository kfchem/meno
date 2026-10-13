import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { useDrawnLayout } from "./drawnLayoutContext";
import { colorInstances, widenedMaterial } from "./instances";
import { lineWidening } from "../utils/largeZoom";

/** The drawing's lines, from the shared layout: bonds, hashes, waves. */
export function Bonds2D() {
  const { layout, opts } = useDrawnLayout();
  const invalidate = useThree((s) => s.invalidate);
  // (as wide as a layout at the view's zoom would have them, laid out at another: utils/largeZoom)
  const drawn = useMemo(() => widenedMaterial("y", { color: "#ffffff", vertexColors: false, toneMapped: false }), []);
  useEffect(() => () => drawn.material.dispose(), [drawn]);
  useFrame(({ camera }) => {
    drawn.width.value = lineWidening(opts, layout.zoom, (camera as THREE.OrthographicCamera).zoom || 1);
  });
  const inst = useRef<THREE.InstancedMesh>(null!);
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  // Capacity: a wavy bond's segment count grows with bond length and zoom
  // and is unbounded, and a hashed bond emits a segment per hash when ends
  // are round. Start from a generous per-line estimate and grow below if a
  // layout ever needs more room, rather than overflowing the instanced
  // mesh's buffer, which blanks the whole canvas.
  const [countCap, setCountCap] = useState(() =>
    Math.max(layout.lines.length * 2, 64),
  );

  useEffect(() => {
    const m = inst.current;
    if (!m) return;
    const segs = layout.lines;
    if (segs.length > countCap) {
      // Grow and bail; the effect runs again once the larger mesh is up.
      setCountCap(Math.max(segs.length, countCap * 2));
      return;
    }
    const zoom = Math.max(layout.zoom, 1e-6);
    m.count = segs.length;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const dx = s.x2 - s.x1,
        dy = s.y2 - s.y1;
      const len = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      // A line's width comes in pixels at the zoom the layout was built for;
      // keep a small world minimum under it.
      const MIN_WORLD_THICK = Math.max(1e-3, NOMINAL_BOND_LENGTH * 0.02);
      const thickWorld = Math.max(s.widthPx / zoom, MIN_WORLD_THICK);
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
      tmpM.compose(
        new THREE.Vector3((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, 0),
        tmpQ,
        new THREE.Vector3(len, thickWorld, 1),
      );
      m.setMatrixAt(i, tmpM);
    }
    m.instanceMatrix.needsUpdate = true;
    // (each in its own colour, where it has one)
    colorInstances(m, segs.map((s) => s.color), opts.bondColor ?? "black");
    // (drawn again with them: a large drawing's frame may have been drawn
    // before this ran - a stack of a thousand records laid out as a grid -
    // and nothing else would draw it again until the view moved)
    invalidate();
  }, [layout, countCap, tmpM, tmpQ, opts.bondColor, invalidate]);

  return (
    <instancedMesh
      ref={inst}
      key={countCap}
      args={[undefined as any, undefined as any, countCap]}
      frustumCulled={false}
    >
      <planeGeometry args={[1, 1]} />
      <primitive object={drawn.material} attach="material" dispose={null} />
    </instancedMesh>
  );
}
