import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { raycastByResidue, raycastSpheres } from "./raycast3d";

/** A random number from a seed, the same each run. */
function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/** `n` atoms of radius `r` in a ball as dense as a protein's (about 0.1 atoms a cubic angstrom), under a group turned, moved and scaled. */
function atoms(n: number, r: number) {
  const rnd = seeded(7);
  const R = Math.cbrt((3 * n) / (4 * Math.PI * 0.104));
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 32, 32), new THREE.MeshStandardMaterial(), n);
  const m = new THREE.Matrix4();
  const centres: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    let x, y, z;
    do {
      x = (2 * rnd() - 1) * R;
      y = (2 * rnd() - 1) * R;
      z = (2 * rnd() - 1) * R;
    } while (x * x + y * y + z * z > R * R);
    centres.push(new THREE.Vector3(x, y, z));
    mesh.setMatrixAt(i, m.makeScale(r, r, r).setPosition(x, y, z));
  }
  mesh.computeBoundingSphere();
  const group = new THREE.Group();
  group.position.set(3, -2, 1);
  group.rotation.set(0.3, 0.5, 0.1);
  group.scale.setScalar(1.7);
  group.add(mesh);
  group.updateMatrixWorld(true);
  return { mesh, centres, rnd };
}

/** A ribbon of `residues` residues as the view builds one: 8 rings a residue, 10 sides round, wound through a ball. */
function ribbon(residues: number) {
  const STEPS = 8;
  const SIDES = 10;
  const rings = residues * STEPS;
  const R = Math.cbrt((3 * residues * 8) / (4 * Math.PI * 0.104));
  const pos = new Float32Array(rings * SIDES * 3);
  const of = new Int32Array(rings * SIDES);
  const idx: number[] = [];
  for (let j = 0; j < rings; j++) {
    const t = j / rings;
    const cx = R * 0.8 * Math.sin(t * 37.1) * Math.cos(t * 5.3);
    const cy = R * 0.8 * Math.sin(t * 29.7);
    const cz = R * 0.8 * Math.cos(t * 37.1) * Math.cos(t * 3.1);
    for (let s = 0; s < SIDES; s++) {
      const th = (2 * Math.PI * s) / SIDES;
      const k = j * SIDES + s;
      pos.set([cx + 0.8 * Math.cos(th), cy + 0.2 * Math.sin(th), cz], 3 * k);
      of[k] = Math.floor(j / STEPS);
    }
  }
  for (let j = 0; j < rings - 1; j++)
    for (let s = 0; s < SIDES; s++) {
      const a = j * SIDES + s;
      const b = j * SIDES + ((s + 1) % SIDES);
      idx.push(a, a + SIDES, b, b, a + SIDES, b + SIDES);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial());
  mesh.position.set(-1, 2, 0.5);
  mesh.rotation.set(0.2, -0.4, 0);
  mesh.updateMatrixWorld(true);
  return { mesh, residues: of, R };
}

/** What three.js finds, and what the function finds, for one ray. */
function both(object: THREE.Object3D, own: (rc: THREE.Raycaster, hits: THREE.Intersection[]) => void, rc: THREE.Raycaster) {
  const theirs = rc.intersectObject(object, false);
  const ours: THREE.Intersection[] = [];
  own(rc, ours);
  return { theirs, ours };
}

/** A ray from far along the view through `to` (in the page's frame), slightly askew. */
function rayAt(to: THREE.Vector3, rnd: () => number) {
  const dir = new THREE.Vector3(rnd() * 0.2 - 0.1, rnd() * 0.2 - 0.1, -1).normalize();
  return new THREE.Raycaster(to.clone().addScaledVector(dir, -500), dir, 0, 2000);
}

describe("what the pointer is over on a molecule in 3D", () => {
  it("is the atom three.js finds, at the same place, but where the ray only grazes a sphere's facets", () => {
    const { mesh, centres, rnd } = atoms(3000, 0.6);
    let grazed = 0;
    for (let k = 0; k < 400; k++) {
      // (aimed at an atom, or at the gap beside it)
      const i = Math.floor(rnd() * centres.length);
      const to = mesh.localToWorld(centres[i].clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, 0)));
      const { theirs, ours } = both(mesh, (rc, h) => raycastSpheres(mesh, rc, h), rayAt(to, rnd));
      if (theirs[0]?.instanceId === ours[0]?.instanceId) {
        if (theirs[0]) expect(ours[0].distance).toBeCloseTo(theirs[0].distance, 1);
        continue;
      }
      // (a polygon of 32 sides lies inside the sphere by about half a
      // percent of its radius: a ray through that rim meets the sphere and
      // not the facets)
      grazed++;
      const first = ours[0] ?? theirs[0];
      const c = mesh.localToWorld(centres[first.instanceId!].clone());
      const off = rayAt(to, seeded(1)).ray.distanceToPoint(c);
      expect(off).toBeGreaterThan(0.6 * 1.7 * 0.97);
    }
    expect(grazed).toBeLessThan(8);
  });

  it("leaves out atoms not drawn, and what is nearer or farther than the ray looks", () => {
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshStandardMaterial(), 2);
    mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0));
    mesh.setMatrixAt(1, new THREE.Matrix4().makeScale(1, 1, 1).setPosition(0, 0, -10));
    mesh.updateMatrixWorld(true);
    const hits: THREE.Intersection[] = [];
    raycastSpheres(mesh, new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1), 0, 100), hits);
    expect(hits.map((h) => h.instanceId)).toEqual([1]);
    expect(hits[0].distance).toBeCloseTo(14, 6);
    hits.length = 0;
    raycastSpheres(mesh, new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1), 0, 10), hits);
    expect(hits).toEqual([]);
  });

  it("is the ribbon's triangle three.js finds, and its residue", () => {
    const { mesh, residues, R } = ribbon(300);
    const rnd = seeded(11);
    let met = 0;
    for (let k = 0; k < 300; k++) {
      const to = mesh.localToWorld(new THREE.Vector3((2 * rnd() - 1) * R, (2 * rnd() - 1) * R, 0));
      const { theirs, ours } = both(mesh, (rc, h) => raycastByResidue(mesh, rc, h, residues), rayAt(to, rnd));
      expect(ours.length).toBe(theirs.length ? 1 : 0);
      if (!theirs.length) continue;
      met++;
      expect(ours[0].faceIndex).toBe(theirs[0].faceIndex);
      expect(ours[0].distance).toBeCloseTo(theirs[0].distance, 6);
      expect(ours[0].point.distanceTo(theirs[0].point)).toBeLessThan(1e-6);
    }
    expect(met).toBeGreaterThan(50);
  });

  it("follows the ribbon as it is filled again", () => {
    const { mesh, residues, R } = ribbon(40);
    const found = (rc: THREE.Raycaster) => {
      const hits: THREE.Intersection[] = [];
      raycastByResidue(mesh, rc, hits, residues);
      return hits.map((h) => h.faceIndex);
    };
    const nearest = (rc: THREE.Raycaster) => rc.intersectObject(mesh, false).slice(0, 1).map((h) => h.faceIndex);
    // (a ray that meets it)
    const rnd = seeded(3);
    let rc = rayAt(mesh.localToWorld(new THREE.Vector3()), rnd);
    while (!nearest(rc).length) rc = rayAt(mesh.localToWorld(new THREE.Vector3((2 * rnd() - 1) * R, (2 * rnd() - 1) * R, 0)), rnd);
    const face = nearest(rc);
    expect(found(rc)).toEqual(face);
    // (moved away, as a new frame fills it - its sphere made again, as the view does: met where it now is, not where it was)
    const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let v = 0; v < position.count; v++) position.setX(v, position.getX(v) + 50);
    position.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
    const shift = mesh.localToWorld(new THREE.Vector3(50, 0, 0)).sub(mesh.localToWorld(new THREE.Vector3()));
    const moved = new THREE.Raycaster(rc.ray.origin.clone().add(shift), rc.ray.direction.clone(), 0, 2000);
    expect(found(rc)).toEqual(nearest(rc));
    expect(found(moved)).toEqual(face);
    expect(nearest(moved)).toEqual(face);
  });

  it("is found in a small share of the time three.js takes, for a protein of 28 000 atoms and 3 500 residues", () => {
    const cpu = (f: () => void) => {
      const c = process.cpuUsage();
      for (let k = 0; k < 5; k++) f();
      const d = process.cpuUsage(c);
      return (d.user + d.system) / 5;
    };
    const { mesh, centres, rnd } = atoms(28000, 1.7);
    const rc = rayAt(mesh.localToWorld(centres[0].clone()), rnd);
    const hits: THREE.Intersection[] = [];
    const theirs = cpu(() => rc.intersectObject(mesh, false));
    const ours = cpu(() => raycastSpheres(mesh, rc, (hits.length = 0, hits)));
    expect(ours).toBeLessThan(theirs / 5);
    const rib = ribbon(3500);
    const rr = rayAt(rib.mesh.localToWorld(new THREE.Vector3(0, 0, 0)), rnd);
    raycastByResidue(rib.mesh, rr, [], rib.residues);
    const theirsRibbon = cpu(() => rr.intersectObject(rib.mesh, false));
    const oursRibbon = cpu(() => raycastByResidue(rib.mesh, rr, (hits.length = 0, hits), rib.residues));
    expect(oursRibbon).toBeLessThan(theirsRibbon / 5);
  }, 60_000);
});
