/**
 * A still picture of the 3D style preview's molecule in one style: what a
 * card in Settings' list of styles shows. Drawn as a copied picture is
 * (Workspace/render3d), one at a time, a frame apart, so that a list of
 * styles opening does not hold the window up; kept for as long as the
 * style is set the same, and drawn again when it changes.
 */
import { useEffect, useState } from "react";
import type { MoleculeLook, Style3D } from "../../../lib/chem/style3d";
import type * as THREE from "three";
import { pictureRenderer, rendered3d } from "../Workspace/render3d";
import { WORLD_PER_ANGSTROM } from "../Workspace/utils/molecule3d";
import { SAMPLE_3D, SAMPLE_TURN } from "./sample3d";

/** How wide the molecule is drawn, in pixels: twice a card's picture, for a sharp one on a Retina screen. */
const PICTURE_PX = 320;
/** How far across the sample reaches in ball and stick, in ångströms: what `PICTURE_PX` is fitted to. */
const SAMPLE_ACROSS = 10;
/** The most pictures kept: the styles that are, and some that were. */
const KEPT_MOST = 64;

const kept = new Map<string, string>();
const waiting = new Map<string, { draw: () => string | null; heard: Set<(url: string | null) => void> }>();
let drawing = false;
// (one renderer for all of them, kept: a context made for each would take the live previews' away)
let renderer: THREE.WebGLRenderer | null = null;

/** The key a style's picture is kept under: everything it is drawn from. */
function keyOf(look: MoleculeLook, scene: Style3D): string {
  return JSON.stringify([look, scene.ambientLight, scene.keyLight, scene.shadows, scene.surfacePlus, scene.surfaceMinus]);
}

/** The next picture waiting drawn, and the one after it a frame on. */
function drawNext(): void {
  const next = waiting.entries().next();
  if (next.done) {
    drawing = false;
    return;
  }
  drawing = true;
  const [key, w] = next.value;
  waiting.delete(key);
  const url = w.draw();
  if (url) {
    kept.set(key, url);
    if (kept.size > KEPT_MOST) kept.delete(kept.keys().next().value!);
  }
  for (const f of w.heard) f(url);
  requestAnimationFrame(drawNext);
}

/** The picture of `look` drawn already, where it is: what a style file is given to show what it holds. */
export function keptPicture3d(look: MoleculeLook, scene: Style3D): string | null {
  return kept.get(keyOf(look, scene)) ?? null;
}

/** The molecule drawn in `look` - as a data URL - or none, while it is being drawn or where there is no WebGL. */
export function useStylePicture3d(look: MoleculeLook, scene: Style3D): string | null {
  const key = keyOf(look, scene);
  const [url, setUrl] = useState<string | null>(() => kept.get(key) ?? null);
  useEffect(() => {
    const has = kept.get(key);
    if (has) {
      setUrl(has);
      return;
    }
    // (the one shown till then stays till the new one is drawn: no blank in between)
    const heard = (u: string | null) => u && setUrl(u);
    const w = waiting.get(key) ?? {
      draw: () => {
        const style: Style3D = { ...scene, primary: look, secondary: look };
        try {
          renderer ??= pictureRenderer();
        } catch {
          return null;
        }
        const drawn = rendered3d([{ ...SAMPLE_3D, turn: SAMPLE_TURN }], style, PICTURE_PX / (SAMPLE_ACROSS * WORLD_PER_ANGSTROM), undefined, undefined, 1, renderer);
        return drawn ? drawn.canvas.toDataURL("image/png") : null;
      },
      heard: new Set<(u: string | null) => void>(),
    };
    w.heard.add(heard);
    waiting.set(key, w);
    if (!drawing) requestAnimationFrame(drawNext);
    return () => {
      w.heard.delete(heard);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- (the key is all of look and scene that is drawn)
  return url;
}
