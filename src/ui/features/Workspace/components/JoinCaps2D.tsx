import * as THREE from "three";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useDrawnLayout } from "./drawnLayoutContext";
import { colorInstances } from "./instances";

/**
 * The round caps where bonds meet and where they end, from the shared layout.
 * An atom being dragged is laid out where it is being dragged to, so its caps
 * go with it.
 *
 * All of them are one mesh, each cap an instance of the same disc: a drawing
 * has a cap at nearly every atom, and a mesh - a geometry and a material -
 * for each made a drawing of thousands of atoms take seconds to put up and
 * every frame of it slow to draw.
 */
export default function JoinCaps2D() {
  const { layout, opts } = useDrawnLayout();
  const inst = useRef<THREE.InstancedMesh>(null!);
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  // Room for as many caps as the drawing has, grown as it does - never
  // shrunk, so that an edit does not make the mesh again - and made in the
  // same render as the layout that needs it, so that no frame is drawn with
  // too few.
  const room = useRef(64);
  while (room.current < layout.fills.length) room.current *= 2;
  const countCap = room.current;

  useLayoutEffect(() => {
    const m = inst.current;
    if (!m) return;
    const fills = layout.fills;
    m.count = fills.length;
    for (let i = 0; i < fills.length; i++) {
      const c = fills[i];
      tmpM.makeScale(c.r, c.r, 1).setPosition(c.c.x, c.c.y, 0);
      m.setMatrixAt(i, tmpM);
    }
    m.instanceMatrix.needsUpdate = true;
    // (each in its own colour, where it has one)
    colorInstances(m, fills.map((c) => c.color), opts.bondColor ?? "black");
  }, [layout, countCap, tmpM, opts.bondColor]);

  return (
    <instancedMesh
      ref={inst}
      key={countCap}
      args={[undefined as any, undefined as any, countCap]}
      count={0}
      frustumCulled={false}
      renderOrder={9}
    >
      <circleGeometry args={[1, 24]} />
      <meshBasicMaterial
        color="#ffffff"
        toneMapped={false}
        transparent
        opacity={1}
        depthTest={false}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
