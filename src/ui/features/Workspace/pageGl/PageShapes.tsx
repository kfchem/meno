import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CONTROL_SIZE_GLSL, fillShapesGeometry, packShapes, type Packed, type Shape } from "./shapes";

/**
 * Where the page's WebGL is drawn among the rest: after the drawing, the
 * marks' boxes (`MarkBoxes2D`, 40) and the molecules in 3D (components/
 * Molecule3DView `OVER_PAGE`, 100, and their joints after them) - over
 * them all, as the page's HTML lay over the canvas. Drawn without its depth
 * tested, it is not hidden by a molecule drawn before it.
 */
export const PAGE_GL_ORDER = 110;

// language=GLSL
const VERTEX = /* glsl */ `
attribute vec2 aCentre;
attribute vec2 aHalf;
attribute vec2 aRadiusLine;
attribute vec3 aControl;
attribute vec4 aFill;
attribute vec4 aStroke;
attribute vec2 aDash;
attribute vec2 aKindOpacity;
attribute vec3 aShadow;
uniform float uScreen;
uniform float uDevice;
varying vec2 vP;
varying vec2 vHalf;
varying float vRadius;
varying float vLine;
varying vec4 vFill;
varying vec4 vStroke;
varying vec2 vDash;
varying float vOpacity;
varying vec3 vShadow;
void main() {
  vec2 hs = aHalf;
  float radius = aRadiusLine.x;
  // (a line never under a device pixel; none where there is none)
  float line = aRadiusLine.y > 0.0 ? max(aRadiusLine.y, uDevice) : 0.0;
  if (aControl.z > 0.5) {
    // (a control, as a hand needs it: units controlSize, controlLine)
    float d = ${CONTROL_SIZE_GLSL};
    hs = vec2(d * 0.5);
    radius = d * 0.5;
    line = aStroke.a > 0.0 ? max(min(uScreen, d / 5.0), uDevice) : 0.0;
  }
  if (aKindOpacity.x > 0.5) radius = min(hs.x, hs.y);
  radius = min(radius, min(hs.x, hs.y));
  // (room for the edge's smoothing past the shape, and for its shadow)
  vec2 ext = hs + vec2(2.0 * uDevice + aShadow.x + abs(aShadow.y));
  vec2 p = position.xy * 2.0 * ext;
  vP = p;
  vHalf = hs;
  vRadius = radius;
  vLine = line;
  vFill = aFill;
  vStroke = aStroke;
  vDash = aDash;
  vOpacity = aKindOpacity.y;
  vShadow = aShadow;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(aCentre + p, 0.0, 1.0);
}
`;

// language=GLSL
const FRAGMENT = /* glsl */ `
uniform float uDevice;
varying vec2 vP;
varying vec2 vHalf;
varying float vRadius;
varying float vLine;
varying vec4 vFill;
varying vec4 vStroke;
varying vec2 vDash;
varying float vOpacity;
varying vec3 vShadow;
const float HALF_PI = 1.5707963;
float roundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
// (how much of a device pixel lies inside an edge at distance d: smoothed over one)
float cover(float d) {
  return clamp(0.5 - d / uDevice, 0.0, 1.0);
}
// (how far round the edge from the middle of the top or bottom side, in this quarter: the dashes mirrored about the axes)
float along(vec2 p, vec2 b, float r) {
  vec2 q = abs(p);
  vec2 c = b - vec2(r);
  float top = c.x;
  float arc = r * HALF_PI;
  if (q.x > c.x && q.y > c.y) return top + r * atan(q.x - c.x, q.y - c.y);
  if (q.x <= c.x && (q.y > c.y || b.y - q.y < b.x - q.x)) return q.x;
  return top + arc + (c.y - q.y);
}
void main() {
  float d = roundBox(vP, vHalf, vRadius);
  float inside = cover(d);
  float within = vLine > 0.0 ? cover(d + vLine) : inside;
  float ink = vStroke.a * (inside - within);
  if (vDash.x > 0.0) {
    float s = mod(along(vP, vHalf, vRadius), vDash.x + vDash.y);
    ink *= clamp((vDash.x - s) / uDevice + 0.5, 0.0, 1.0) * clamp(s / uDevice + 0.5, 0.0, 1.0);
  }
  float fill = vFill.a * within;
  // (the line over the fill)
  float a = ink + fill * (1.0 - ink);
  vec3 rgb = a > 0.0 ? (vStroke.rgb * ink + vFill.rgb * fill * (1.0 - ink)) / a : vec3(0.0);
  // (its shadow under both, black, outside the box as CSS's box-shadow is drawn: never through it)
  if (vShadow.z > 0.0) {
    float ds = roundBox(vP + vec2(0.0, vShadow.y), vHalf, vRadius);
    float shade = vShadow.z * (1.0 - smoothstep(-vShadow.x, vShadow.x, ds)) * (1.0 - inside);
    rgb = a + shade * (1.0 - a) > 0.0 ? rgb * a / (a + shade * (1.0 - a)) : rgb;
    a = a + shade * (1.0 - a);
  }
  if (a * vOpacity <= 0.0) discard;
  gl_FragColor = vec4(rgb, a * vOpacity);
  #include <colorspace_fragment>
}
`;

/**
 * Boxes and rings on the page (`shapes`), drawn by WebGL as one instanced
 * mesh over the drawing: in the page's units, their lines in page pixels
 * never thinner than a device pixel, a control as large as a hand needs it -
 * the zoom told to the shader each frame, nothing packed again for it.
 */
export default function PageShapes({ items, order = PAGE_GL_ORDER }: { items: readonly Shape[]; order?: number }) {
  const { gl, camera, invalidate } = useThree();
  const packed = useRef<Packed | null>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uScreen: { value: 1 }, uDevice: { value: 1 } },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const geometry = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    return g;
  }, []);
  useEffect(
    () => () => {
      material.dispose();
      geometry.dispose();
    },
    [material, geometry],
  );
  useEffect(() => {
    const before = packed.current;
    const now = packShapes(items, before ?? undefined);
    packed.current = now;
    fillShapesGeometry(geometry, now);
    invalidate();
  }, [items, geometry, invalidate]);
  useFrame(() => {
    const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
    material.uniforms.uScreen.value = 1 / zoom;
    material.uniforms.uDevice.value = 1 / (zoom * gl.getPixelRatio());
  });
  return <mesh geometry={geometry} material={material} renderOrder={order} frustumCulled={false} />;
}
