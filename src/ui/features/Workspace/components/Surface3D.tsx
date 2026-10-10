import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Grid } from "../../../../lib/calc/results";
import { backToFront } from "../utils/backToFront";
import type { Vec3 } from "../utils/isosurface";
import { colourSurface, SURFACE_FINISH, SURFACE_OPACITY, surfaceGeometry } from "../utils/surfaceMesh";
import { surfaceOf } from "../utils/surfaces";

/** How quickly a surface comes and goes, in seconds. */
const FADE_TAU = 0.08;
/** How far the way it is seen may turn before its triangles are put in order again: about a fifth of a degree. */
const RESORT_COS = Math.cos((0.2 * Math.PI) / 180);

// (where it is looked at from, turned into the surface's own axes)
const inverse = new THREE.Matrix4();
const look = new THREE.Vector3();
const eye = new THREE.Vector3();

/**
 * A grid's surface, in its molecule (lib/calc/results `Grid`): where its
 * values come to `iso` - and a two-signed grid's, where they come to its
 * negative too - in the two colours of the 3D style, seen through: its
 * triangles drawn from the farthest to the nearest, put in order again as
 * it turns, so that a lobe behind another shows through it as it should,
 * whichever phase each is (drawn as two meshes, one phase was always laid
 * over the other). Worked
 * out off the main thread (../utils/surfaces); a new value's surface takes
 * the old one's place when it is ready, the last value asked for winning.
 * It fades in, and out as its grid is let go.
 */
export default function Surface3D({
  grid,
  centre,
  iso,
  plus,
  minus,
  renderOrder,
}: {
  /** The grid; none, its surface fading out. */
  grid: Grid | null;
  /** Its molecule's centre in the frame it belongs to, in ångströms: what the molecule is drawn about. */
  centre: Vec3;
  iso: number;
  plus: string;
  minus: string;
  renderOrder: number;
}) {
  const { invalidate, camera } = useThree();
  const [meshes, setMeshes] = useState<ReturnType<typeof surfaceGeometry> | null>(null);
  const level = useRef(0);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  // the way it was last put in order for, in its own axes; none, not yet
  const sortedFor = useRef<THREE.Vector3 | null>(null);
  const scratch = useRef({ keys: new Float32Array(0), counts: new Uint32Array(0) });
  // one surface worked out at a time: the value last asked for, once the
  // one under way is done - a slider dragged asks for many - and none for
  // a grid no longer shown
  const mounted = useRef(true);
  const busy = useRef(false);
  const wanted = useRef<{ grid: Grid; centre: Vec3; iso: number } | null>(null);
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
        const m = await surfaceOf(want.grid, want.centre, want.iso);
        if (!mounted.current || showing.current !== want.grid) continue;
        setMeshes((was) => {
          was?.geometry.dispose();
          return surfaceGeometry(m.plus, m.minus);
        });
        sortedFor.current = null;
        invalidate();
      } catch {
        // (a grid the worker could not take: nothing shown)
      }
    }
    busy.current = false;
  }, [invalidate]);

  useEffect(() => {
    if (!grid) return;
    wanted.current = { grid, centre: [cx, cy, cz], iso };
    void pump();
  }, [grid, cx, cy, cz, iso, pump]);

  // (let go when it leaves)
  useEffect(
    () => () => {
      mounted.current = false;
      setMeshes((was) => {
        was?.geometry.dispose();
        return null;
      });
    },
    [],
  );

  // (coloured as it comes, and again as the colours change)
  useEffect(() => {
    if (!meshes) return;
    colourSurface(meshes.geometry, meshes.split, plus, minus);
    invalidate();
  }, [meshes, plus, minus, invalidate]);

  useFrame((_, dt) => {
    const to = grid && meshes ? SURFACE_OPACITY : 0;
    const v = to + (level.current - to) * Math.exp(-Math.min(dt, 1 / 30) / FADE_TAU);
    level.current = Math.abs(v - to) < 0.005 ? to : v;
    if (mat.current) {
      mat.current.opacity = level.current;
      mat.current.visible = level.current > 0.005;
    }
    if (meshes && mesh.current && level.current > 0.005) sort(meshes.geometry, mesh.current);
    if (level.current !== to) invalidate();
    else if (to === 0 && meshes && !grid) {
      setMeshes((was) => {
        was?.geometry.dispose();
        return null;
      });
    }
  });

  /** Its triangles put in order, farthest first, as it is seen now - where it has turned since it last was. */
  const sort = (geometry: THREE.BufferGeometry, m: THREE.Mesh) => {
    m.updateWorldMatrix(true, false);
    inverse.copy(m.matrixWorld).invert();
    // (the way the camera looks; from where it is, for one in perspective)
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      eye.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inverse);
      geometry.boundingSphere ?? geometry.computeBoundingSphere();
      look.copy(geometry.boundingSphere!.center).sub(eye).normalize();
    } else {
      camera.getWorldDirection(look).transformDirection(inverse);
    }
    if (sortedFor.current && sortedFor.current.dot(look) > RESORT_COS) return;
    (sortedFor.current ??= new THREE.Vector3()).copy(look);
    const positions = geometry.getAttribute("position").array as Float32Array;
    const index = geometry.getIndex()!;
    const tris = positions.length / 9;
    const s = scratch.current;
    if (s.keys.length < tris) scratch.current = { keys: new Float32Array(tris), counts: new Uint32Array(tris + 1) };
    backToFront(positions, [look.x, look.y, look.z], index.array as Uint32Array, scratch.current);
    index.needsUpdate = true;
  };

  if (!meshes) return null;
  return (
    <mesh ref={mesh} geometry={meshes.geometry} renderOrder={renderOrder} frustumCulled={false} raycast={() => {}}>
      <meshStandardMaterial
        ref={mat}
        vertexColors
        transparent
        opacity={0}
        depthWrite={false}
        side={THREE.DoubleSide}
        // (in one go, in the order its index gives: not its back faces first)
        forceSinglePass
        {...SURFACE_FINISH}
      />
    </mesh>
  );
}
