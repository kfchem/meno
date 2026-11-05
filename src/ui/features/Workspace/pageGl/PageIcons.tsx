import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { colourCss } from "../../../theme/colors";
import { atlasVersion, CELL, cellOf, pageIconDrawing, pageIconNames, type PageIcon } from "./icons";
import { PAGE_GL_ORDER } from "./PageShapes";
import { pagePx } from "./units";

/** What an icon is drawn in, in the atlas: white on clear - a mask, each icon tinted as it is drawn. */
const MASK = colourCss(255, 255, 255);

type Atlas = { texture: THREE.Texture; at: Map<string, { u0: number; v0: number; u1: number; v1: number }> };

let made: { version: number; atlas: Promise<Atlas> } | null = null;

/** The atlas of every icon (`icons`), drawn once - again only as icons are added - white on clear, each as the page's HTML draws it. */
function atlas(): Promise<Atlas> {
  if (made && made.version === atlasVersion) return made.atlas;
  const version = atlasVersion;
  const promise = (async () => {
    const names = pageIconNames();
    const side = cellOf(0, names.length).side;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = side * CELL;
    const ctx = canvas.getContext("2d")!;
    // (each icon's SVG as React would draw it, written out rather than drawn: nothing of the page's React touched -
    //  the writer fetched only now, a part of the app of its own)
    const { renderToStaticMarkup } = await import("react-dom/server");
    const at = new Map<string, { u0: number; v0: number; u1: number; v1: number }>();
    for (const [i, name] of names.entries()) {
      const draw = pageIconDrawing(name);
      if (!draw) continue;
      const svg = renderToStaticMarkup(draw(CELL)).replace(/currentColor/g, MASK);
      // (an image of it needs the SVG namespace said - Heroicons say it, the icons drawn here do not)
      const xml = /^<svg[^>]*\sxmlns=/.test(svg) ? svg : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      const img = new Image(CELL, CELL);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
      try {
        await img.decode();
      } catch {
        continue;
      }
      const c = cellOf(i, names.length);
      ctx.drawImage(img, Math.round(c.u0 * canvas.width), Math.round((1 - c.v1) * canvas.height), CELL, CELL);
      at.set(name, c);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    return { texture, at };
  })();
  made = { version, atlas: promise };
  return promise;
}

// language=GLSL
const VERTEX = /* glsl */ `
attribute vec2 aCentre;
attribute float aSize;
attribute vec4 aUv;
attribute vec4 aTint;
varying vec2 vUv;
varying vec4 vTint;
void main() {
  vUv = mix(aUv.xy, aUv.zw, position.xy + 0.5);
  vTint = aTint;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(aCentre + position.xy * aSize, 0.0, 1.0);
}
`;
// language=GLSL
const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec4 vTint;
void main() {
  float a = texture2D(uAtlas, vUv).a * vTint.a;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(vTint.rgb, a);
  #include <colorspace_fragment>
}
`;

const colour = new THREE.Color();

/**
 * The page's icons (`icons`), drawn by WebGL from one atlas as one
 * instanced mesh, tinted each its own colour, over the page's shapes - none
 * until the atlas is drawn, a frame or two after the first is asked for.
 */
export default function PageIcons({ items, order = PAGE_GL_ORDER + 1 }: { items: readonly PageIcon[]; order?: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const [ready, setReady] = useState<Atlas | null>(null);
  useEffect(() => {
    let live = true;
    void atlas().then((a) => {
      if (!live) return;
      setReady(a);
      invalidate();
    });
    return () => {
      live = false;
    };
  }, [invalidate]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uAtlas: { value: null } },
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
    if (!ready) return;
    material.uniforms.uAtlas.value = ready.texture;
    const shown = items
      .map((t, i) => [t, i] as const)
      .filter(([t]) => ready.at.has(t.icon))
      .sort((a, b) => (a[0].z ?? 0) - (b[0].z ?? 0) || a[1] - b[1])
      .map(([t]) => t);
    const n = shown.length;
    const centre = new Float32Array(n * 2);
    const size = new Float32Array(n);
    const uv = new Float32Array(n * 4);
    const tint = new Float32Array(n * 4);
    shown.forEach((t, i) => {
      const c = ready.at.get(t.icon)!;
      centre.set([t.x, t.y], i * 2);
      size[i] = pagePx(t.sizePx);
      uv.set([c.u0, c.v0, c.u1, c.v1], i * 4);
      colour.set(t.color);
      tint.set([colour.r, colour.g, colour.b, t.opacity ?? 1], i * 4);
    });
    geometry.setAttribute("aCentre", new THREE.InstancedBufferAttribute(centre, 2));
    geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 1));
    geometry.setAttribute("aUv", new THREE.InstancedBufferAttribute(uv, 4));
    geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 4));
    geometry.instanceCount = n;
    invalidate();
  }, [items, ready, geometry, material, invalidate]);
  return ready ? <mesh geometry={geometry} material={material} renderOrder={order} frustumCulled={false} /> : null;
}
