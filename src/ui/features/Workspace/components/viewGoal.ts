import type * as THREE from "three";

/**
 * Where the view is to go - a fit to what is drawn - for PanZoom2D, which
 * owns the camera, to take it there smoothly rather than jump. Whatever the
 * user does to the view meanwhile wins: a press or a wheel lets it go.
 */
export type ViewGoal = { zoom: number; x: number; y: number };

const goals = new WeakMap<THREE.Camera, ViewGoal>();

export function setViewGoal(camera: THREE.Camera, goal: ViewGoal): void {
  goals.set(camera, goal);
}

export function viewGoalOf(camera: THREE.Camera): ViewGoal | undefined {
  return goals.get(camera);
}

export function letViewGoalGo(camera: THREE.Camera): void {
  goals.delete(camera);
}

/**
 * Cameras a talk drives (presenting/Presenter): PanZoom2D stands aside
 * while one does, and takes the view up from where the talk left it.
 */
const driven = new WeakSet<THREE.Camera>();

export function setViewDriven(camera: THREE.Camera, on: boolean): void {
  if (on) driven.add(camera);
  else driven.delete(camera);
}

export function viewDriven(camera: THREE.Camera): boolean {
  return driven.has(camera);
}
