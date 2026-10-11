import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { castersNow, castersOn, fitShadow, lightBoxOf, SHADOW_SOFT, type LightBox } from "../utils/shadows3d";
import { LARGE_ATOMS, largeOn, lighterText } from "../utils/largeDrawing";
import { useNotices } from "../../../notices";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { withSharedSetting } from "../../../../lib/chem/style3d";

/** The shadow map's size, in texels a side. */
const SHADOW_MAP = 2048;
/** How quickly the shadows' darkness goes over to another, in seconds. */
const SHADOW_TAU = 0.08;
/**
 * Fitted round every molecule, the shadow map's texel may be this many of
 * the screen's pixels before it is fitted round those in view only (and
 * cast again as the view pans): a shadow's edge is soft, and blurs a
 * coarse texel.
 */
const TEXELS_TO_PIXEL = 3;

/**
 * The light from above right that molecules in 3D are seen in, and the
 * shadows it casts (utils/shadows3d): `strength` of the way dark - eased
 * there - and none at all at 0. The shadow is cast again only when what
 * casts it moves, turns or changes, or the view it is fitted to changes:
 * fitted round every molecule, panning and zooming leave it as it is,
 * until that would leave its texels coarser than the screen's pixels.
 *
 * It counts the atoms on the canvas too: past `LARGE_ATOMS` - tens of
 * thousands, a protein space-filling - where `large` says "lighter", the
 * canvas is drawn lighter (utils/largeDrawing): the shadows fade, casting
 * them again as such a drawing turns costing more than the turning can
 * spare, and hollows shaded on the screen (`screen`, where a style does)
 * are shaded per atom; and it says so, once, with the way to keep them (a
 * picture made of it has them all the same).
 */
export default function KeyLight3D({
  intensity,
  shadows: strength,
  large = "lighter",
  screen = false,
}: {
  intensity: number;
  shadows: number;
  large?: "lighter" | "asSet";
  screen?: boolean;
}) {
  const { gl, camera, invalidate } = useThree();
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight(0xffffff, intensity);
    l.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    return l;
    // (one light for the canvas's life; its strength set as it changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  light.intensity = intensity;
  useEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate]);
  useEffect(() => () => light.dispose(), [light]);
  useEffect(() => invalidate(), [strength, invalidate]);
  const level = useRef(strength);
  const last = useRef<{ sign: number; box: string } | null>(null);

  useFrame((_, dt) => {
    const step = Math.min(dt, 1 / 30);
    const { spheres, sign, atoms } = castersNow(castersOn(gl));
    const state = largeOn(gl);
    state.atoms = atoms;
    const lighter = large === "lighter" && atoms > LARGE_ATOMS;
    if (lighter !== state.lighter) {
      state.lighter = lighter;
      invalidate();
    }
    // (said once on this canvas, where it changes anything)
    const said = lighter && !state.told ? lighterText(strength > 0, screen) : null;
    if (said) {
      state.told = true;
      useNotices.getState().show({
        id: "large-drawing",
        title: "Many atoms on the canvas",
        text: said,
        action: {
          label: "Keep them",
          run: () => {
            const s = useAppSettings.getState();
            s.setStyle3d(withSharedSetting(s.style3d, "largeDrawings", "asSet"));
          },
        },
      });
    }
    const to = lighter ? 0 : strength;
    const v = to + (level.current - to) * Math.exp(-step / SHADOW_TAU);
    level.current = Math.abs(v - to) < 0.003 ? to : v;
    if (level.current !== to) invalidate();
    light.shadow.intensity = level.current;
    const on = level.current > 0.003;
    if (light.castShadow !== on) {
      light.castShadow = on;
      last.current = null;
    }
    if (!on) return;
    const all = lightBoxOf(spheres);
    if (!all) return;
    const box = fitted(all, spheres, camera, gl);
    const key = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].map((x) => x.toFixed(3)).join(",");
    if (last.current && last.current.sign === sign && last.current.box === key) return;
    last.current = { sign, box: key };
    fitShadow(light, box);
    gl.shadowMap.needsUpdate = true;
  });

  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
}

/**
 * The box the shadow is cast in: round every molecule - or, where that
 * would make its texels coarser than the screen's pixels (zoomed in on a
 * large one), round the part of them in view.
 */
function fitted(all: LightBox, spheres: readonly THREE.Sphere[], camera: THREE.Camera, gl: THREE.WebGLRenderer): LightBox {
  const cam = camera as THREE.OrthographicCamera;
  if (!cam.isOrthographicCamera) return all;
  const across = Math.max(all.max.x - all.min.x, all.max.y - all.min.y);
  const pixel = 1 / (cam.zoom * gl.getPixelRatio());
  if (across / SHADOW_MAP <= TEXELS_TO_PIXEL * pixel) return all;
  // (what is in view: the screen's corners, from the page up to as high as the molecules stand, in the light's axes)
  const w = (cam.right - cam.left) / (2 * cam.zoom);
  const h = (cam.top - cam.bottom) / (2 * cam.zoom);
  const x = cam.position.x;
  const y = cam.position.y;
  let top = 0;
  for (const s of spheres) top = Math.max(top, s.center.z + s.radius);
  const corners: THREE.Sphere[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [0, top + SHADOW_SOFT]) corners.push(new THREE.Sphere(new THREE.Vector3(x + sx * w, y + sy * h, z), 0));
  // (a little more round it: what casts into the view from just outside it)
  const view = lightBoxOf(corners)!;
  const pad = 0.1 * Math.max(view.max.x - view.min.x, view.max.y - view.min.y);
  const min = new THREE.Vector3(Math.max(all.min.x, view.min.x - pad), Math.max(all.min.y, view.min.y - pad), all.min.z);
  const max = new THREE.Vector3(Math.min(all.max.x, view.max.x + pad), Math.min(all.max.y, view.max.y + pad), all.max.z);
  // (none of them in view: as it was, round them all)
  return min.x < max.x && min.y < max.y ? { min, max } : all;
}
