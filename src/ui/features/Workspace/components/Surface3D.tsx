import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Grid } from "../../../../lib/calc/results";
import type { Mesh, Vec3 } from "../utils/isosurface";
import { surfaceOf } from "../utils/surfaces";

/** How far a surface is seen through - its opacity - and how quickly it comes and goes, in seconds. One coloured by another grid is not seen through: its colours are what it says. */
const OPACITY = 0.6;
const COLOURED_OPACITY = 1;
const FADE_TAU = 0.08;

function geometryOf(m: Mesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
  if (m.colours) g.setAttribute("color", new THREE.BufferAttribute(m.colours, 3));
  return g;
}

/**
 * A grid's surface, in its molecule (lib/calc/results `Grid`): where its
 * values come to `iso` - and a two-signed grid's, where they come to its
 * negative too - in the two colours of the 3D style, seen through. Worked
 * out off the main thread (../utils/surfaces); a new value's surface takes
 * the old one's place when it is ready, the last value asked for winning.
 * It fades in, and out as its grid is let go. Coloured by another grid
 * (`colour`: lib/calc/results `SurfaceColour`), it is one surface, each
 * point in the colour the other grid's value there takes on the scale.
 */
export default function Surface3D({
  grid,
  centre,
  iso,
  plus,
  minus,
  colour,
  renderOrder,
}: {
  /** The grid; none, its surface fading out. */
  grid: Grid | null;
  /** Its molecule's centre in the frame it belongs to, in ångströms: what the molecule is drawn about. */
  centre: Vec3;
  iso: number;
  plus: string;
  minus: string;
  /** The grid that colours it, and the values its scale runs between; none, its two signs' colours. */
  colour?: { grid: Grid; from: number; to: number } | null;
  renderOrder: number;
}) {
  const { invalidate } = useThree();
  const [meshes, setMeshes] = useState<{ plus: THREE.BufferGeometry; minus: THREE.BufferGeometry | null; coloured: boolean } | null>(null);
  const level = useRef(0);
  const plusMat = useRef<THREE.MeshStandardMaterial>(null);
  const minusMat = useRef<THREE.MeshStandardMaterial>(null);
  // one surface worked out at a time: the value last asked for, once the
  // one under way is done - a slider dragged asks for many - and none for
  // a grid no longer shown
  const mounted = useRef(true);
  const busy = useRef(false);
  const wanted = useRef<{ grid: Grid; centre: Vec3; iso: number; colour?: { grid: Grid; from: number; to: number } } | null>(null);
  const showing = useRef<Grid | null>(grid);
  showing.current = grid;
  const [cx, cy, cz] = centre;
  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    while (mounted.current && wanted.current) {
      const want = wanted.current;
      wanted.current = null;
      try {
        const m = await surfaceOf(want.grid, want.centre, want.iso, want.colour);
        if (!mounted.current || showing.current !== want.grid) continue;
        setMeshes((was) => {
          was?.plus.dispose();
          was?.minus?.dispose();
          return { plus: geometryOf(m.plus), minus: m.minus ? geometryOf(m.minus) : null, coloured: !!m.plus.colours };
        });
        invalidate();
      } catch {
        // (a grid the worker could not take: nothing shown)
      }
    }
    busy.current = false;
  }, [invalidate]);

  const by = colour?.grid;
  const from = colour?.from;
  const to = colour?.to;
  useEffect(() => {
    if (!grid) return;
    wanted.current = { grid, centre: [cx, cy, cz], iso, ...(by && from != null && to != null ? { colour: { grid: by, from, to } } : {}) };
    void pump();
  }, [grid, cx, cy, cz, iso, by, from, to, pump]);

  // (let go when it leaves)
  useEffect(
    () => () => {
      mounted.current = false;
      setMeshes((was) => {
        was?.plus.dispose();
        was?.minus?.dispose();
        return null;
      });
    },
    [],
  );

  useFrame((_, dt) => {
    const goal = grid && meshes ? (meshes.coloured ? COLOURED_OPACITY : OPACITY) : 0;
    const v = goal + (level.current - goal) * Math.exp(-Math.min(dt, 1 / 30) / FADE_TAU);
    level.current = Math.abs(v - goal) < 0.005 ? goal : v;
    for (const mat of [plusMat.current, minusMat.current]) {
      if (mat) {
        mat.opacity = level.current;
        mat.visible = level.current > 0.005;
      }
    }
    if (level.current !== goal) invalidate();
    else if (goal === 0 && meshes && !grid) {
      setMeshes((was) => {
        was?.plus.dispose();
        was?.minus?.dispose();
        return null;
      });
    }
  });

  if (!meshes) return null;
  return (
    <group>
      <mesh geometry={meshes.plus} renderOrder={renderOrder} frustumCulled={false} raycast={() => {}}>
        {/* (a material of its own coloured: one made without its points' colours draws none) */}
        <meshStandardMaterial
          key={meshes.coloured ? "coloured" : "plain"}
          ref={plusMat}
          color={meshes.coloured ? "#ffffff" : plus}
          vertexColors={meshes.coloured}
          transparent
          opacity={0}
          depthWrite={meshes.coloured}
          side={THREE.DoubleSide}
          roughness={0.55}
          metalness={0}
        />
      </mesh>
      {meshes.minus && (
        <mesh geometry={meshes.minus} renderOrder={renderOrder} frustumCulled={false} raycast={() => {}}>
          <meshStandardMaterial
            ref={minusMat}
            color={minus}
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
            roughness={0.55}
            metalness={0}
          />
        </mesh>
      )}
    </group>
  );
}
