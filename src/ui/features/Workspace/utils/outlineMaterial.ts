import * as THREE from "three";
import { fadeUniforms, withFade, type FadeUniforms } from "./occlusionMaterial";
import { menoShader } from "./menoShader";
import { STICK_BEND_GLSL } from "./stickBend";

/**
 * The line a style draws round every ball and every stick (lib/chem/style3d
 * `outline`): each instance drawn again, only its back, pushed out along
 * its normal by `width` in the camera's space - a style's ångströms in
 * the molecule's units, never under its least pixels (lib/chem/style3d
 * `lineWidth`) - in one flat colour.
 * Where the ball or stick is, its front hides it; round its edge, and where
 * it passes in front of another, the rim shows. It shares the balls' or
 * sticks' own instances (their matrices), so it costs a draw call and their
 * triangles again, and no work on the CPU however many there are. Faded
 * with depth as they are (`withFade`). For sticks that may bend
 * (`sticks`), bent as they are (./stickBend).
 */
export function outlineMaterial(sticks = false): { material: THREE.MeshBasicMaterial; width: { value: number }; fade: FadeUniforms } {
  const width = { value: 0 };
  const fade = fadeUniforms();
  const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true, toneMapped: false });
  menoShader(material, sticks ? "outline-3d-sticks" : "outline-3d", (shader) => {
    shader.uniforms.outlineWidth = width;
    withFade(shader, fade);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\nuniform float outlineWidth;\n${sticks ? STICK_BEND_GLSL : ""}`).replace(
      "#include <project_vertex>",
      `vec3 rimNormal = normal;
      ${sticks ? "{ vec3 sq; vec3 sm; stickSwept( transformed, normal, sq, sm ); transformed = sq; rimNormal = sm; }" : ""}
      vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        rimNormal = mat3( instanceMatrix ) * rimNormal;
      #endif
      mvPosition = modelViewMatrix * mvPosition;
      // (an instance drawn at no size - an atom its look leaves out - has no normal, and no rim)
      vec3 rimOut = mat3( modelViewMatrix ) * rimNormal;
      mvPosition.xyz += ( dot( rimOut, rimOut ) > 0.0 ? normalize( rimOut ) : vec3( 0.0 ) ) * outlineWidth;
      gl_Position = projectionMatrix * mvPosition;`,
    );
  });
  return { material, width, fade };
}
