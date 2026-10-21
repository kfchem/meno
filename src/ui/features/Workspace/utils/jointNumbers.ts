/**
 * Atom numbers where an atom has no ball to carry them (./atomNumbers):
 * Sticks, whose atoms are where the sticks meet - each number drawn at its
 * atom, facing the viewer, just in front of where the sticks meet, in the
 * digits the balls are drawn with (`digitAtlas`), ink dark on a light atom
 * and white on a dark one as on a ball, ringed in the other so that it reads
 * over the sticks and the page. All of a molecule's in one mesh, one draw
 * - a molecule of thousands of atoms is drawn as fast as one of ten.
 * Faded out, as on a ball, where its digits would be under `NUMBER_LEAST_PX`
 * high, and by how far each is shown.
 */
import * as THREE from "three";
import { DIGIT_CELL, digitAtlas, NUMBER_DIGITS_MOST, NUMBER_LEAST_PX } from "./atomNumbers";

/** How high a number's digits stand where the sticks meet, in ångströms: as a carbon's on its ball, ball and stick. */
export const JOINT_NUMBER_A = 0.27;
/** How far the ring round the digits reaches, as a share of their height. */
const RING = 0.12;
/** Below this lightness of an atom's own colour (linear), its number is in white ink; above, dark - as on a ball. */
const INK_TURN = 0.4;

/** What draws them: the view's pixels to one of the camera's units, the digits' height and how far in front of the atom they stand, in the molecule's units, and how far all are shown. */
export type JointNumberUniforms = {
  pxPer: { value: number };
  height: { value: number };
  lift: { value: number };
  shown: { value: number };
  atlas: { value: THREE.Texture | null };
};

/** An instanced mesh of `n` numbers, none shown yet. */
export function jointNumbersMesh(n: number): THREE.InstancedMesh {
  const uniforms: JointNumberUniforms = { pxPer: { value: 1 }, height: { value: 1 }, lift: { value: 0 }, shown: { value: 0 }, atlas: { value: digitAtlas() } };
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float jointNumber;
      attribute float jointShown;
      attribute vec3 jointInk;
      uniform float pxPer;
      uniform float height;
      uniform float lift;
      varying vec2 vUv;
      varying float vNumber;
      varying float vDigits;
      varying float vShown;
      varying float vPx;
      varying vec3 vInk;
      void main() {
        float num = floor( jointNumber + 0.5 );
        float digits = num < 10.0 ? 1.0 : num < 100.0 ? 2.0 : num < 1000.0 ? 3.0 : num < ${10 ** NUMBER_DIGITS_MOST}.0 ? ${NUMBER_DIGITS_MOST}.0 : 0.0;
        vNumber = num;
        vDigits = digits;
        vShown = jointShown;
        vInk = jointInk;
        vUv = position.xy + 0.5;
        // (at the atom, facing the viewer, a little in front of where the sticks meet)
        vec4 at = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        float scale = length( ( modelViewMatrix * vec4( 1.0, 0.0, 0.0, 0.0 ) ).xyz );
        float h = height * scale * ( 1.0 + 2.0 * ${RING.toFixed(3)} );
        at.z += lift * scale;
        at.xy += position.xy * vec2( h * ( digits * ${DIGIT_CELL.toFixed(3)} + 2.0 * ${RING.toFixed(3)} ) / ( 1.0 + 2.0 * ${RING.toFixed(3)} ), h );
        vPx = height * scale * pxPer;
        gl_Position = projectionMatrix * at;
        if ( digits < 1.0 || jointShown <= 0.0 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
      }`,
    fragmentShader: `
      uniform sampler2D atlas;
      uniform float shown;
      varying vec2 vUv;
      varying float vNumber;
      varying float vDigits;
      varying float vShown;
      varying float vPx;
      varying vec3 vInk;
      // (how much the digits cover at a point, in their own units: x across all of them, 0 to the count, y up one)
      // (sampled by how fast q moves across the screen, as on a ball - not by the digit's own coordinates, which jump at each digit's edge)
      // (read wherever it is asked, the point held within the digits and what lies outside them let go after, as on a ball: utils/occlusionMaterial)
      float cover( vec2 q, vec2 dx, vec2 dy ) {
        float inside = q.x >= 0.0 && q.x < vDigits && q.y >= 0.0 && q.y <= 1.0 ? 1.0 : 0.0;
        vec2 qc = vec2( clamp( q.x, 0.0, vDigits - 1e-4 ), clamp( q.y, 0.0, 1.0 ) );
        float d = floor( qc.x );
        float place = 1.0;
        for ( int k = 0; k < ${NUMBER_DIGITS_MOST - 1}; k++ ) if ( float( k ) < vDigits - 1.0 - d ) place *= 10.0;
        float value = mod( floor( vNumber / place + 1e-4 ), 10.0 );
        vec2 per = vec2( 0.1, 1.0 );
        return textureGrad( atlas, vec2( ( value + fract( qc.x ) ) / 10.0, qc.y ), dx * per, dy * per ).a * inside;
      }
      void main() {
        float ring = ${RING.toFixed(3)};
        // (from the quad, with room for the ring round the digits)
        vec2 q = vec2( vUv.x * ( vDigits * ${DIGIT_CELL.toFixed(3)} + 2.0 * ring ) - ring, vUv.y * ( 1.0 + 2.0 * ring ) - ring );
        q.x /= ${DIGIT_CELL.toFixed(3)};
        vec2 dx = dFdx( q );
        vec2 dy = dFdy( q );
        float ink = cover( q, dx, dy );
        float halo = ink;
        for ( int k = 0; k < 12; k++ ) {
          float t = float( k ) * 0.5236;
          halo = max( halo, cover( q + vec2( cos( t ) * ring / ${DIGIT_CELL.toFixed(3)}, sin( t ) * ring ), dx, dy ) );
        }
        float a = halo * vShown * shown * smoothstep( ${(NUMBER_LEAST_PX * 0.75).toFixed(2)}, ${(NUMBER_LEAST_PX * 1.25).toFixed(2)}, vPx * 0.7 );
        // (under one step of an 8-bit alpha: nothing to draw)
        if ( a < 1.0 / 255.0 ) discard;
        bool white = dot( vInk, vec3( 0.2126, 0.7152, 1.0 - 0.2126 - 0.7152 ) ) < ${INK_TURN.toFixed(3)};
        vec3 inkColour = white ? vec3( 0.97 ) : vec3( 0.1 );
        vec3 ringColour = white ? vec3( 0.1 ) : vec3( 0.97 );
        gl_FragColor = vec4( mix( ringColour, inkColour, ink / max( halo, 1e-4 ) ), a );
      }`,
  });
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, n));
  mesh.count = n;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  setJointAttributes(mesh, new Float32Array(n), new Float32Array(n), new Float32Array(3 * n));
  return mesh;
}

/** The mesh's uniforms (`jointNumbersMesh`). */
export function jointUniforms(mesh: THREE.InstancedMesh): JointNumberUniforms {
  return (mesh.material as THREE.ShaderMaterial).uniforms as unknown as JointNumberUniforms;
}

/** Each atom's number (0, none), how far shown (0 to 1) and its colour (linear RGB): set where they changed. */
export function setJointAttributes(mesh: THREE.InstancedMesh, numbers: Float32Array, shown: Float32Array, inks: Float32Array): void {
  const g = mesh.geometry;
  const put = (name: string, data: Float32Array, size: number) => {
    const was = g.getAttribute(name) as THREE.InstancedBufferAttribute | undefined;
    if (was && was.array.length === data.length) {
      const a = was.array as Float32Array;
      let same = true;
      for (let k = 0; k < data.length && same; k++) same = a[k] === data[k];
      if (same) return;
      a.set(data);
      was.needsUpdate = true;
    } else g.setAttribute(name, new THREE.InstancedBufferAttribute(Float32Array.from(data), size));
  };
  put("jointNumber", numbers, 1);
  put("jointShown", shown, 1);
  put("jointInk", inks, 3);
}

/** How far a molecule's numbers stand where the sticks meet rather than on its balls: its look's - 1, Sticks; 0, balls - gone over from one to the other as the look is. */
export function jointShare(primarySticks: boolean, secondarySticks: boolean, fill: number): number {
  const a = primarySticks ? 1 : 0;
  const b = secondarySticks ? 1 : 0;
  return a + (b - a) * Math.min(1, Math.max(0, fill));
}
