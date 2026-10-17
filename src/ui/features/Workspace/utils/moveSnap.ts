import type { Model } from "../store";
import { bondLengthFrom } from "./magnified";

export type Point = { x: number; y: number };
export type MoveSnapResult = { px: number; py: number; center: Point | null };

const TAU = Math.PI * 2;
const STEP = Math.PI / 6; // 30°
const norm = (a: number) => ((a % TAU) + TAU) % TAU;

export function computeMoveSnap(
  model: Model,
  movingId: number,
  pointer: Point
): MoveSnapResult {
  const L = bondLengthFrom(model.atoms, movingId);
  const moving = model.atoms.find((a) => a.id === movingId);
  if (!moving) return { px: pointer.x, py: pointer.y, center: null };
  // neighbors
  const nbrIds: number[] = [];
  for (const b of model.bonds) {
    if (b.a === movingId) nbrIds.push(b.b);
    else if (b.b === movingId) nbrIds.push(b.a);
  }
  const deg = nbrIds.length;
  if (deg <= 0) {
    return { px: pointer.x, py: pointer.y, center: null };
  }
  if (deg === 1) {
    const nb = model.atoms.find((a) => a.id === nbrIds[0]);
    if (!nb) return { px: pointer.x, py: pointer.y, center: null };
    const ang = Math.atan2(pointer.y - nb.y, pointer.x - nb.x);
    const snap = Math.round(ang / STEP) * STEP;
    return {
      px: nb.x + L * Math.cos(snap),
      py: nb.y + L * Math.sin(snap),
      center: { x: nb.x, y: nb.y },
    };
  }
  // deg >= 2
  // hub = centroid
  let hubX = 0,
    hubY = 0,
    kcnt = 0;
  const nbrPos: { x: number; y: number }[] = [];
  const nbrAngles: number[] = [];
  for (const id of nbrIds) {
    const na = model.atoms.find((a) => a.id === id);
    if (!na) continue;
    hubX += na.x;
    hubY += na.y;
    kcnt++;
    nbrPos.push({ x: na.x, y: na.y });
  }
  if (kcnt > 0) {
    hubX /= kcnt;
    hubY /= kcnt;
  }
  type Cand = {
    cx: number;
    cy: number;
    r: number;
    ang: number;
    px: number;
    py: number;
  };
  const posKey = (x: number, y: number) =>
    `${(Math.round(x * 1000) / 1000).toFixed(3)}|${(
      Math.round(y * 1000) / 1000
    ).toFixed(3)}`;
  const cset = new Set<string>();
  const cands: Cand[] = [];
  const pushCandPos = (cx: number, cy: number, r: number, angVal: number) => {
    const a = norm(angVal);
    const px = cx + r * Math.cos(a);
    const py = cy + r * Math.sin(a);
    const key = posKey(px, py);
    if (!cset.has(key)) {
      cset.add(key);
      cands.push({ cx, cy, r, ang: a, px, py });
    }
  };
  const angPtrHub = Math.atan2(pointer.y - hubY, pointer.x - hubX);
  // 30° grid around pointer direction
  for (let kk = -6; kk <= 6; kk++)
    pushCandPos(hubX, hubY, L, Math.round(angPtrHub / STEP + kk) * STEP);
  // 15° phase-shifted grid
  const half = STEP * 0.5;
  for (let kk = -6; kk <= 6; kk++)
    pushCandPos(
      hubX,
      hubY,
      L,
      Math.round((angPtrHub + half) / STEP + kk) * STEP - half
    );
  // bisectors of neighbor gaps
  for (const na of nbrPos) nbrAngles.push(Math.atan2(na.y - hubY, na.x - hubX));
  const sorted = [...nbrAngles].sort((a, b) => norm(a) - norm(b));
  for (let i = 0; i < sorted.length; i++) {
    const a0 = sorted[i];
    const a1 = sorted[(i + 1) % sorted.length];
    let d = norm(a1) - norm(a0);
    if (d <= 0) d += TAU;
    const mid = norm(a0 + d / 2);
    pushCandPos(hubX, hubY, L, Math.round(mid / STEP) * STEP);
  }
  // uniform sectors based on (deg+1)-gon
  const sector = TAU / (deg + 1);
  for (let kk = -deg - 2; kk <= deg + 2; kk++)
    pushCandPos(hubX, hubY, L, Math.round(angPtrHub / sector + kk) * sector);
  // offsets from neighbors by exterior angles
  const exts = [120, 90, 72, 60, 45, 30].map((d) => (d * Math.PI) / 180);
  for (const a of sorted) {
    for (const ex of exts) {
      pushCandPos(hubX, hubY, L, a + ex);
      pushCandPos(hubX, hubY, L, a - ex);
    }
  }
  // 120° circle loci from neighbor pairs
  if (nbrPos.length >= 2) {
    const wrapPiArc = (t: number) => {
      let v = (t + Math.PI) % (2 * Math.PI);
      if (v < 0) v += 2 * Math.PI;
      return v - Math.PI;
    };
    for (let i = 0; i < nbrPos.length; i++) {
      for (let j = i + 1; j < nbrPos.length; j++) {
        const U = nbrPos[i];
        const V = nbrPos[j];
        const mx = (U.x + V.x) * 0.5;
        const my = (U.y + V.y) * 0.5;
        const dx2 = V.x - U.x;
        const dy2 = V.y - U.y;
        const c2 = Math.hypot(dx2, dy2);
        if (c2 <= 1e-6) continue;
        const R2 = c2 / Math.sqrt(3);
        const h2 = c2 / (2 * Math.sqrt(3));
        const ux2 = -dy2 / c2;
        const uy2 = dx2 / c2;
        const centers2 = [
          { x: mx + ux2 * h2, y: my + uy2 * h2 },
          { x: mx - ux2 * h2, y: my - uy2 * h2 },
        ];
        for (const C of centers2) {
          const aU = Math.atan2(U.y - C.y, U.x - C.x);
          const aV = Math.atan2(V.y - C.y, V.x - C.x);
          const dUV = wrapPiArc(aV - aU);
          const steps2 = Math.max(
            4,
            Math.round(Math.abs(dUV) / (Math.PI / 12))
          );
          for (let k = 0; k <= steps2; k++) {
            const t = k / steps2;
            const angC = aU + dUV * t;
            pushCandPos(C.x, C.y, R2, angC);
          }
        }
      }
    }
  }
  // optional filter: length parity to neighbors
  const TOL = Math.max(1e-4, L * 0.01);
  const filtered: Cand[] = [];
  for (const cd of cands) {
    const distances: number[] = [];
    for (const np of nbrPos)
      distances.push(Math.hypot(cd.px - np.x, cd.py - np.y));
    const okA = distances.some((d) => Math.abs(d - L) <= TOL);
    let okB = false;
    for (let i = 0; i < distances.length && !okB; i++) {
      for (let j = i + 1; j < distances.length; j++) {
        if (Math.abs(distances[i] - distances[j]) <= TOL) okB = true;
      }
    }
    if (okA || okB) filtered.push(cd);
  }
  const usable = filtered.length > 0 ? filtered : cands;
  // pick nearest to pointer
  let best: Cand | null = null;
  let bestD = Infinity;
  for (const cd of usable) {
    const d = Math.hypot(cd.px - pointer.x, cd.py - pointer.y);
    if (d < bestD) {
      bestD = d;
      best = cd;
    }
  }
  if (best)
    return { px: best.px, py: best.py, center: { x: best.cx, y: best.cy } };
  // fallback: simple centroid snap
  const ang = Math.atan2(pointer.y - hubY, pointer.x - hubX);
  const snap = Math.round(ang / STEP) * STEP;
  return {
    px: hubX + L * Math.cos(snap),
    py: hubY + L * Math.sin(snap),
    center: { x: hubX, y: hubY },
  };
}
