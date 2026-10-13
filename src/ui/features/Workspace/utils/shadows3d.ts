/**
 * The shadows the key light casts on molecules in 3D: what casts them, and
 * how the light's shadow camera is fitted round it. Molecules cast them
 * with balls and sticks coarser than those drawn (a shadow's edge is soft,
 * and a coarse ball costs a tenth as much to cast), which stand where the
 * drawn ones do - they share their places - and draw nothing themselves.
 * Only molecules take shadows: the page takes none.
 */
import * as THREE from "three";
import { KEY_LIGHT_FROM } from "../../../../lib/chem/style3d";
import { WORLD_PER_ANGSTROM } from "./molecule3d";

/** How soft a shadow's edge is, across, in the page's units: a quarter of an ångström. */
export const SHADOW_SOFT = 0.25 * WORLD_PER_ANGSTROM;
/** The softest and the hardest a shadow's edge is drawn, in the shadow map's texels. */
const SOFT_TEXELS: [number, number] = [1.5, 12];

const COARSE_BALL = new THREE.SphereGeometry(1, 10, 6);
const COARSE_STICK = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
const UNSEEN = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });

/**
 * What casts `drawn`'s shadow: as many coarse balls (or sticks) as it has,
 * where its own are - sharing their places, so that they move as they do.
 * Taken out of the scene, it is let go with it (never disposed: the places
 * are `drawn`'s).
 */
export function casterOf(drawn: THREE.InstancedMesh, kind: "balls" | "sticks"): THREE.InstancedMesh {
  const c = new THREE.InstancedMesh(kind === "balls" ? COARSE_BALL : COARSE_STICK, UNSEEN, drawn.count);
  c.instanceMatrix = drawn.instanceMatrix;
  // (how many atoms it counts for - not those a look leaves out, but those
  // its ribbons stand for - is the drawn mesh's to say: `userData.counted`)
  c.userData.drawn = drawn;
  c.castShadow = true;
  c.frustumCulled = false;
  c.raycast = () => {};
  // (drawn as none of them where the canvas is drawn - they are there only
  // to cast, which the shadow's own drawing does with all of them)
  c.onBeforeRender = () => {
    c.userData.count = c.count;
    c.count = 0;
  };
  c.onAfterRender = () => {
    c.count = c.userData.count;
  };
  return c;
}

/** The shadow casters on a canvas, by its renderer: each molecule puts its own in, and takes them out as it goes. */
const casters = new WeakMap<THREE.WebGLRenderer, Set<THREE.InstancedMesh>>();
export function castersOn(gl: THREE.WebGLRenderer): Set<THREE.InstancedMesh> {
  let set = casters.get(gl);
  if (!set) casters.set(gl, (set = new Set()));
  return set;
}

/** Whether an object is drawn: it and everything it is in. */
function shown(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** The way the key light shines from, as a unit vector. */
const FROM = new THREE.Vector3(...KEY_LIGHT_FROM).normalize();
// the light's own axes: across, up and towards it (as its shadow camera looks)
const AXES = new THREE.Matrix4().lookAt(FROM, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
const TO_LIGHT = AXES.clone().invert();

/** A box in the light's axes: across (x), up (y), and how near the light (z). */
export type LightBox = { min: THREE.Vector3; max: THREE.Vector3 };

/** The box in the light's axes round `spheres` (world centres and radii); none for none. */
export function lightBoxOf(spheres: readonly THREE.Sphere[]): LightBox | null {
  if (!spheres.length) return null;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const c = new THREE.Vector3();
  for (const s of spheres) {
    c.copy(s.center).applyMatrix4(TO_LIGHT);
    min.min(c.clone().subScalar(s.radius));
    max.max(c.clone().addScalar(s.radius));
  }
  return { min, max };
}

/**
 * The world spheres the casters on a canvas take up, of those drawn; a
 * number that changes whenever any of them moves, turns or changes; and
 * how many atoms they count for - those drawn and those a look's ribbons
 * stand for, not those it leaves out otherwise (lib/chem/style3d
 * `countedAtoms`).
 */
export function castersNow(set: Iterable<THREE.InstancedMesh>): { spheres: THREE.Sphere[]; sign: number; atoms: number } {
  const spheres: THREE.Sphere[] = [];
  let sign = 0;
  let atoms = 0;
  let k = 1;
  for (const c of set) {
    if (!shown(c) || !c.count) continue;
    const version = c.instanceMatrix.version;
    if (c.userData.version !== version || !c.boundingSphere) {
      c.computeBoundingSphere();
      c.userData.version = version;
    }
    c.updateWorldMatrix(true, false);
    const s = c.boundingSphere!.clone().applyMatrix4(c.matrixWorld);
    if (!(s.radius > 0) || !Number.isFinite(s.radius)) continue;
    spheres.push(s);
    if (c.geometry === COARSE_BALL) atoms += (c.userData.drawn as THREE.InstancedMesh | undefined)?.userData.counted ?? c.count;
    sign += (version + 1) * (k += 1.618);
    for (const e of c.matrixWorld.elements) sign += e * (k += 0.618);
  }
  return { spheres, sign, atoms };
}

/**
 * The light's shadow camera fitted round `box`: the light placed over its
 * middle, looking down its depth, its edge as soft as `SHADOW_SOFT`
 * whatever the box's size.
 */
export function fitShadow(light: THREE.DirectionalLight, box: LightBox) {
  const pad = SHADOW_SOFT * 2;
  const mid = new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z + pad);
  const half = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) / 2 + pad;
  light.position.copy(mid).applyMatrix4(AXES);
  light.target.position.copy(mid.clone().setZ(mid.z - 1)).applyMatrix4(AXES);
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  const cam = light.shadow.camera as THREE.OrthographicCamera;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = 0;
  cam.far = box.max.z - box.min.z + 2 * pad;
  cam.updateProjectionMatrix();
  const texel = (2 * half) / light.shadow.mapSize.x;
  light.shadow.radius = Math.min(SOFT_TEXELS[1], Math.max(SOFT_TEXELS[0], SHADOW_SOFT / texel));
  light.shadow.normalBias = 1.5 * texel;
  light.shadow.bias = -0.0002;
}
