import * as THREE from "three";
import { fadeUniforms, withFade, type FadeUniforms } from "./occlusionMaterial";

/**
 * The line a style draws round every ball and every stick (lib/chem/style3d
 * `outline`): each instance drawn again, only its back, pushed out along
 * its normal by `width` in the camera's space - a style's pixels over the
 * camera's zoom, as wide on the screen at any zoom - in one flat colour.
 * Where the ball or stick is, its front hides it; round its edge, and where
 * it passes in front of another, the rim shows. It shares the balls' or
 * sticks' own instances (their matrices), so it costs a draw call and their
 * triangles again, and no work on the CPU however many there are. Faded
 * with depth as they are (`withFade`).
 */
export function outlineMaterial(): { material: THREE.MeshBasicMaterial; width: { value: number }; fade: FadeUniforms } {
  const width = { value: 0 };
  const fade = fadeUniforms();
  const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true, toneMapped: false });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = width;
    withFade(shader, fade);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float outlineWidth;").replace(
      "#include <project_vertex>",
      `vec4 mvPosition = vec4( transformed, 1.0 );
      vec3 rimNormal = normal;
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
  };
  material.customProgramCacheKey = () => "outline-3d";
  return { material, width, fade };
}
