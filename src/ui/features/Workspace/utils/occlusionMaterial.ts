import * as THREE from "three";
import { ballNumberUniforms, DIGIT_CELL, digitAtlas, NUMBER_DIGITS_MOST, NUMBER_HEIGHT, NUMBER_WIDTH_MOST, type BallNumberUniforms } from "./atomNumbers";
import { menoShader } from "./menoShader";
import { withStickBend } from "./stickBend";
import { FADE_MOST } from "../../../../lib/chem/style3d";

/** How much of the light from above right the hollows keep out, beside all the light from all round. */
export const OCCLUSION_DIRECT = 0.3;

/** What a material taught by `occludedMaterial` is set by: its uniforms. */
export type Occluded = { strength: { value: number }; direct: { value: number }; fade: FadeUniforms; byAtom: { value: number }; lines: BallLineUniforms; numbers: BallNumberUniforms };

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
 *
 * An atom's ball, besides, with lines on it (a style's `ballLines`): great
 * circles about the molecule's own axes - where its normal, in the
 * molecule's frame (a ball's instance is never turned on its own), runs
 * square to an axis - `lines.width` wide in the balls' own units (each
 * ball's radius its instance's scale), so that they grow and shrink with
 * the molecule, but never under `lines.least` screen pixels (by the
 * normal's change across a pixel, `fwidth`) - each axis's `lines.amount` of
 * the way there (x, y, z), in `lines.colour` (the screen's sRGB), on the
 * balls whose instance says so (`ballLined`, 1 or 0).
 */
export function occludedMaterial(
  material: THREE.MeshStandardMaterial,
  kind: "atoms" | "bonds",
  // (sticks that may bend - ./stickBend - drawn apart, so that straight ones never pay for it; sharing another's uniforms, as their twin)
  o: { bend?: boolean; like?: Occluded } = {},
): Occluded {
  const strength = o.like?.strength ?? { value: 0 };
  const direct = o.like?.direct ?? { value: 0 };
  const fade = o.like?.fade ?? fadeUniforms();
  const byAtom = o.like?.byAtom ?? { value: 0 };
  const lines: BallLineUniforms = o.like?.lines ?? { amount: { value: new THREE.Vector3() }, width: { value: 0 }, least: { value: 0.5 }, colour: { value: new THREE.Color() } };
  const numbers: BallNumberUniforms = o.like?.numbers ?? ballNumberUniforms();
  const bend = kind === "bonds" && !!o.bend;
  menoShader(material, bend ? "occluded-bent-bonds" : `occluded-${kind}`, (shader) => {
    shader.uniforms.occlusionStrength = strength;
    shader.uniforms.occlusionDirect = direct;
    withFade(shader, fade);
    if (kind === "atoms") {
      shader.uniforms.ballLineAmount = lines.amount;
      shader.uniforms.ballLineWidth = lines.width;
      shader.uniforms.ballLineLeast = lines.least;
      shader.uniforms.ballLineColour = lines.colour;
      numbers.atlas.value ??= digitAtlas();
      shader.uniforms.numbersShown = numbers.shown;
      shader.uniforms.numbersAtlas = numbers.atlas;
      shader.uniforms.numbersPxPer = numbers.pxPer;
      shader.uniforms.numbersLeast = numbers.least;
      shader.uniforms.numbersMost = numbers.most;
      withBallNumbers(shader);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float ballLined;\nvarying vec3 vBallN;\nvarying float vBallLined;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBallN = normal;\n// (lined or not, and how large: its radius where it is, none where not)\n#ifdef USE_INSTANCING\nvBallLined = ballLined > 0.5 ? max( length( instanceMatrix[ 0 ].xyz ), 1e-6 ) : 0.0;\n#else\nvBallLined = ballLined;\n#endif");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 ballLineAmount;\nuniform float ballLineWidth;\nuniform float ballLineLeast;\nuniform vec3 ballLineColour;\nvarying vec3 vBallN;\nvarying float vBallLined;")
        .replace(
          "#include <dithering_fragment>",
          `#include <dithering_fragment>
          if ( vBallLined > 0.0 ) {
            vec3 q = normalize( vBallN );
            float cover = 0.0;
            for ( int i = 0; i < 3; i++ ) {
              float c = q[ i ];
              float w = max( fwidth( c ), 1e-6 );
              // (half the line's width on the ball, as its normal goes - a great circle's arc over the ball's radius - and never under half the least pixels)
              float halfWidth = max( ballLineWidth * 0.5 / vBallLined, ballLineLeast * 0.5 * w );
              cover = max( cover, clamp( ( halfWidth - abs( c ) ) / w + 0.5, 0.0, 1.0 ) * ballLineAmount[ i ] );
            }
            gl_FragColor.rgb = mix( gl_FragColor.rgb, ballLineColour, cover );
          }`,
        );
    }
    if (kind === "bonds") {
      shader.uniforms.bondByAtom = byAtom;
      // (a line curving in to a lone atom: bent where its instance says - ./stickBend)
      if (bend) withStickBend(shader);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 bondEndA;\nattribute vec3 bondEndB;\nvarying vec3 vBondEndA;\nvarying vec3 vBondEndB;\nvarying float vBondAlong;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>\nvBondEndA = bondEndA;\nvBondEndB = bondEndB;\nvBondAlong = ${bend ? "stickAlongY( position )" : "position.y"};`);
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
        : `vOpen = mix( occlusionEnds.x, occlusionEnds.y, ${bend ? "stickAlongY( position )" : "position.y"} + 0.5 );`;
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
  });
  material.needsUpdate = true;
  return { strength, direct, fade, byAtom, lines, numbers };
}

/**
 * A ball's number drawn on it (./atomNumbers): its digits facing the
 * viewer, upright - by the ball's normal in the camera's space, so that
 * they never turn with the ball nor shake as it turns - where its instance
 * puts them (`ballNumberPlace`: x and y from its middle as seen, in its
 * radius's units, how large, a share of their full size, and how far
 * shown, 0 to 1), in the part of it not behind another ball or a stick.
 * Drawn flat over it, last of all - the ball's shading under them, never
 * on them, so that they read as well in its shade as in its light. Their
 * ink dark on a light ball, white on a dark one; faded out where a digit would be under
 * `numbersLeast` pixels high or squeezed to under half its size, and by
 * `numbersShown`. As high as `NUMBER_HEIGHT` of the ball's radius, never
 * over `numbersMost` in the balls' own units, and all of them no wider than
 * `NUMBER_WIDTH_MOST`.
 */
function withBallNumbers(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute float ballNumber;\nattribute vec4 ballNumberPlace;\nuniform float numbersPxPer;\nuniform float numbersMost;\nvarying float vNumber;\nvarying vec4 vNumberPlace;\nvarying float vNumberPx;\nvarying float vNumberH;",
    )
    .replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      vNumber = ballNumber;
      vNumberPlace = ballNumberPlace;
      {
        // (the ball's radius in its own units, and on the screen, in pixels)
        #ifdef USE_INSTANCING
        float r = length( instanceMatrix[ 0 ].xyz );
        vNumberPx = length( ( modelViewMatrix * instanceMatrix * vec4( 1.0, 0.0, 0.0, 0.0 ) ).xyz ) * numbersPxPer;
        #else
        float r = 1.0;
        vNumberPx = length( ( modelViewMatrix * vec4( 1.0, 0.0, 0.0, 0.0 ) ).xyz ) * numbersPxPer;
        #endif
        vNumberH = min( ${NUMBER_HEIGHT.toFixed(3)}, numbersMost / max( r, 1e-6 ) );
      }`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
      uniform float numbersShown;
      uniform sampler2D numbersAtlas;
      uniform float numbersLeast;
      varying float vNumber;
      varying vec4 vNumberPlace;
      varying float vNumberPx;
      varying float vNumberH;
      // (how much of a point on a ball, at p in its radius's units from where its number stands, the number covers)
      float ballNumberCover( vec2 p, vec2 dx, vec2 dy ) {
        float num = floor( vNumber + 0.5 );
        float digits = num < 10.0 ? 1.0 : num < 100.0 ? 2.0 : num < 1000.0 ? 3.0 : num < 10000.0 ? 4.0 : 0.0;
        if ( digits < 1.0 ) return 0.0;
        float h = min( vNumberH, ${NUMBER_WIDTH_MOST.toFixed(3)} / ( digits * ${DIGIT_CELL.toFixed(3)} ) ) * vNumberPlace.z;
        float shown = numbersShown * vNumberPlace.w * smoothstep( 0.4, 0.6, vNumberPlace.z ) * smoothstep( numbersLeast * 0.75, numbersLeast * 1.25, h * 0.7 * vNumberPx );
        if ( shown <= 0.0 ) return 0.0;
        float x = p.x / ( h * ${DIGIT_CELL.toFixed(3)} ) + digits * 0.5;
        // (the digits' picture is the right way up: its rows from the bottom)
        float y = 0.5 + p.y / h;
        if ( x < 0.0 || x >= digits || y < 0.0 || y > 1.0 ) return 0.0;
        float d = floor( x );
        // (its place's power of ten, multiplied out: exact, as pow is not)
        float place = 1.0;
        for ( int k = 0; k < ${NUMBER_DIGITS_MOST - 1}; k++ ) if ( float( k ) < digits - 1.0 - d ) place *= 10.0;
        float value = mod( floor( num / place + 1e-4 ), 10.0 );
        vec2 uv = vec2( ( value + fract( x ) ) / 10.0, y );
        vec2 per = vec2( 1.0 / ( 10.0 * h * ${DIGIT_CELL.toFixed(3)} ), 1.0 / h );
        return textureGrad( numbersAtlas, uv, dx * per, dy * per ).a * shown;
      }`,
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float ballNumberAt = 0.0;
      bool ballNumberWhite = false;
      if ( vNumber > 0.5 && numbersShown > 0.0 && vNumberPlace.z > 0.0 && vNumberPlace.w > 0.0 ) {
        vec3 nv = normalize( vNormal );
        // (where the point is seen, from where its number stands)
        vec2 p = nv.xy - vNumberPlace.xy;
        ballNumberAt = ballNumberCover( p, dFdx( p ), dFdy( p ) );
        // (white on a dark ball: its brightness by Rec. 709's weights, the blue the rest of one)
        ballNumberWhite = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 1.0 - 0.2126 - 0.7152 ) ) < ${INK_TURN.toFixed(3)};
      }`,
    )
    .replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
      if ( ballNumberAt > 0.0 ) gl_FragColor.rgb = mix( gl_FragColor.rgb, ballNumberWhite ? vec3( 0.97 ) : vec3( 0.1 ), ballNumberAt );`,
    );
}

/** Below this lightness of a ball's own colour (linear), its number is in white ink; above, dark. */
const INK_TURN = 0.4;

/** What draws the lines on a molecule's balls (`occludedMaterial`): each axis's circle's share (x, y, z), their width in the balls' own units, the least they are drawn on the screen in pixels, their colour (sRGB). */
export type BallLineUniforms = { amount: { value: THREE.Vector3 }; width: { value: number }; least: { value: number }; colour: { value: THREE.Color } };

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
