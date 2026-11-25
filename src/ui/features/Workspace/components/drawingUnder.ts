/**
 * Whether something of the drawing that takes a press lies at a point on
 * the page: the selection's turn handle, an atom or a bond, each as wide as
 * it takes a press (components/Selection2D, Atoms2D, BondsPick2D). A frame's
 * tab and edges give way to it where they overlap (pageGl/PageHits,
 * docs/WORKFLOWS.md *A set holds its members*): what lies on a member is the
 * member's.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { ATOM_PICK_RADIUS_RATIO, BOND_PICK_THICKNESS_RATIO } from "../constants";

type Pt = { x: number; y: number };

/** How far `p` is from the segment `a`-`b`. */
function toSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Whether `p` (page units) lies on the turn handle - its middle and its
 * reach, `handle` - or on an atom of `atoms` (where they are drawn) or a
 * bond of `bonds` between them.
 */
export function drawingUnder(atoms: readonly (Pt & { id: number })[], bonds: readonly { a: number; b: number }[], handle: (Pt & { reach: number }) | null, p: Pt): boolean {
  if (handle && Math.hypot(p.x - handle.x, p.y - handle.y) <= handle.reach) return true;
  const atomReach = ATOM_PICK_RADIUS_RATIO * NOMINAL_BOND_LENGTH;
  const at = new Map<number, Pt>();
  for (const a of atoms) {
    if (Math.abs(p.x - a.x) <= atomReach && Math.abs(p.y - a.y) <= atomReach && Math.hypot(p.x - a.x, p.y - a.y) <= atomReach) return true;
    at.set(a.id, a);
  }
  const bondReach = (BOND_PICK_THICKNESS_RATIO * NOMINAL_BOND_LENGTH) / 2;
  for (const b of bonds) {
    const a = at.get(b.a);
    const c = at.get(b.b);
    if (a && c && toSegment(p, a, c) <= bondReach) return true;
  }
  return false;
}
