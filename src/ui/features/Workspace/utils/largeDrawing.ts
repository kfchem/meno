/**
 * A canvas with very many atoms on it - those drawn, and those ribbons
 * stand for (lib/chem/style3d `countedAtoms`): past `LARGE_ATOMS`, where
 * Settings says so ("Very large drawings: Lighter"), it is drawn lighter -
 * no shadows, and hollows shaded per atom where a style shades them on the
 * screen - so that turning stays smooth; and it says so, once. Kept by the
 * canvas's renderer: the key light (../components/KeyLight3D), which counts
 * the atoms, sets it; the molecules read it.
 */
import type { WebGLRenderer } from "three";

/** How many atoms on a canvas make it a very large drawing. */
export const LARGE_ATOMS = 20_000;

export type LargeState = { atoms: number; lighter: boolean; told: boolean };
const states = new WeakMap<WebGLRenderer, LargeState>();

/** The canvas's state: how many atoms are on it, whether it is drawn lighter, and whether that has been said. */
export function largeOn(gl: WebGLRenderer): LargeState {
  let s = states.get(gl);
  if (!s) states.set(gl, (s = { atoms: 0, lighter: false, told: false }));
  return s;
}

/** Whether something would be drawn lighter, and what to say of it: none, where nothing would change. */
export function lighterText(shadows: boolean, screen: boolean): string | null {
  if (shadows && screen) return "Shown without shadows, and hollows shaded per atom, so that turning stays smooth.";
  if (shadows) return "Shown without shadows, so that turning stays smooth.";
  if (screen) return "Hollows shaded per atom, so that turning stays smooth.";
  return null;
}
