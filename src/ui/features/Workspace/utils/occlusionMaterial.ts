import * as THREE from "three";
import { FADE_MOST } from "../../../../lib/chem/style3d";

/** How much of the light from above right the hollows keep out, beside all the light from all round. */
export const OCCLUSION_DIRECT = 0.3;

/**
 * A lit material taught to shade by a molecule's ambient occlusion
 * (./occlusion3d): an atom's ball by the nine terms each instance carries
 * (`occlusionA`, `occlusionB`, `occlusionC`), weighed by the point of the
 * ball - its normal in the molecule's own axes - and a bond's stick by the
 * two numbers at its ends (`occlusionEnds`), from one end to the other. The
 * light from all round is taken by how open the point is, `strength` of the
 * way (0, none of it); the light from above right by `direct` of that.
 * Instances without the attributes are left open.
 *
 * And faded with depth (a style's `depthFade`, lib/chem/style3d `fadeAt`):
 * what lies further back in its molecule, between `fade.near` and
 * `fade.far` in the camera's depth, goes toward the page's colour by
 * `fade.amount` - none at 0.
 *
 * A bond's stick, besides, coloured by its atoms `byAtom` of the way (0,
 * its own colour; 1, each half its atom's): the colours at its two ends
 * (`bondEnds`, two instance attributes, its first atom's and its second's,
 * linear RGB), split at its middle.
 */
export function occludedMaterial(
  material: THREE.MeshStandardMaterial,
  kind: "atoms" | "bonds",
): { strength: { value: number }; direct: { value: number }; fade: FadeUniforms; byAtom: { value: number } } {
  const strength = { value: 0 };
  const direct = { value: 0 };
  const fade = fadeUniforms();
  const byAtom = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.occlusionStrength = strength;
    shader.uniforms.occlusionDirect = direct;
    withFade(shader, fade);
    if (kind === "bonds") {
      shader.uniforms.bondByAtom = byAtom;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 bondEndA;\nattribute vec3 bondEndB;\nvarying vec3 vBondEndA;\nvarying vec3 vBondEndB;\nvarying float vBondAlong;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBondEndA = bondEndA;\nvBondEndB = bondEndB;\nvBondAlong = position.y;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float bondByAtom;\nvarying vec3 vBondEndA;\nvarying vec3 vBondEndB;\nvarying float vBondAlong;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix( diffuseColor.rgb, vBondAlong < 0.0 ? vBondEndA : vBondEndB, bondByAtom );");
    }
    const attributes =
      kind === "atoms"
        ? "attribute vec4 occlusionA;\nattribute vec4 occlusionB;\nattribute float occlusionC;\n"
        : "attribute vec2 occlusionEnds;\n";
    const open =
      kind === "atoms"
        ? `{
            vec3 q = normalize( objectNormal );
            vOpen = occlusionA.x + occlusionA.y * q.y + occlusionA.z * q.z + occlusionA.w * q.x
              + occlusionB.x * q.x * q.y + occlusionB.y * q.y * q.z + occlusionB.z * ( 3.0 * q.z * q.z - 1.0 )
              + occlusionB.w * q.x * q.z + occlusionC * ( q.x * q.x - q.y * q.y );
          }`
        : "vOpen = mix( occlusionEnds.x, occlusionEnds.y, position.y + 0.5 );";
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${attributes}varying float vOpen;`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${open}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float occlusionStrength;\nuniform float occlusionDirect;\nvarying float vOpen;")
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
        {
          float open = mix( 1.0, clamp( vOpen, 0.0, 1.0 ), occlusionStrength );
          reflectedLight.indirectDiffuse *= open;
          reflectedLight.indirectSpecular *= open;
          reflectedLight.directDiffuse *= mix( 1.0, open, occlusionDirect );
          reflectedLight.directSpecular *= mix( 1.0, open, occlusionDirect );
        }`,
      );
  };
  material.customProgramCacheKey = () => `occluded-${kind}`;
  material.needsUpdate = true;
  return { strength, direct, fade, byAtom };
}

/** What a material faded with depth is given (`withFade`): where its molecule's front and back stand in the camera's depth, how far it fades, and toward what. */
export type FadeUniforms = { fadeNear: { value: number }; fadeFar: { value: number }; fadeAmount: { value: number }; fadePage: { value: THREE.Color } };

/** Faded with depth by nothing yet, toward white. */
export function fadeUniforms(): FadeUniforms {
  return { fadeNear: { value: 0 }, fadeFar: { value: -1 }, fadeAmount: { value: 0 }, fadePage: { value: new THREE.Color("#ffffff") } };
}

/**
 * A shader taught to fade with depth: its point's depth in the camera's
 * space carried to the fragment, and its colour taken toward the page's
 * as lib/chem/style3d `fadeAt` says - last of all, after its colour is
 * made the screen's.
 */
export function withFade(shader: THREE.WebGLProgramParametersWithUniforms, fade: FadeUniforms): void {
  Object.assign(shader.uniforms, fade);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying float vFadeZ;")
    .replace("#include <project_vertex>", "#include <project_vertex>\nvFadeZ = mvPosition.z;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform float fadeNear;\nuniform float fadeFar;\nuniform float fadeAmount;\nuniform vec3 fadePage;\nvarying float vFadeZ;")
    .replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
      {
        float d = clamp( ( fadeNear - vFadeZ ) / max( fadeNear - fadeFar, 1e-6 ), 0.0, 1.0 );
        float f = ${FADE_MOST.toFixed(4)} * clamp( fadeAmount, 0.0, 1.0 ) * d * d * ( 3.0 - 2.0 * d );
        gl_FragColor.rgb = mix( gl_FragColor.rgb, fadePage, f );
      }`,
    );
}

/** An atoms' instanced mesh given its terms (9 an atom): as three attributes the material reads. */
export function setAtomOcclusion(geometry: THREE.BufferGeometry, terms: Float32Array) {
  const n = terms.length / 9;
  const a = new Float32Array(4 * n);
  const b = new Float32Array(4 * n);
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) {
      a[4 * i + k] = terms[9 * i + k];
      b[4 * i + k] = terms[9 * i + 4 + k];
    }
    c[i] = terms[9 * i + 8];
  }
  geometry.setAttribute("occlusionA", new THREE.InstancedBufferAttribute(a, 4));
  geometry.setAttribute("occlusionB", new THREE.InstancedBufferAttribute(b, 4));
  geometry.setAttribute("occlusionC", new THREE.InstancedBufferAttribute(c, 1));
}

/** A bonds' instanced mesh given its lines' two numbers each. */
export function setBondOcclusion(geometry: THREE.BufferGeometry, ends: Float32Array) {
  geometry.setAttribute("occlusionEnds", new THREE.InstancedBufferAttribute(ends, 2));
}
