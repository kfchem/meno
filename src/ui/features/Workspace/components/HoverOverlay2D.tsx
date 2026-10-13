import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS, ALPHA } from "../../../theme/colors";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { lineHalfOf, type BondReach } from "../../../../lib/chem/layout2d";
import { useDrawnLayout } from "./drawnLayoutContext";
import { bandAround } from "./hoverBand";

/** The highlight's width once it has come in, over THICKNESS_RATIO's. */
const SETTLED = 1.35;
const THICKNESS_RATIO = 0.16;
/** How long a band takes to come in, and to go, and a pulse to run, in seconds. */
const DUR_IN = 0.16;
const DUR_OUT = 0.12;
const PULSE = 0.16;
const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);
/** How wide a band is at `u` of its way in: from three quarters, past its size, to settle. */
function widthAt(u: number): number {
  if (u < 0.5) return 0.75 + 0.25 * easeOutCubic(u / 0.5);
  const k = (u - 0.5) / 0.5;
  return 1 + (SETTLED - 1) * (1 - Math.pow(1 - k, 2));
}

type Band = { u: number; pulse: number; mesh: THREE.Mesh | null; drawnAt: string };

/**
 * The band behind the bond under the pointer. Each band has its own way in:
 * one coming in as the pointer reaches a bond while the one it left goes
 * out, and one turned back half way going back from where it was. A click
 * that changes the bond pulses its band - narrower, brighter, and back -
 * without starting it over. Once in, a band rests, and nothing is drawn
 * again for it until something changes.
 */
export default function HoverOverlay2D() {
  // (what it reads, and only that: the whole state renders it again at every change of anything)
  const model = useEditor((s) => s.model);
  const hovered = useEditor((s) => s.hovered);
  const hoverPulse = useEditor((s) => s.hoverPulse);
  const drawn = useDrawnLayout();
  // (each bond, each drawn atom and each drawn bond by what finds it, made as they change - not looked for along
  // every atom and bond at every frame a band moves)
  const bondById = useMemo(() => new Map(model.bonds.map((b) => [b.id, b])), [model.bonds]);
  const drawnAt = useMemo(() => new Map(drawn.atoms.map((a, i) => [a.id, i])), [drawn.atoms]);
  const drawnBond = useMemo(() => {
    const at = new Map<string, number>();
    drawn.bonds.forEach((b, k) => {
      const key = `${b.a1} ${b.a2}`;
      if (!at.has(key)) at.set(key, k);
    });
    return at;
  }, [drawn.bonds]);
  const invalidate = useThree((s) => s.invalidate);
  const bands = useRef(new Map<number, Band>());
  const pulsed = useRef(hoverPulse.nonce);
  const [, setFrame] = useState(0);

  const hb = hovered.bondId;
  if (hb != null && !bands.current.has(hb)) bands.current.set(hb, { u: 0, pulse: 0, mesh: null, drawnAt: "" });
  // a pulse on the hovered bond runs from its start, the band where it is
  if (hoverPulse.nonce !== pulsed.current) {
    pulsed.current = hoverPulse.nonce;
    const b = hoverPulse.id != null ? bands.current.get(hoverPulse.id) : undefined;
    if (b) b.pulse = 1;
  }
  useEffect(() => () => bands.current.forEach((b) => b.mesh?.geometry.dispose()), []);

  useFrame((_, dt) => {
    let moving = false;
    const L = NOMINAL_BOND_LENGTH;
    const targetWorld = THICKNESS_RATIO * L;
    const lineHalf = lineHalfOf(drawn.opts, drawn.zoom);
    const settledHalf = (targetWorld * SETTLED) / 2;
    const margin = Math.max(0, settledHalf - lineHalf);
    const ext = 0.04 * L;
    for (const [id, band] of bands.current) {
      const inward = id === hovered.bondId;
      const u = Math.min(1, Math.max(0, band.u + (inward ? dt / DUR_IN : -dt / DUR_OUT)));
      if (u !== band.u) {
        band.u = u;
        moving = true;
      }
      if (band.pulse > 0) {
        band.pulse = Math.max(0, band.pulse - dt / PULSE);
        moving = true;
      }
      if (u === 0 && !inward) {
        band.mesh?.geometry.dispose();
        bands.current.delete(id);
        moving = true;
        continue;
      }
      const mesh = band.mesh;
      if (!mesh) continue;
      // the bond where it is drawn, and how far its drawing reaches off its
      // line at each end: the band follows that, so neither a wedge's broad
      // end nor a double bond's second line stands out past it
      const bond = bondById.get(id);
      const i1 = bond ? (drawnAt.get(bond.a) ?? -1) : -1;
      const i2 = bond ? (drawnAt.get(bond.b) ?? -1) : -1;
      if (i1 < 0 || i2 < 0) {
        mesh.visible = false;
        continue;
      }
      const a1 = drawn.atoms[i1];
      const a2 = drawn.atoms[i2];
      let reach: BondReach = { left1: lineHalf, right1: lineHalf, left2: lineHalf, right2: lineHalf };
      const k = drawnBond.get(`${i1} ${i2}`) ?? -1;
      if (k >= 0 && drawn.layout.reach[k]) reach = drawn.layout.reach[k];
      // (a pulse: narrower and brighter, and back, over its run)
      const swing = Math.sin(Math.PI * band.pulse);
      const w = targetWorld * widthAt(band.u) * (1 - 0.25 * swing);
      const opacity = Math.min(1, ALPHA.highlight * easeOutCubic(band.u) * (1 + 0.35 * swing));
      const key = `${a1.x},${a1.y},${a2.x},${a2.y},${w},${drawn.zoom},${k >= 0 ? JSON.stringify(reach) : ""}`;
      if (key !== band.drawnAt) {
        band.drawnAt = key;
        const outline = bandAround(
          { x: a1.x, y: a1.y },
          { x: a2.x, y: a2.y },
          reach,
          margin,
          w / 2,
          ext,
          w / (targetWorld * SETTLED),
        );
        const old = mesh.geometry;
        mesh.geometry = new THREE.ShapeGeometry(new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y))));
        old?.dispose();
      }
      (mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
      mesh.visible = opacity > 0.005;
    }
    if (moving) {
      setFrame((f) => f + 1);
      invalidate();
    }
  });

  return (
    <group>
      {[...bands.current.keys()].map((id) => (
        // Behind the drawing: depth-tested behind its lines, and drawn before
        // the shapes and caps that draw over it (Wedges2D, JoinCaps2D)
        <mesh
          key={id}
          ref={(m) => {
            const band = bands.current.get(id);
            if (band) band.mesh = m;
          }}
          position={[0, 0, -0.02]}
          visible={false}
        >
          <meshBasicMaterial
            color={COLORS.highlight}
            transparent
            opacity={0}
            depthTest={true}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
