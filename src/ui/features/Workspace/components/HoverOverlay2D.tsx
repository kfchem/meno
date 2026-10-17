import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS, ALPHA } from "../../../theme/colors";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { lineHalfOf, type BondReach } from "../../../../lib/chem/layout2d";
import { useDrawnLayout } from "./drawnLayoutContext";
import { bandAround } from "./hoverBand";
import { allylArcOf } from "../chem/eta";

/** A band `half` wide either side of a line through `pts`, as an outline: along one side, then back along the other. */
function bandAlong(pts: readonly { x: number; y: number }[], half: number): { x: number; y: number }[] {
  const side = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len, p };
  });
  return [...side.map((s) => ({ x: s.p.x + s.x * half, y: s.p.y + s.y * half })), ...side.reverse().map((s) => ({ x: s.p.x - s.x * half, y: s.p.y - s.y * half }))];
}

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

type Band = {
  u: number;
  pulse: number;
  mesh: THREE.Mesh | null;
  drawnAt: string;
  /** The layout its bond was last found in, and where: its atoms' places, and its own (-1 where it is not there). */
  found: { in: unknown; i1: number; i2: number; k: number } | null;
};

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
  // (where a band's bond is in the layout: looked for once each time the
  // layout changes, for the one or two bands there are - no index of every
  // atom and bond made at every frame of a drag)
  const find = (band: Band, id: number) => {
    if (band.found?.in === drawn) return band.found;
    const bond = model.bonds.find((b) => b.id === id);
    let i1 = -1;
    let i2 = -1;
    if (bond) {
      for (let i = 0; i < drawn.atoms.length && (i1 < 0 || i2 < 0); i++) {
        if (drawn.atoms[i].id === bond.a) i1 = i;
        if (drawn.atoms[i].id === bond.b) i2 = i;
      }
    }
    const k = i1 < 0 || i2 < 0 ? -1 : drawn.bonds.findIndex((b) => b.a1 === i1 && b.a2 === i2);
    return (band.found = { in: drawn, i1, i2, k });
  };
  const invalidate = useThree((s) => s.invalidate);
  const bands = useRef(new Map<number, Band>());
  const pulsed = useRef(hoverPulse.nonce);
  const [, setFrame] = useState(0);

  const hb = hovered.bondId;
  if (hb != null && !bands.current.has(hb)) bands.current.set(hb, { u: 0, pulse: 0, mesh: null, drawnAt: "", found: null });
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
    // (as wide as the bonds are drawn: at the zoom they were laid out at)
    const lineHalf = lineHalfOf(drawn.opts, drawn.laidAt);
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
      const { i1, i2, k } = find(band, id);
      if (i1 < 0 || i2 < 0) {
        mesh.visible = false;
        continue;
      }
      const a1 = drawn.atoms[i1];
      const a2 = drawn.atoms[i2];
      let reach: BondReach = { left1: lineHalf, right1: lineHalf, left2: lineHalf, right2: lineHalf };
      if (k >= 0 && drawn.layout.reach[k]) reach = drawn.layout.reach[k];
      // (a pulse: narrower and brighter, and back, over its run)
      const swing = Math.sin(Math.PI * band.pulse);
      const w = targetWorld * widthAt(band.u) * (1 - 0.25 * swing);
      const opacity = Math.min(1, ALPHA.highlight * easeOutCubic(band.u) * (1 + 0.35 * swing));
      // (an η3-allyl's bond: its arc banded with it - chem/eta)
      const bond = model.bonds.find((b) => b.id === id);
      const arc = bond?.endpoints?.length === 3 ? allylArcOf(bond, new Map(drawn.atoms.map((a) => [a.id, a])), model.bonds) : null;
      const key = `${a1.x},${a1.y},${a2.x},${a2.y},${w},${drawn.laidAt},${k >= 0 ? JSON.stringify(reach) : ""},${arc ? `${arc[0].x},${arc[0].y},${arc[arc.length - 1].x},${arc[arc.length - 1].y}` : ""}`;
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
        const shapes = [new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y)))];
        if (arc) shapes.push(new THREE.Shape(bandAlong(arc, w / 2).map((p) => new THREE.Vector2(p.x, p.y))));
        mesh.geometry = new THREE.ShapeGeometry(shapes);
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
