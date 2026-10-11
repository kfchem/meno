/**
 * Hollows shaded on the screen (a style's "Screen-space"): three.js's GTAO
 * - ground-truth ambient occlusion, worked out from the depth and the
 * normals of what is seen - and its Poisson denoise, run over the molecules
 * alone, never over the page. Their balls, sticks and ribbons are drawn once
 * more, into a pass of their own (`SCREEN_LAYER`), each with how deep its
 * shade is to be (`shadeWith`: none, for a molecule shaded per atom, which
 * then still hides what is behind it); the shade so worked out is laid over
 * them by a sheet the size of the screen, drawn just after them
 * (`renderOrder`), multiplying what is there - the page, where no molecule
 * is, by one. So the drawing on the page stays exactly as it is.
 */
import * as THREE from "three";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { WORLD_PER_ANGSTROM } from "./molecule3d";

/** The layer a molecule's balls, sticks and ribbons are drawn on for the shade's own pass. */
export const SCREEN_LAYER = 2;

/** How far round a tile of a picture its shade must see, in pixels at `pxPerWorld`: as far as the shade looks. */
export function shadeMarginPx(pxPerWorld: number): number {
  return Math.ceil(RADIUS * pxPerWorld) + 2;
}

/** On a canvas, by its renderer: each molecule's weight there - how deep its shade on the screen is - while it is on it. */
const shaders = new WeakMap<THREE.WebGLRenderer, Set<() => number>>();
export function screenShadersOn(gl: THREE.WebGLRenderer): Set<() => number> {
  let set = shaders.get(gl);
  if (!set) shaders.set(gl, (set = new Set()));
  return set;
}
/** Whether any molecule on a canvas is shaded on the screen now. */
export function screenShadeWanted(gl: THREE.WebGLRenderer): boolean {
  for (const w of screenShadersOn(gl)) if (w() > 0.003) return true;
  return false;
}

/** How far round a point the shade looks for what hides the sky from it, and how thick what it finds is taken to be, in the page's units. */
const RADIUS = 4 * WORLD_PER_ANGSTROM;
const THICKNESS = 2 * WORLD_PER_ANGSTROM;
/** How many samples the shade is worked out from at each point, and smoothed over. */
const SAMPLES = 32;

/**
 * The pass's own material: each point's normal as seen, and - its alpha -
 * how deep the shade of the molecule it belongs to is (`weight`, set for
 * each mesh as it is drawn: `shadeWith`). Instanced balls and sticks as
 * any mesh.
 */
function normalMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { weight: { value: 0 } },
    vertexShader: /* glsl */ `
      #include <common>
      varying vec3 vSeenNormal;
      void main() {
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <project_vertex>
        vSeenNormal = normalize( transformedNormal );
      }`,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform float weight;
      varying vec3 vSeenNormal;
      void main() {
        vec3 n = normalize( vSeenNormal ) * ( gl_FrontFacing ? 1.0 : - 1.0 );
        gl_FragColor = vec4( packNormalToRGB( n ), weight );
      }`,
    blending: THREE.NoBlending,
  });
}

/**
 * A mesh of a molecule's drawn into the shade's pass, `weight()` deep (0,
 * none): put on its layer, and telling the pass's material its weight as
 * it is drawn there.
 */
export function shadeWith(mesh: THREE.Mesh, weight: () => number) {
  mesh.layers.enable(SCREEN_LAYER);
  const before = mesh.onBeforeRender;
  mesh.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
    if ((material as THREE.ShaderMaterial).userData?.screenShade) {
      const m = material as THREE.ShaderMaterial;
      m.uniforms.weight.value = weight();
      m.uniformsNeedUpdate = true;
    }
    before.call(this, renderer, scene, camera, geometry, material, group);
  };
}

/** The sheet's material: what is drawn so far, times the shade where a molecule is (one elsewhere). */
function sheetMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { tShade: { value: null }, tSeen: { value: null }, tDepth: { value: null } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4( position.xy, 0.0, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tShade;
      uniform sampler2D tSeen;
      uniform sampler2D tDepth;
      varying vec2 vUv;
      void main() {
        // (nothing of a molecule's here, nothing shaded)
        float weight = texture2D( tDepth, vUv ).r < 0.99999 ? texture2D( tSeen, vUv ).a : 0.0;
        gl_FragColor = vec4( vec3( mix( 1.0, texture2D( tShade, vUv ).r, clamp( weight, 0.0, 1.0 ) ) ), 1.0 );
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.SrcColorFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
}

/**
 * The shade for one canvas, or one picture: the pass over the molecules
 * (`scene`'s objects on `SCREEN_LAYER`), and the sheet laying it over them,
 * which is to be in the scene, drawn after them (`sheet.renderOrder`).
 */
export class ScreenShade {
  readonly sheet: THREE.Mesh;
  private gtao: GTAOPass | null = null;
  private camera: THREE.Camera | null = null;
  private readonly material = normalMaterial();
  private readonly sheetMat = sheetMaterial();

  constructor(private readonly scene: THREE.Scene, renderOrder: number) {
    this.material.userData.screenShade = true;
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.sheetMat);
    this.sheet.frustumCulled = false;
    this.sheet.renderOrder = renderOrder;
    this.sheet.visible = false;
    this.sheet.raycast = () => {};
  }

  /**
   * The shade worked out as `camera` sees the scene now, `width` by
   * `height` pixels - or none, the sheet hidden. Before the scene is drawn.
   */
  update(renderer: THREE.WebGLRenderer, camera: THREE.Camera, width: number, height: number, on: boolean) {
    this.sheet.visible = on;
    if (!on) return;
    const ortho = (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
    // (a camera of the same kind as the one seeing it: GTAO is set for one or the other)
    if (!this.camera || (this.camera as THREE.OrthographicCamera).isOrthographicCamera !== ortho) {
      this.gtao?.dispose();
      this.camera = ortho ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera();
      this.gtao = new GTAOPass(this.scene, this.camera as THREE.PerspectiveCamera, width, height);
      this.gtao.normalMaterial.dispose();
      this.gtao.normalMaterial = this.material as unknown as THREE.MeshNormalMaterial;
      this.gtao.output = GTAOPass.OUTPUT.Off;
      this.gtao.updateGtaoMaterial({ radius: RADIUS, thickness: THICKNESS, distanceExponent: 1, scale: 1.5, samples: SAMPLES });
      // (smoothed across a ball's turning normal too: GTAO's grain shows most on small balls)
      this.gtao.updatePdMaterial({ lumaPhi: 5, depthPhi: 1, normalPhi: 0.5, radius: 16, rings: 4, samples: SAMPLES });
    }
    const gtao = this.gtao!;
    const own = this.camera;
    own.copy(camera as never);
    own.layers.set(SCREEN_LAYER);
    // (a plain camera's projection is copied as it is: one cut to a tile)
    own.projectionMatrix.copy(camera.projectionMatrix);
    own.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    own.updateMatrixWorld();
    if (gtao.width !== width || gtao.height !== height) gtao.setSize(width, height);
    // (the shadow map is not cast in this pass, which sees only the molecules' own layer: it would come out empty)
    const castWanted = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = false;
    // (it leaves its own target bound: the scene is then to be drawn where it was going)
    const target = renderer.getRenderTarget();
    gtao.render(renderer, null as never, null as never, 0, false);
    renderer.setRenderTarget(target);
    renderer.shadowMap.needsUpdate = castWanted;
    const u = this.sheetMat.uniforms;
    u.tShade.value = gtao.pdRenderTarget.texture;
    u.tSeen.value = gtao.normalTexture;
    u.tDepth.value = gtao.depthTexture;
  }

  dispose() {
    this.gtao?.dispose();
    this.material.dispose();
    this.sheetMat.dispose();
    this.sheet.geometry.dispose();
  }
}
