import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { TAU, follow } from "../../../theme/motion";
import { BAND_OF_DISC, clickSpread, DISC_OF_BOND, DRAW_BACK_MS, SELECTION_SHADE, SPREAD_MS } from "./selectionShade";
import type { Model } from "../store/types";
import { roomFor, selectedParts, type ShadedPart } from "./selectionParts";

/** A part of the drawing shaded as selected, how far into view, and where it was last. */
type Part = ShadedPart & { level: number };

const white = new THREE.Color("#ffffff");
const shade = new THREE.Color(SELECTION_SHADE);
const tint = new THREE.Color();
const place = new THREE.Matrix4();
const turn = new THREE.Quaternion();
const size = new THREE.Vector3();
const spot = new THREE.Vector3();
const upright = new THREE.Vector3(0, 0, 1);

/** An instanced mesh of `room` shadings of `geometry`, each its own colour, none of them picked. */
function shadings(geometry: THREE.BufferGeometry, room: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ depthWrite: false, toneMapped: false }), room);
  // (each instance's colour there before the material is first made, which reads it only then)
  mesh.setColorAt(0, white);
  mesh.count = 0;
  mesh.renderOrder = -2;
  // (under all the drawing, never in the way of a press)
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return mesh;
}

/**
 * What is selected of the drawing, shaded under it: a disc under each atom,
 * a band under each bond. Each part comes into view and goes out of it
 * rather than appear and vanish (TAU.quick), the page's white going over
 * to the shade, so that where parts overlap it stays even. A drawing of
 * tens of thousands of atoms selected whole is two meshes, its parts
 * instances of them, coloured as they come and go without drawing the
 * canvas's components again.
 */
export default function SelectionShade2D({
  shown,
  atoms,
  bonds,
  click,
}: {
  shown: Model;
  atoms: ReadonlySet<number>;
  bonds: ReadonlySet<number>;
  /** The atom a click selected last (the store's `clickShade`): its shade spreading, or drawing back. */
  click?: { atomId: number; at: number; fresh: boolean; back: boolean } | null;
}) {
  const clicked = useRef(click);
  clicked.current = click;
  /** The key of the atom whose shade spreads or draws back now, and how far: none once it is there. */
  const spreading = (): { key: string; f: number; back: boolean } | null => {
    const c = clicked.current;
    if (!c || !c.fresh) return null;
    const t = performance.now() - c.at;
    if (t >= (c.back ? DRAW_BACK_MS : SPREAD_MS)) return null;
    return { key: `a${c.atomId}`, f: clickSpread(t, c.back), back: c.back };
  };
  const invalidate = useThree((s) => s.invalidate);
  const parts = useRef(new Map<string, Part>());
  const chosen = useRef(new Set<string>());
  const r = DISC_OF_BOND * NOMINAL_BOND_LENGTH;
  const disc = useMemo(() => new THREE.CircleGeometry(r, 32), [r]);
  const band = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const meshes = useRef<{ discs: THREE.InstancedMesh; bands: THREE.InstancedMesh } | null>(null);
  const group = useRef<THREE.Group>(null!);

  // each part as it is now, and where it stands; those let go kept till they are out of view
  const now = useMemo(() => selectedParts(shown, atoms, bonds), [shown, atoms, bonds]);
  useEffect(() => {
    for (const [k, p] of now) parts.current.set(k, { ...parts.current.get(k), level: parts.current.get(k)?.level ?? 0, ...p });
    chosen.current = new Set(now.keys());
    paint();
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, invalidate]);

  /** The instances written from the parts: where each stands, and its colour as far as it is in view. */
  const paint = () => {
    let discs = 0;
    let bands = 0;
    for (const e of parts.current.values()) e.atom ? discs++ : bands++;
    let m = meshes.current;
    if (!m || m.discs.instanceMatrix.count < discs || m.bands.instanceMatrix.count < bands) {
      if (m) for (const mesh of [m.discs, m.bands]) {
        group.current?.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      }
      m = { discs: shadings(disc, roomFor(discs)), bands: shadings(band, roomFor(bands)) };
      meshes.current = m;
      group.current?.add(m.discs, m.bands);
    }
    let i = 0;
    let j = 0;
    const s = spreading();
    for (const [k, e] of parts.current) {
      // (a clicked atom's: whole in colour, spreading from it, or drawing back into it)
      const f = s && s.key === k ? s.f : null;
      tint.copy(white).lerp(shade, f != null ? 1 : e.level);
      if (e.atom) {
        m.discs.setMatrixAt(i, f != null ? place.makeScale(f, f, 1).setPosition(e.atom.x, e.atom.y, -0.04) : place.makeTranslation(e.atom.x, e.atom.y, -0.04));
        m.discs.setColorAt(i++, tint);
      } else if (e.bond) {
        const { p, q } = e.bond;
        turn.setFromAxisAngle(upright, Math.atan2(q.y - p.y, q.x - p.x));
        spot.set((p.x + q.x) / 2, (p.y + q.y) / 2, -0.045);
        size.set(Math.hypot(q.x - p.x, q.y - p.y), r * BAND_OF_DISC, 1);
        m.bands.setMatrixAt(j, place.compose(spot, turn, size));
        m.bands.setColorAt(j++, tint);
      }
    }
    for (const [mesh, count] of [[m.discs, i], [m.bands, j]] as const) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };

  useEffect(() => {
    const g = group.current;
    if (meshes.current && g) g.add(meshes.current.discs, meshes.current.bands);
    return () => {
      const m = meshes.current;
      if (!m) return;
      for (const mesh of [m.discs, m.bands]) {
        g?.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      }
      meshes.current = null;
    };
  }, []);
  useEffect(() => () => disc.dispose(), [disc]);
  useEffect(() => () => band.dispose(), [band]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 20);
    const s = spreading();
    let moving = !!s;
    for (const [k, e] of parts.current) {
      // (spread, or drawn back: there at once)
      if (s?.key === k) {
        e.level = s.back ? 0 : 1;
        continue;
      }
      const to = chosen.current.has(k) ? 1 : 0;
      if (e.level !== to) {
        const n = follow(e.level, to, d, TAU.quick);
        e.level = Math.abs(n - to) < 0.01 ? to : n;
        moving = true;
      }
      if (e.level === 0 && to === 0) parts.current.delete(k);
    }
    if (moving) {
      paint();
      invalidate();
    }
  });

  return <group ref={group} />;
}
