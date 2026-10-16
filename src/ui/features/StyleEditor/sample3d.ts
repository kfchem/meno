import * as THREE from "three";
import type { Molecule3D, Turn3D } from "../Workspace/store/types";

/**
 * Paracetamol in 3D, its atoms placed by a force field: the molecule the 3D
 * style's preview shows - a ring, double bonds, an amide and a hydroxyl, so
 * that each setting has something to show on. In ångströms.
 */
const ATOMS: [string, number, number, number][] = [
  ["C", -3.653, -0.65, -0.029],
  ["C", -2.189, -0.956, -0.228],
  ["O", -1.828, -2.062, -0.612],
  ["N", -1.385, 0.137, 0.042],
  ["C", 0.02, 0.212, -0.041],
  ["C", 0.839, -0.857, -0.414],
  ["C", 2.229, -0.703, -0.473],
  ["C", 2.799, 0.525, -0.156],
  ["O", 4.147, 0.717, -0.201],
  ["C", 2.002, 1.598, 0.217],
  ["C", 0.615, 1.442, 0.275],
  ["H", -4.048, -0.171, -0.928],
  ["H", -4.196, -1.581, 0.156],
  ["H", -3.802, 0.006, 0.834],
  ["H", -1.855, 0.988, 0.326],
  ["H", 0.428, -1.829, -0.667],
  ["H", 2.84, -1.551, -0.766],
  ["H", 4.568, -0.114, -0.476],
  ["H", 2.458, 2.553, 0.462],
  ["H", 0.011, 2.296, 0.569],
];

const BONDS: [number, number, number][] = [
  [0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 2], [6, 7, 1], [7, 8, 1], [7, 9, 2], [9, 10, 1],
  [10, 4, 2], [0, 11, 1], [0, 12, 1], [0, 13, 1], [3, 14, 1], [5, 15, 1], [6, 16, 1], [8, 17, 1], [9, 18, 1], [10, 19, 1],
];

export const SAMPLE_3D: Molecule3D = {
  id: 0,
  atoms: ATOMS.map(([el, x, y, z]) => ({ el, x, y, z })),
  bonds: BONDS.map(([a1, a2, order]) => ({ a1, a2, order })),
  at: { x: 0, y: 0 },
};

/** How the sample is first seen: tipped back a little and turned, so its ring is not seen edge on. */
export const SAMPLE_TURN: Turn3D = (() => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0.35, 0.1));
  return [q.x, q.y, q.z, q.w] as Turn3D;
})();
