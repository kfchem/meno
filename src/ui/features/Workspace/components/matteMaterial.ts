/**
 * The material a film on a transparent background is drawn with on the page
 * (docs/RENDER.md, *A film on a transparent background*): its video's two
 * halves joined - its picture, its colours already multiplied by their
 * alpha, and its alpha, grey (lib/picture/matte) - and laid over what lies
 * under it as such a colour is: the colour, and what is under it by one
 * less the alpha (premultiplied). The video is played and uploaded as any
 * film's is (./pictureTextures): nothing more is decoded.
 */
import * as THREE from "three";
import { matteHalves, type Matte } from "../../../../lib/picture/matte";

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// (the texture is read as sRGB, turned linear: the alpha's grey is turned back to the value it was written as; the colour is
// turned back as it is drawn, by the page's output - so what is blended is what the film holds)
const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec4 colourAt;
uniform vec4 alphaAt;
uniform vec2 inset;
varying vec2 vUv;
void main() {
  vec2 q = clamp(vUv, inset, vec2(1.0) - inset);
  vec3 colour = texture2D(map, colourAt.xy + q * colourAt.zw).rgb;
  float alpha = sRGBTransferOETF(vec4(texture2D(map, alphaAt.xy + q * alphaAt.zw).ggg, 1.0)).g;
  gl_FragColor = vec4(colour, alpha);
  #include <colorspace_fragment>
}
`;

/** The film's halves for a video `width` by `height` pixels, as the shader takes them. */
export function matteUniforms(matte: Matte, width: number, height: number) {
  const { colour, alpha, inset } = matteHalves(matte, width, height);
  return {
    colourAt: new THREE.Vector4(colour.x, colour.y, colour.w, colour.h),
    alphaAt: new THREE.Vector4(alpha.x, alpha.y, alpha.w, alpha.h),
    inset: new THREE.Vector2(inset[0], inset[1]),
  };
}

/** A film's material, its alpha from its video's other half; its halves set again as its video's size is known. */
export function matteMaterial(texture: THREE.Texture, matte: Matte): THREE.ShaderMaterial {
  const video = texture.image as HTMLVideoElement | undefined;
  const at = matteUniforms(matte, video?.videoWidth || 2, video?.videoHeight || 2);
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, colourAt: { value: at.colourAt }, alphaAt: { value: at.alphaAt }, inset: { value: at.inset } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    // (its colour already multiplied by its alpha: blended one, and one less the alpha)
    premultipliedAlpha: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
}
