import * as THREE from "three";
import type { BondLine } from "./molecule3d";

/**
 * A double or triple bond's lines turning round at a lone atom (a style's
 * `doubleEnds` or `tripleEnds`, "curve" - the maintainer, 2026-10-15: "a
 * clean U"): each line a stick like any other, its instance bent in the
 * vertex shader - straight, side by side with the others, till as far
 * short of the atom as it stands off the bond's axis, then round a quarter
 * circle about the axis to the atom's centre, arriving across the bond - so
 * that a double bond's two lines, or a triple bond's outer two, turn round
 * there as one tube, a half circle centred on the axis, its apex on the
 * atom (a triple bond's middle line runs straight in, its end inside the
 * turn). Straight into round is smooth by its making: the circle starts
 * along the line.
 *
 * Each instance carries how far it comes in - from where it stands to the
 * axis, in its own units - and toward which end (`stickBend`, a vec4: its
 * sign the end; none where the attribute is not given, WebGL's default (0,
 * 0, 0, 1) bending nothing). Its rings are swept round square to the curve,
 * so that it stays as thick through the turn; its shading, its colours'
 * halves and the line round it follow. Such sticks are drawn apart from the
 * others, in a material of their own and with rings close together toward
 * their ends (`bentStickGeometry`), so that straight sticks never pay for
 * them.
 */

/**
 * Where a turning line's centre is at `u` (0 to 1) along its stick toward
 * its lone atom: how far across from the bond's axis, as a part of how far
 * it stands off it straight, and how far along, as a part of the bond's
 * length - with the rate each changes at. `off` is how far it stands off
 * the axis, as a part of the bond's length: it turns in that far short of
 * the atom - on the first half of its stick, straight there; on the second,
 * round its quarter circle.
 */
export function bentCourse(u: number, off: number): { across: number; along: number; dAcross: number; dAlong: number } {
  const straight = 1 - off;
  if (u <= 0.5) return { across: 1, along: 2 * u * straight, dAcross: 0, dAlong: 2 * straight };
  const th = (u - 0.5) * Math.PI;
  return { across: Math.cos(th), along: straight + off * Math.sin(th), dAcross: -Math.PI * Math.sin(th), dAlong: Math.PI * off * Math.cos(th) };
}

/**
 * The GLSL: the attribute; `stickAlongY` - where along its bond a vertex of
 * a stick is, as its y would be unbent, for its colours' halves and its
 * shade; and `stickSwept` - a vertex `p` with its normal `n`, as its
 * instance bends it: where it goes, and its normal there, both in the
 * stick's own units, as the instance matrix takes them.
 */
export const STICK_BEND_GLSL = `
attribute vec4 stickBend;
float stickAlongY( vec3 p ) {
  #ifdef USE_INSTANCING
    if ( dot( stickBend.xyz, stickBend.xyz ) < 1e-12 ) return p.y;
    float sgn = stickBend.w >= 0.0 ? 1.0 : -1.0;
    float u = sgn > 0.0 ? p.y + 0.5 : 0.5 - p.y;
    mat3 im = mat3( instanceMatrix );
    float o = length( im * stickBend.xyz ) / length( im * vec3( 0.0, 1.0, 0.0 ) );
    float along = u <= 0.5 ? 2.0 * u * ( 1.0 - o ) : 1.0 - o + o * sin( ( u - 0.5 ) * 3.1415927 );
    return sgn > 0.0 ? along - 0.5 : 0.5 - along;
  #else
    return p.y;
  #endif
}
void stickSwept( vec3 p, vec3 n, out vec3 q, out vec3 m ) {
  q = p;
  m = n;
  #ifdef USE_INSTANCING
    if ( dot( stickBend.xyz, stickBend.xyz ) < 1e-12 ) return;
    float sgn = stickBend.w >= 0.0 ? 1.0 : -1.0;
    float u = sgn > 0.0 ? p.y + 0.5 : 0.5 - p.y;
    // (in the instance's own frame, as its matrix lays it out: along the bond toward the lone atom, out to the line, and square to both)
    mat3 im = mat3( instanceMatrix );
    vec3 axis = im * vec3( 0.0, 1.0, 0.0 );
    float len = length( axis );
    vec3 ah = axis / len * sgn;
    vec3 by = im * stickBend.xyz;
    float off = length( by );
    vec3 l = -by / off;
    vec3 bn = normalize( cross( ah, l ) );
    float rr = length( im * vec3( 1.0, 0.0, 0.0 ) );
    vec3 xz = im * vec3( p.x, 0.0, p.z ) / rr;
    // (straight on the stick's first half, to as far short of the atom as it stands off the axis; round a quarter circle on its second)
    float o = off / len;
    float straight = 1.0 - o;
    float across = 1.0, along = 2.0 * u * straight, da = 0.0, dl = 2.0 * straight;
    if ( u > 0.5 ) {
      float th = ( u - 0.5 ) * 3.1415927;
      across = cos( th );
      along = straight + o * sin( th );
      da = -3.1415927 * sin( th );
      dl = 3.1415927 * o * cos( th );
    }
    vec3 t = normalize( dl * len * ah + da * off * l );
    vec3 nn = normalize( -da * off * ah + dl * len * l );
    // (the centre from the straight line's middle; the ring round it, square to the curve)
    vec3 c = ( along - 0.5 ) * len * ah + ( across - 1.0 ) * off * l;
    q = inverse( im ) * ( c + rr * ( dot( xz, l ) * nn + dot( xz, bn ) * bn ) );
    vec3 sn = im * vec3( n.x, 0.0, n.z );
    float sl = length( sn );
    vec3 side = sl > 1e-9 ? sn / sl : vec3( 0.0 );
    vec3 w = dot( side, l ) * sl * nn + dot( side, bn ) * sl * bn + n.y * sgn * t * len;
    m = dot( w, w ) > 1e-12 ? inverse( im ) * normalize( w ) : n;
  #endif
}
`;

/** A stick material's shader, its sticks bent where their instances say. */
export function withStickBend(shader: { vertexShader: string }): void {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${STICK_BEND_GLSL}`)
    .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n{ vec3 sq; vec3 sm; stickSwept( position, objectNormal, sq, sm ); objectNormal = sm; }")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\n{ vec3 sq; vec3 sm; stickSwept( position, normal, sq, sm ); transformed = sq; }");
}

/** How many rings along a stick that bends, and so how smooth its curve is. */
const RINGS = 16;

/** A stick of radius 1 and length 1 along y, centred, with `segments` round it - its rings close together toward its ends, where a line bends. */
export function bentStickGeometry(segments: number): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(1, 1, 1, segments, RINGS);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    // (from evenly spaced, to closer toward either end: half a cosine's turn)
    const t = pos.getY(i) + 0.5;
    pos.setY(i, (1 - Math.cos(Math.PI * t)) / 2 - 0.5);
  }
  pos.needsUpdate = true;
  return g;
}

const turn = new THREE.Quaternion();
const dir = new THREE.Vector3();
const local = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Each line's bend in its own instance's units - as `stickBend` takes it -
 * its stick `extra` thicker than the line (a highlight round it); none for
 * a line that does not bend.
 */
export function stickBends(lines: readonly BondLine[], extra: number | ((k: number) => number) = 0): Float32Array {
  const out = new Float32Array(4 * lines.length);
  lines.forEach((l, k) => {
    out[4 * k + 3] = 1;
    const r = l.r + (l.r > 0 ? (typeof extra === "number" ? extra : extra(k)) : 0);
    if (!l.bend || r <= 0) return;
    dir.subVectors(l.b, l.a);
    const length = dir.length();
    if (length < 1e-9) return;
    turn.setFromUnitVectors(UP, dir.divideScalar(length)).invert();
    // (the instance is its stick's radius across and its length along)
    local.copy(l.bend.by).applyQuaternion(turn);
    out[4 * k] = local.x / r;
    out[4 * k + 1] = local.y / length;
    out[4 * k + 2] = local.z / r;
    out[4 * k + 3] = l.bend.atB ? 1 : -1;
  });
  return out;
}

/**
 * A line as straight pieces following its curve, for what draws sticks
 * straight only (a picture's vector fallback, a render plugin): `pieces` of
 * them round the turn, one over the straight part; the line itself where it
 * does not bend.
 */
export function bentPieces(l: BondLine, pieces = 8): BondLine[] {
  if (!l.bend || l.bend.by.lengthSq() < 1e-12) return [l];
  const bend = l.bend;
  // (from the straight end to the lone one)
  const from = bend.atB ? l.a : l.b;
  const to = bend.atB ? l.b : l.a;
  const off = bend.by.length() / Math.max(l.a.distanceTo(l.b), 1e-9);
  const at = (u: number) => {
    const c = bentCourse(u, off);
    return from.clone().lerp(to, c.along).addScaledVector(bend.by, 1 - c.across);
  };
  // (straight to where it turns, then in pieces round the turn)
  const us = [0, 0.5, ...Array.from({ length: pieces }, (_, i) => 0.5 + (0.5 * (i + 1)) / pieces)];
  return us.slice(1).map((u, i) => ({ a: at(us[i]), b: at(u), r: l.r }));
}
