import * as THREE from "three";

/**
 * What the pointer is over on a molecule in 3D, found without trying every
 * triangle: three.js tries a ray against every triangle of every sphere it
 * comes near, and every triangle of a ribbon - 5 to 19 ms a pointer move
 * over the atoms of a protein of 28 000, 46 ms over a ribbon of 3 500
 * residues.
 */

const inverse = new THREE.Matrix4();
const ray = new THREE.Ray();
const at = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const hit = new THREE.Vector3();
const sphere = new THREE.Sphere();
const instance = new THREE.Matrix4();

/**
 * An instanced mesh of spheres - a molecule's atoms, each a sphere of its
 * geometry's radius scaled alike every way - hit where each instance's
 * sphere is, worked out exactly: the near side of each sphere the ray goes
 * through (its outside, the side three.js finds a sphere's triangles on),
 * nearest first. An instance scaled to nothing (an atom not drawn) is not
 * hit.
 */
export function raycastSpheres(mesh: THREE.InstancedMesh, raycaster: THREE.Raycaster, hits: THREE.Intersection[]): void {
  const geometry = mesh.geometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const own = geometry.boundingSphere!;
  inverse.copy(mesh.matrixWorld).invert();
  ray.copy(raycaster.ray).applyMatrix4(inverse);
  const o = ray.origin;
  const d = ray.direction;
  const m = mesh.instanceMatrix.array;
  const centred = own.center.lengthSq() === 0;
  const found: THREE.Intersection[] = [];
  for (let i = 0; i < mesh.count; i++) {
    const k = 16 * i;
    const scale = Math.sqrt(m[k] * m[k] + m[k + 1] * m[k + 1] + m[k + 2] * m[k + 2]);
    const r = own.radius * scale;
    if (!(r > 0)) continue;
    // (the sphere's middle: the geometry's, placed as the instance is)
    if (centred) at.set(m[k + 12], m[k + 13], m[k + 14]);
    else at.copy(own.center).applyMatrix4(instance.fromArray(m, k));
    const ox = o.x - at.x;
    const oy = o.y - at.y;
    const oz = o.z - at.z;
    const half = ox * d.x + oy * d.y + oz * d.z;
    const rest = ox * ox + oy * oy + oz * oz - r * r;
    const disc = half * half - rest;
    if (disc < 0) continue;
    const t = -half - Math.sqrt(disc);
    if (t < 0) continue;
    hit.copy(d).multiplyScalar(t).add(o).applyMatrix4(mesh.matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(hit);
    if (distance < raycaster.near || distance > raycaster.far) continue;
    found.push({ distance, point: hit.clone(), object: mesh, instanceId: i });
  }
  found.sort((p, q) => p.distance - q.distance);
  for (const f of found) hits.push(f);
}


/**
 * An instanced mesh of cylinders - a molecule's bonds, each a cylinder of
 * its geometry (as wide at both ends, its caps on) set from one end of the
 * bond to the other - hit where each instance's cylinder is, worked out
 * exactly as `raycastSpheres` works out atoms: the near side of each, its
 * wall or a cap, nearest first. A cylinder of another shape is left to
 * three.js.
 */
export function raycastCylinders(mesh: THREE.InstancedMesh, raycaster: THREE.Raycaster, hits: THREE.Intersection[]): void {
  const shape = (mesh.geometry as THREE.CylinderGeometry).parameters;
  if (!shape || shape.radiusTop !== shape.radiusBottom || shape.openEnded) {
    THREE.InstancedMesh.prototype.raycast.call(mesh, raycaster, hits);
    return;
  }
  inverse.copy(mesh.matrixWorld).invert();
  ray.copy(raycaster.ray).applyMatrix4(inverse);
  const o = ray.origin;
  const d = ray.direction;
  const m = mesh.instanceMatrix.array;
  const half = shape.height / 2;
  const found: THREE.Intersection[] = [];
  for (let i = 0; i < mesh.count; i++) {
    const k = 16 * i;
    const r = shape.radiusTop * Math.sqrt(m[k] * m[k] + m[k + 1] * m[k + 1] + m[k + 2] * m[k + 2]);
    if (!(r > 0)) continue;
    // its axis, from one cap's middle (p) to the other's (p + axis)
    const ax = m[k + 4] * 2 * half;
    const ay = m[k + 5] * 2 * half;
    const az = m[k + 6] * 2 * half;
    const px = m[k + 12] - ax / 2;
    const py = m[k + 13] - ay / 2;
    const pz = m[k + 14] - az / 2;
    const aa = ax * ax + ay * ay + az * az;
    if (!(aa > 0)) continue;
    const ox = o.x - px;
    const oy = o.y - py;
    const oz = o.z - pz;
    const ad = ax * d.x + ay * d.y + az * d.z;
    const ao = ax * ox + ay * oy + az * oz;
    const od = ox * d.x + oy * d.y + oz * d.z;
    const oo = ox * ox + oy * oy + oz * oz;
    // (a capped cylinder: its wall where the ray meets it between the caps, else a cap)
    let t: number;
    const k2 = aa - ad * ad;
    if (k2 < 1e-12 * aa) {
      // (along its axis: a cap, where the ray passes within its radius)
      if (oo - (ao * ao) / aa > r * r) continue;
      t = ((ad > 0 ? 0 : aa) - ao) / ad;
    } else {
      const k1 = aa * od - ao * ad;
      const k0 = aa * oo - ao * ao - r * r * aa;
      const disc = k1 * k1 - k2 * k0;
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      t = (-k1 - root) / k2;
      const y = ao + t * ad;
      if (!(y > 0 && y < aa)) {
        if (ad === 0) continue;
        t = ((y <= 0 ? 0 : aa) - ao) / ad;
        if (!(Math.abs(k1 + k2 * t) < root)) continue;
      }
    }
    if (t < 0) continue;
    hit.copy(d).multiplyScalar(t).add(o).applyMatrix4(mesh.matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(hit);
    if (distance < raycaster.near || distance > raycaster.far) continue;
    found.push({ distance, point: hit.clone(), object: mesh, instanceId: i });
  }
  found.sort((p, q) => p.distance - q.distance);
  for (const f of found) hits.push(f);
}

/** A ribbon's triangles grouped by the residue they draw, each group with a sphere round it; see `raycastByResidue`. */
type ResidueGroups = { positions: unknown; index: unknown; versions: string; faces: Int32Array; start: Int32Array; spheres: Float32Array };

const grouped = new WeakMap<THREE.BufferGeometry, ResidueGroups>();

/**
 * A ribbon - an indexed mesh whose vertices each belong to a residue
 * (`residues`, by vertex) - hit as three.js would hit it, the nearest
 * triangle with the side its material shows, but trying only the
 * triangles of residues whose sphere the ray goes through. The triangles
 * are grouped afresh as the geometry is filled again.
 */
export function raycastByResidue(mesh: THREE.Mesh, raycaster: THREE.Raycaster, hits: THREE.Intersection[], residues: Int32Array): void {
  const geometry = mesh.geometry;
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!index || !position) return;
  const groups = groupsOf(geometry, index, position, residues);
  inverse.copy(mesh.matrixWorld).invert();
  ray.copy(raycaster.ray).applyMatrix4(inverse);
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const side = material?.side ?? THREE.FrontSide;
  let best = Infinity;
  let bestFace = -1;
  const bestPoint = new THREE.Vector3();
  for (let g = 0; g + 1 < groups.start.length; g++) {
    sphere.center.set(groups.spheres[4 * g], groups.spheres[4 * g + 1], groups.spheres[4 * g + 2]);
    sphere.radius = groups.spheres[4 * g + 3];
    if (!ray.intersectsSphere(sphere)) continue;
    for (let f = groups.start[g]; f < groups.start[g + 1]; f++) {
      const face = groups.faces[f];
      a.fromBufferAttribute(position, index.getX(3 * face));
      b.fromBufferAttribute(position, index.getX(3 * face + 1));
      c.fromBufferAttribute(position, index.getX(3 * face + 2));
      const met = side === THREE.BackSide ? ray.intersectTriangle(c, b, a, true, hit) : ray.intersectTriangle(a, b, c, side === THREE.FrontSide, hit);
      if (!met) continue;
      const t = hit.distanceToSquared(ray.origin);
      if (t < best || (t === best && face < bestFace)) {
        best = t;
        bestFace = face;
        bestPoint.copy(hit);
      }
    }
  }
  if (bestFace < 0) return;
  bestPoint.applyMatrix4(mesh.matrixWorld);
  const distance = raycaster.ray.origin.distanceTo(bestPoint);
  if (distance < raycaster.near || distance > raycaster.far) return;
  const ia = index.getX(3 * bestFace);
  const ib = index.getX(3 * bestFace + 1);
  const ic = index.getX(3 * bestFace + 2);
  const normal = new THREE.Vector3();
  THREE.Triangle.getNormal(a.fromBufferAttribute(position, ia), b.fromBufferAttribute(position, ib), c.fromBufferAttribute(position, ic), normal);
  hits.push({ distance, point: bestPoint, object: mesh, faceIndex: bestFace, face: { a: ia, b: ib, c: ic, normal, materialIndex: 0 } });
}

function groupsOf(geometry: THREE.BufferGeometry, index: THREE.BufferAttribute, position: THREE.BufferAttribute, residues: Int32Array): ResidueGroups {
  const versions = `${index.version} ${position.version} ${index.count} ${position.count}`;
  const was = grouped.get(geometry);
  if (was && was.index === index && was.positions === position && was.versions === versions) return was;
  const faces = index.count / 3;
  // each triangle by the residue of its first corner, as the pointer's residue is read
  const byResidue = new Map<number, number[]>();
  for (let f = 0; f < faces; f++) {
    const r = residues[index.getX(3 * f)] ?? -1;
    let list = byResidue.get(r);
    if (!list) byResidue.set(r, (list = []));
    list.push(f);
  }
  const start = new Int32Array(byResidue.size + 1);
  const sorted = new Int32Array(faces);
  const spheres = new Float32Array(4 * byResidue.size);
  let g = 0;
  let n = 0;
  const box = new THREE.Box3();
  for (const list of byResidue.values()) {
    start[g] = n;
    box.makeEmpty();
    for (const f of list) {
      sorted[n++] = f;
      for (let k = 0; k < 3; k++) box.expandByPoint(a.fromBufferAttribute(position, index.getX(3 * f + k)));
    }
    box.getCenter(at);
    let r = 0;
    for (const f of list) for (let k = 0; k < 3; k++) r = Math.max(r, at.distanceTo(a.fromBufferAttribute(position, index.getX(3 * f + k))));
    spheres.set([at.x, at.y, at.z, r * (1 + 1e-6) + 1e-9], 4 * g);
    g++;
  }
  start[g] = n;
  const made = { positions: position, index, versions, faces: sorted, start, spheres };
  grouped.set(geometry, made);
  return made;
}
