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

/**
 * Cameras under whose resting pointer something has moved other than the
 * view - a molecule turning on after it was let go, or let go after a
 * gesture that kept the pointer's moves to itself - for PanZoom2D to find
 * again what is under the pointer once that is drawn, as it does after the
 * view moves.
 */
const movedUnder = new WeakSet<THREE.Camera>();

export function movedUnderPointer(camera: THREE.Camera): void {
  movedUnder.add(camera);
}

export function tookMovedUnderPointer(camera: THREE.Camera): boolean {
  return movedUnder.delete(camera);
}

/**
 * Cameras under whose press, held still, the view has moved - scrolled or
 * zoomed with the button down - so that the pointer is no longer on what it
 * pressed: such a press is neither a click nor a long press (the
 * maintainer's ruling, 2026-10-12). PanZoom2D says so; the press's own
 * handlers ask as their timer runs out or the button comes up. A new press
 * starts afresh.
 */
const pressesMovedUnder = new WeakSet<THREE.Camera>();

export function setPressMovedUnder(camera: THREE.Camera, moved: boolean): void {
  if (moved) pressesMovedUnder.add(camera);
  else pressesMovedUnder.delete(camera);
}

export function pressMovedUnder(camera: THREE.Camera): boolean {
  return pressesMovedUnder.has(camera);
}
