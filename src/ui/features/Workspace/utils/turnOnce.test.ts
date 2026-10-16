import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { EditorStore } from "../store";
import type { Turn3D } from "../store/types";
import { STOP_MS, startTurnOnce, stepTurnsOnce, stoppingAngle, stopTurnsOnce, turningOnce, turnOnceAngle, turnOnceRate, turnsBeforeOnce, TURN_ONCE_MS } from "./turnOnce";

const UP = new THREE.Vector3(0, 1, 0);

// (a store with what turning once reads and writes: the molecules there, how each is turned)
function storeWith(turns: Record<number, Turn3D>, ids = [1, 2]) {
  const state = {
    molecules3d: ids.map((id) => ({ id })),
    turns3d: { ...turns } as Record<number, Turn3D>,
    setTurn3d: (id: number, t: Turn3D) => {
      state.turns3d = { ...state.turns3d, [id]: t };
    },
    resetTurn3d: (id: number) => {
      const { [id]: _was, ...rest } = state.turns3d;
      state.turns3d = rest;
    },
  };
  return { store: { getState: () => state } as unknown as EditorStore, state };
}

const angleBetween = (a: Turn3D | undefined, b: Turn3D | undefined) =>
  new THREE.Quaternion(...(a ?? [0, 0, 0, 1])).angleTo(new THREE.Quaternion(...(b ?? [0, 0, 0, 1])));

describe("the turn once round", () => {
  it("goes from 0 to 360 degrees in 4 s, never back, along the quintic smootherstep", () => {
    expect(TURN_ONCE_MS).toBe(4000);
    expect(turnOnceAngle(0)).toBe(0);
    expect(turnOnceAngle(1)).toBeCloseTo(2 * Math.PI, 12);
    expect(turnOnceAngle(0.5)).toBeCloseTo(Math.PI, 12);
    expect(turnOnceAngle(0.25)).toBeCloseTo(2 * Math.PI * (6 / 1024 - 15 / 256 + 10 / 64), 12);
    // (before its start and after its end: where it began, and once round)
    expect(turnOnceAngle(-0.1)).toBe(0);
    expect(turnOnceAngle(1.2)).toBeCloseTo(2 * Math.PI, 12);
    let was = -1;
    for (let i = 0; i <= 1000; i++) {
      const a = turnOnceAngle(i / 1000);
      expect(a).toBeGreaterThanOrEqual(was);
      was = a;
    }
  });
  it("starts and stops smoothly: neither speed nor acceleration at either end", () => {
    expect(turnOnceRate(0)).toBe(0);
    expect(turnOnceRate(1)).toBe(0);
    const h = 1e-4;
    // (its speed growing as h squared: no acceleration at the ends)
    expect(turnOnceRate(h) / h).toBeLessThan(0.05);
    expect(turnOnceRate(1 - h) / h).toBeLessThan(0.05);
    expect(turnOnceAngle(h) / h).toBeLessThan(1e-3);
    expect((2 * Math.PI - turnOnceAngle(1 - h)) / h).toBeLessThan(1e-3);
    // (its rate the angle's, throughout)
    const d = 1e-6;
    for (let i = 1; i < 100; i++) {
      const t = i / 100;
      expect((turnOnceAngle(t + d) - turnOnceAngle(t - d)) / (2 * d)).toBeCloseTo(turnOnceRate(t), 4);
    }
  });
  it("comes to rest when stopped along a curve whose speed falls from what it was to nothing", () => {
    expect(stoppingAngle(0)).toBe(0);
    expect(stoppingAngle(1)).toBe(0.5);
    const d = 1e-6;
    expect((stoppingAngle(d) - stoppingAngle(0)) / d).toBeCloseTo(1, 4);
    expect((stoppingAngle(1) - stoppingAngle(1 - d)) / d).toBeCloseTo(0, 4);
  });
  it("turns each molecule about the screen's up, and ends exactly as it was turned", () => {
    const from: Turn3D = [0.2, 0.1, -0.3, Math.sqrt(1 - 0.14)];
    const { store, state } = storeWith({ 1: from });
    startTurnOnce(store, [1, 2], 0);
    expect(turningOnce(store)).toBe(true);
    // (half way round: a half turn about the up from where it was, the other from facing as its file has it)
    stepTurnsOnce(store, TURN_ONCE_MS / 2, UP);
    const half = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);
    expect(new THREE.Quaternion(...state.turns3d[1]).angleTo(half.clone().multiply(new THREE.Quaternion(...from)))).toBeLessThan(1e-9);
    expect(new THREE.Quaternion(...state.turns3d[2]).angleTo(half)).toBeLessThan(1e-9);
    // (where it comes back to, for a talk begun meanwhile)
    expect(turnsBeforeOnce(store, state.turns3d)).toEqual({ 1: from });
    stepTurnsOnce(store, TURN_ONCE_MS + 1, UP);
    expect(state.turns3d[1]).toBe(from);
    expect(2 in state.turns3d).toBe(false);
    expect(turningOnce(store)).toBe(false);
  });
  it("stops gently when pressed, slowing to rest from the speed it had over 0.4 s", () => {
    const { store, state } = storeWith({});
    startTurnOnce(store, [1], 0);
    let t = TURN_ONCE_MS / 2;
    stepTurnsOnce(store, t, UP);
    const at = state.turns3d[1];
    stopTurnsOnce(store, t);
    const steps: number[] = [];
    let was = at;
    while (turningOnce(store) && steps.length < 100) {
      t += 1000 / 60;
      stepTurnsOnce(store, t, UP);
      steps.push(angleBetween(was, state.turns3d[1]));
      was = state.turns3d[1];
    }
    // (no jump: its first step as fast as it was going, each after slower; at rest within the 0.4 s)
    const speed = turnOnceRate(0.5) / (TURN_ONCE_MS / 1000);
    expect(steps[0] / (1 / 60)).toBeCloseTo(speed, 0);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
    expect(Math.abs(steps.length - STOP_MS / (1000 / 60))).toBeLessThanOrEqual(1);
    // (half as far on as at that speed throughout)
    expect(angleBetween(at, state.turns3d[1])).toBeCloseTo((speed * STOP_MS) / 1000 / 2, 9);
  });
  it("stops, and leaves it to the chemist, when they turn it meanwhile", () => {
    const { store, state } = storeWith({});
    startTurnOnce(store, [1, 2], 0);
    stepTurnsOnce(store, 1000, UP);
    const theirs: Turn3D = [1, 0, 0, 0];
    state.setTurn3d(1, theirs);
    stepTurnsOnce(store, 1000 + 1000 / 60, UP);
    // (from their turn, slowing; the other turning on round)
    expect(angleBetween(theirs, state.turns3d[1])).toBeLessThan(0.1);
    expect(turnsBeforeOnce(store, state.turns3d)[1]).toBe(state.turns3d[1]);
    expect(2 in turnsBeforeOnce(store, state.turns3d)).toBe(false);
  });
});
