import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { ALPHA, COLORS } from "../../../theme/colors";
import { SHADE } from "./selectionShade";
import { HELD_FADE_MS, holdProgress, type Held } from "./held";

// language=GLSL
const VERTEX = /* glsl */ `
uniform vec2 uMiddle;
uniform vec2 uSize;
varying vec2 vAt;
void main() {
  vAt = uMiddle + position.xy * uSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
// language=GLSL
const FRAGMENT = /* glsl */ `
uniform vec2 uAt;
uniform float uReach;
uniform float uSoft;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vAt;
void main() {
  float a = uOpacity * (1.0 - smoothstep(uReach - uSoft, uReach, distance(vAt, uAt)));
  if (a <= 0.0) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

/**
 * A thing on the page - a PDF, a picture - taken hold of, lit as a
 * structure is: the selection's shade, over the box `b`, spreading out from
 * `at`, where it is held, as the press is held - reaching all of it just as
 * it is taken hold of - and going once it is let go. `b` and `at` are in
 * the frame of what it is drawn in, turned with it; `z`, how far over it.
 */
export function HeldLight({ b, at, held, now, z = 0.45 }: { b: { x0: number; x1: number; y0: number; y1: number }; at: { x: number; y: number }; held: Held; now: number; z?: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uMiddle: { value: new THREE.Vector2() },
          uSize: { value: new THREE.Vector2(1, 1) },
          uAt: { value: new THREE.Vector2() },
          uReach: { value: 0 },
          uSoft: { value: 1 },
          uOpacity: { value: 0 },
          uColor: { value: new THREE.Color(COLORS.highlight) },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  // (the farthest of it reached just as it is taken hold of)
  const far = Math.max(...[b.x0, b.x1].flatMap((x) => [b.y0, b.y1].map((y) => Math.hypot(x - at.x, y - at.y))));
  const u = held.done ? 1 : holdProgress(held.start, now, held.let);
  const soft = 0.12 * far;
  const fade = held.let == null ? 1 : Math.max(0, 1 - (now - held.let) / HELD_FADE_MS);
  const middle = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  material.uniforms.uMiddle.value.set(middle.x, middle.y);
  material.uniforms.uSize.value.set(b.x1 - b.x0, b.y1 - b.y0);
  material.uniforms.uAt.value.set(at.x, at.y);
  material.uniforms.uReach.value = (far + soft) * (1 - (1 - u) ** 3);
  material.uniforms.uSoft.value = soft;
  material.uniforms.uOpacity.value = ALPHA.highlight * SHADE * fade;
  if (fade <= 0) return null;
  return (
    <mesh position={[middle.x, middle.y, z]} scale={[b.x1 - b.x0, b.y1 - b.y0, 1]} material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
