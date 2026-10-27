import { Text } from "@react-three/drei";
import { createPortal, useThree } from "@react-three/fiber";
import { useMemo, useRef, type Ref } from "react";
import * as THREE from "three";
import { labelSetOf, placeLabel, type LayoutOptions } from "../../../../lib/chem/layout2d";
import { needsFallback, useLabelFontUrl } from "../../../fonts/typefaces";
import { COLORS } from "../../../theme/colors";
import { stereoTextItem } from "../chem/marks";
import { ITALIC_SLANT } from "./textBatch";
import { fadeLetters } from "./labelFade";

/** Where one of R, S, E and Z goes this frame: its middle on the screen, in pixels from the canvas's top left, its letters' size in pixels, and how opaque it is. */
export type StereoInk = { place(at: { x: number; y: number }, fontPx: number, opacity: number): void };

/** Over the molecules, as the HTML they were drawn in was. */
const ORDER = 60;

/**
 * One of R, S, E and Z beside a molecule in 3D (Molecule3DView), drawn by
 * WebGL in the same frame as the molecule, so it never lags a turn, a pan
 * or a zoom (docs/LOOK.md, rule 7): set as the drawing's are (chem/marks
 * `stereoTextItem`) - the letter leaning, an axis's a smaller and lower, in
 * parentheses where the style says so - in the app's blue, with a white
 * halo. Laid on the page, which the canvas's camera looks straight down
 * on, and placed frame by frame where Molecule3DView's placing puts it on
 * the screen (`ink.place`).
 */
export default function StereoInk3D({ text, opts, ink }: { text: string; opts: LayoutOptions; ink: Ref<StereoInk> }) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const set = labelSetOf(opts);
  const font = useLabelFontUrl(set.fontFamily ?? "Arial", needsFallback([text]));
  const group = useRef<THREE.Group>(null);
  // (set at a size of 1, about its middle: moved and sized as a whole)
  const runs = useMemo(() => placeLabel(stereoTextItem({ x: 0, y: 0, text }, 1, opts), 1, set), [text, opts, set]);
  const v = useMemo(() => new THREE.Vector3(), []);
  const handle = useMemo<StereoInk>(
    () => ({
      place(at, fontPx, opacity) {
        const g = group.current;
        if (!g) return;
        v.set((at.x / size.width) * 2 - 1, 1 - (at.y / size.height) * 2, 0).unproject(camera);
        const o = camera as THREE.OrthographicCamera;
        const perPx = o.isOrthographicCamera ? (o.top - o.bottom) / o.zoom / size.height : 1;
        g.position.set(v.x, v.y, 0);
        g.scale.setScalar(fontPx * perPx);
        g.visible = opacity > 0;
        g.traverse((c) => fadeLetters(c, opacity));
      },
    }),
    [camera, size, v],
  );
  if (typeof ink === "function") ink(handle);
  else if (ink) (ink as { current: StereoInk | null }).current = handle;
  if (font === null) return null;
  return createPortal(
    <group ref={group} visible={false} renderOrder={ORDER}>
      {runs
        .filter((r) => !r.mark)
        .map((r, k) => (
          <group key={k} position={[r.x, r.y, 0]} matrixAutoUpdate={!r.italic} matrix={r.italic ? slanted(r.x, r.y) : undefined}>
            <Text
              font={font}
              fontSize={r.size}
              color={COLORS.stereo3d}
              fillOpacity={0}
              anchorX="left"
              anchorY="top-baseline"
              renderOrder={ORDER}
              outlineColor={COLORS.background}
              outlineWidth="12%"
              outlineBlur="18%"
              outlineOpacity={0}
            >
              {r.text}
              <meshBasicMaterial side={THREE.DoubleSide} transparent toneMapped={false} depthTest={false} depthWrite={false} />
            </Text>
          </group>
        ))}
    </group>,
    scene,
  );
}

/** A run at (x, y), its baseline, leaning to the right above it: as Labels2D leans an italic run. */
function slanted(x: number, y: number): THREE.Matrix4 {
  return new THREE.Matrix4().set(1, ITALIC_SLANT, 0, x, 0, 1, 0, y, 0, 0, 1, 0, 0, 0, 0, 1);
}
