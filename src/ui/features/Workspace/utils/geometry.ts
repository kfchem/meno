/**
 * Calculate the position for a new bond when double-clicking an atom.
 *
 * This function determines where a new bond should be placed using:
 * - 120-degree spacing logic (120° apart when possible)
 * - Gap filling logic (places bond in largest angular gap if 120° not feasible)
 * - Collision avoidance (checks proximity to existing atoms)
 *
 * @param base - The base atom position {x, y}
 * @param neighbors - Array of neighboring atom positions {x, y}[]
 * @param allAtoms - All atoms in the structure for collision detection {x, y}[]
 * @param clickPos - Absolute click position {x, y}
 * @param bondLength - The bond length to use (typically NOMINAL_BOND_LENGTH)
 * @returns The calculated position for the new bond {x: number, y: number}
 */
export function calculateNewBondPosition(
  base: { x: number; y: number },
  neighbors: { x: number; y: number }[],
  allAtoms: { x: number; y: number }[],
  clickPos: { x: number; y: number },
  bondLength: number,
): { x: number; y: number } {
  const L = bondLength;

  // Angle utilities
  const TAU = Math.PI * 2;
  const angNorm = (a: number) => ((a % TAU) + TAU) % TAU;
  const angDist = (a: number, b: number) => {
    const d = Math.abs(angNorm(a) - angNorm(b));
    return d > Math.PI ? TAU - d : d;
  };

  // Collect neighbor angles around base atom
  const nbrAngles: number[] = neighbors.map((nbr) =>
    Math.atan2(nbr.y - base.y, nbr.x - base.x),
  );

  // Calculate click direction
  const clickDx = clickPos.x - base.x;
  const clickDy = clickPos.y - base.y;
  const clickLen = Math.hypot(clickDx, clickDy);
  const clickAng = Math.atan2(clickDy, clickDx);

  let placeAngle = 0; // default: to the right
  if (nbrAngles.length === 0) {
    // No neighbors: align to pointer direction if available
    placeAngle = clickLen > 1e-6 ? clickAng : 0;
  } else {
    // Try 120° scheme; otherwise fallback to largest gap center
    const MIN_SEP = (110 * Math.PI) / 180; // require >=110° separation from all neighbors
    const cand: number[] = [];
    for (const a of nbrAngles) {
      cand.push(angNorm(a + (2 * Math.PI) / 3));
      cand.push(angNorm(a - (2 * Math.PI) / 3));
    }
    // Evaluate candidates by min distance to neighbors
    type CandEval = { ang: number; minDist: number; clickBias: number };
    const evals: CandEval[] = cand.map((ang) => {
      const md = nbrAngles.reduce(
        (m, a) => Math.min(m, angDist(ang, a)),
        Infinity,
      );
      const cb = clickLen > 1e-6 ? angDist(ang, clickAng) : Math.PI; // smaller is better
      return { ang, minDist: md, clickBias: cb };
    });
    const feasible = evals.filter((e) => e.minDist >= MIN_SEP);
    if (feasible.length > 0) {
      // Prefer closest to click direction; tie-break by max clearance
      feasible.sort(
        (p, q) => p.clickBias - q.clickBias || q.minDist - p.minDist,
      );
      placeAngle = feasible[0].ang;
    } else {
      // Fallback: largest angular gap center
      const sorted = nbrAngles.map(angNorm).sort((a, b) => a - b);
      let bestGap = -1;
      let bestMid = 0;
      for (let i = 0; i < sorted.length; i++) {
        const a1 = sorted[i];
        const a2 = sorted[(i + 1) % sorted.length];
        const gap = (a2 - a1 + TAU) % TAU || TAU;
        const mid = a1 + gap / 2;
        if (gap > bestGap) {
          bestGap = gap;
          bestMid = mid;
        }
      }
      placeAngle = bestMid;
    }
  }

  // Nudge to avoid overlaps and exact neighbor directions
  const TAU_N = Math.PI * 2;
  const angNorm2 = (a: number) => ((a % TAU_N) + TAU_N) % TAU_N;
  const ANG_EPS = (8 * Math.PI) / 180; // 8° tolerance
  const POS_EPS = Math.max(1e-3, L * 0.02);
  const occupied = nbrAngles.map(angNorm2);

  function angleFree(a: number): boolean {
    const an = angNorm2(a);
    for (const o of occupied) {
      let d = Math.abs(an - o);
      if (d > Math.PI) d = TAU_N - d;
      if (d < ANG_EPS) return false;
    }
    return true;
  }

  function posFree(ax: number, ay: number): boolean {
    for (const pa of allAtoms) {
      const dxp = ax - pa.x;
      const dyp = ay - pa.y;
      if (Math.hypot(dxp, dyp) < POS_EPS) return false;
    }
    return true;
  }

  // Try original then 30° nudges
  const STEP = Math.PI / 6;
  let bestAng = placeAngle;
  let found = false;
  const tryOrder: number[] = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6];
  for (const k of tryOrder) {
    const a = placeAngle + k * STEP;
    if (!angleFree(a)) continue;
    const tx = base.x + L * Math.cos(a);
    const ty = base.y + L * Math.sin(a);
    if (!posFree(tx, ty)) continue;
    bestAng = a;
    found = true;
    break;
  }

  // Robust placement: angle nudges and slight radius tweaks
  const baseAng = found ? bestAng : placeAngle;
  const angleSteps: number[] = [];
  const STEP2 = Math.PI / 6; // 30°
  // primary around baseAng with 30° steps
  for (let k = 0; k <= 6; k++) angleSteps.push(k * STEP2, -k * STEP2);
  // interleaved 15° half-steps for extra options
  const HALF = STEP2 * 0.5;
  for (let k = 1; k <= 6; k++) angleSteps.push(k * HALF, -k * HALF);
  const radii = [1.0, 1.05, 0.95, 1.1, 0.9, 1.15, 0.85];
  let finalPos: { x: number; y: number } | null = null;
  outer: for (const da of angleSteps) {
    const a = baseAng + da;
    for (const rm of radii) {
      const tx = base.x + L * rm * Math.cos(a);
      const ty = base.y + L * rm * Math.sin(a);
      if (posFree(tx, ty)) {
        finalPos = { x: tx, y: ty };
        break outer;
      }
    }
  }

  const nx = finalPos ? finalPos.x : base.x + L * Math.cos(baseAng);
  const ny = finalPos ? finalPos.y : base.y + L * Math.sin(baseAng);

  return { x: nx, y: ny };
}

/**
 * Where one bond out of atom `id` ends, drawn where there is room - as a double-click on the atom draws it
 * (`calculateNewBondPosition`, from its neighbours, `toward` the pointer where it has none), as long as the bonds of its
 * structure are shown (`length`). Null where there is no such atom.
 */
export function newBondFrom(
  atoms: readonly { id: number; x: number; y: number }[],
  bonds: readonly { a: number; b: number }[],
  id: number,
  toward: { x: number; y: number },
  length: number,
): { x: number; y: number } | null {
  const base = atoms.find((a) => a.id === id);
  if (!base) return null;
  const at = new Map(atoms.map((a) => [a.id, a]));
  const neighbors = bonds.flatMap((b) => (b.a === id ? [at.get(b.b)] : b.b === id ? [at.get(b.a)] : [])).filter((p): p is (typeof atoms)[number] => !!p);
  return calculateNewBondPosition(base, neighbors, [...atoms], toward, length);
}
