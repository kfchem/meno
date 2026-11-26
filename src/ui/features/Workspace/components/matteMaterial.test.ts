import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { matteMaterial } from "./matteMaterial";

// (a video's texture holds its frames' own values, as three.js uploads every video: what the shader does with them decides
// whether a film on a transparent background is drawn in the colours a picture of it is; the shader is the same whatever
// texture it is given, so a bare one stands in for the video, which needs a document)
const shader = () => {
  const material = matteMaterial(new THREE.Texture(), "below");
  return material.fragmentShader.replace(/\s+/g, " ");
};

describe("a film on a transparent background, as the page draws it", () => {
  it("turns its picture's colour linear once, as it is read, and back once, by the page's output", () => {
    const s = shader();
    expect(s.match(/sRGBTransferEOTF/g)).toHaveLength(1);
    expect(s).toContain("sRGBTransferEOTF(texture2D(map, colourAt.xy + q * colourAt.zw)).rgb");
    expect(s.match(/#include <colorspace_fragment>/g)).toHaveLength(1);
  });

  it("takes its alpha's grey as it was written: through no transfer", () => {
    const s = shader();
    expect(s).toContain("float alpha = texture2D(map, alphaAt.xy + q * alphaAt.zw).g;");
    expect(s).not.toContain("sRGBTransferOETF");
  });

  it("lays its colour, already multiplied by its alpha, over what is under it", () => {
    const m = matteMaterial(new THREE.Texture(), "right");
    expect(m.premultipliedAlpha).toBe(true);
    expect(m.blending).toBe(THREE.NormalBlending);
    expect(m.toneMapped).toBe(false);
  });
});
