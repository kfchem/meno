/**
 * A text on its way between its sheet on the page and the column (docs/
 * PDF.md, *Movement*, *A text*): read, its sheet's lines rise from where it
 * lies and go into the column as it opens, growing to its width; closed,
 * they go back down to the sheet. On the way they move in the page's type -
 * signed-distance glyphs, as large as the sheet shows them at one end and
 * as the column's at the other - and once settled, the column's own lines,
 * drawn in the system's type, take their place under them as they fade.
 * Drawn in the column's last pass, in the canvas's pixels (PdfColumn).
 */
import { useEffect, useRef } from "react";
import { Text } from "@react-three/drei";
import { GUTTER_PX } from "../../TextEditor/editor";
import { COLUMN_SETTING, type Rect, type Setting } from "./textFlightSetting";
import { DEFAULT_LABEL_FAMILY, labelFont } from "../../../../lib/chem/labelFonts";
import { needsFallback, useLabelFontUrl } from "../../../fonts/typefaces";
import plexMono from "../../../../assets/fonts/IBMPlexMono-Regular.ttf?url";
import { MarkdownRows } from "./MarkdownRows";
import { rowAt, type Laid } from "../../TextEditor/markdownLayout";

const PAPER = "#ffffff";
const EDGE = "rgb(209, 217, 224)";
const INK = "rgb(31, 35, 40)";
const GUTTER = "rgb(246, 248, 250)";
/** How dark the shadow under it is at its highest, and how far it falls, in pixels. */
const SHADOW = 0.12;
const SHADOW_PX = 10;

const noRaycast = () => null;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** How far between `a` and `b` a share is, eased at both ends: one layout fading as the other comes, each mostly alone. */
const smooth = (a: number, b: number, k: number) => {
  const t = Math.min(1, Math.max(0, (k - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The text on its way: `sheet` where its body lies on the screen - its
 * sheet, a molecule or a step - and `set` how it is set there; `column` where the
 * column's body is; `k` how far it has gone toward the
 * column (0 the sheet, 1 the column), `lift` how high it is, `seen` how
 * much of it shows - fading as it hands over. Its lines are laid out by
 * troika as they come, a frame or two after: `onReady` says when they all
 * have, for it to set off then, not blank.
 */
export default function TextFlight({
  sheet,
  column,
  set,
  k,
  lift,
  seen,
  lines,
  onReady,
}: {
  sheet: Rect;
  column: Rect;
  set: Setting;
  k: number;
  lift: number;
  seen: number;
  lines: readonly string[];
  onReady: () => void;
}) {
  const r: Rect = { x: lerp(sheet.x, column.x, k), y: lerp(sheet.y, column.y, k), w: lerp(sheet.w, column.w, k), h: lerp(sheet.h, column.h, k) };
  // the type, as its body sets it at one end and the column at the other
  const c = COLUMN_SETTING;
  const size = lerp(set.size, c.size, k);
  const line = lerp(set.line, c.line, k);
  const left = lerp(set.left, c.left, k);
  const top = lerp(set.top, c.top, k);
  const right = lerp(set.right, c.right, k);
  // (as many lines as it will show at its tallest - laid out once, those it shows now drawn)
  const most = Math.max(0, Math.min(lines.length, Math.ceil(Math.max(sheet.h - set.top, column.h) / Math.max(1e-3, Math.min(set.line, c.line)))));
  const shown = Math.max(0, Math.min(lines.length, Math.ceil((r.h - top) / line)));
  // (set once the letters Meno's typefaces have are known: those they have not as squares, lib/chem/labelFonts `STAND_IN`)
  const lettersKnown = useLabelFontUrl(DEFAULT_LABEL_FAMILY, needsFallback(lines.slice(0, most))) != null;
  const laid = useRef(new Set<number>());
  const ready = useRef(onReady);
  ready.current = onReady;
  const wanted = lines.slice(0, most).filter((l) => l.trim()).length;
  const told = useRef(false);
  const synced = (i: number) => {
    laid.current.add(i);
    if (!told.current && laid.current.size >= wanted) {
      told.current = true;
      ready.current();
    }
  };
  useEffect(() => {
    if (!wanted && !told.current) {
      told.current = true;
      ready.current();
    }
  }, [wanted]);
  // (a box from its top left, in the pass's units - pixels, down negative)
  const at = (x: number, y: number, w: number, h: number): [number, number, number] => [x + w / 2, -(y + h / 2), 0];
  return (
    // (each part in its order - all of them seen through as they fade, so drawn in it, not by depth)
    <group>
      {lift > 0.001 && (
        <mesh position={at(r.x - SHADOW_PX * lift * 0.5, r.y + SHADOW_PX * lift, r.w + SHADOW_PX * lift, r.h)} scale={[r.w + SHADOW_PX * lift, r.h, 1]} renderOrder={1} raycast={noRaycast}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#000000" transparent opacity={SHADOW * lift * seen} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <mesh position={at(r.x, r.y, r.w, r.h)} scale={[r.w, r.h, 1]} renderOrder={2} raycast={noRaycast}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={PAPER} transparent opacity={seen} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* (the column's line numbers' strip, coming as it nears the column) */}
      {k > 0.01 && (
        <mesh position={at(r.x, r.y, GUTTER_PX * k, r.h)} scale={[GUTTER_PX * k, r.h, 1]} renderOrder={3} raycast={noRaycast}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color={GUTTER} transparent opacity={seen} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {/* its edge, as the sheet's */}
      {[
        [r.x, r.y, r.w, 1],
        [r.x, r.y + r.h - 1, r.w, 1],
        [r.x, r.y, 1, r.h],
        [r.x + r.w - 1, r.y, 1, r.h],
      ].map(([x, y, w, h], i) => (
        <mesh key={`edge${i}`} position={at(x, y, w, h)} scale={[w, h, 1]} renderOrder={4} raycast={noRaycast}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color={EDGE} transparent opacity={seen * (1 - k)} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      {/* its lines, the type a size throughout, scaled - not set again each frame */}
      {lines.slice(0, most).map((l, i) =>
        l.trim() && lettersKnown ? (
          <Text
            key={`line${i}`}
            visible={i < shown}
            renderOrder={5}
            onSync={() => synced(i)}
            font={plexMono}
            fontSize={1}
            scale={[size, size, 1]}
            anchorX="left"
            anchorY="middle"
            position={[r.x + left, -(r.y + top + (i + 0.5) * line), 0]}
            color={INK}
            fillOpacity={seen}
            clipRect={[0, -line / size, Math.max(0, (r.w - left - right) / size), line / size]}
            raycast={noRaycast}
          >
            {labelFont(DEFAULT_LABEL_FAMILY).shown(l)}
          </Text>
        ) : null,
      )}
    </group>
  );
}

/**
 * A Markdown text on its way between its sheet and the column (docs/PDF.md,
 * *Markdown*): as it rises, its sheet's rows - laid out as wide as a sheet -
 * fade, and then the column's rows - laid out as wide as the column, from
 * where it is read - come up in their place, both growing with it from the sheet's
 * size to the column's; going back down, the other way. In the page's type
 * on the way (MarkdownRows), as a text's lines are; once settled, the
 * column's own pictures of its rows take their place.
 */
export function MarkdownFlight({
  sheet,
  column,
  k,
  lift,
  seen,
  onSheet,
  inColumn,
  onReady,
}: {
  sheet: Rect;
  column: Rect;
  k: number;
  lift: number;
  seen: number;
  /** The text as its sheet shows it: laid out, and how many rows. */
  onSheet: { laid: Laid; rows: number };
  /** As the column shows it: laid out, and how far down it is read. */
  inColumn: { laid: Laid; top: number };
  onReady: () => void;
}) {
  const r: Rect = { x: lerp(sheet.x, column.x, k), y: lerp(sheet.y, column.y, k), w: lerp(sheet.w, column.w, k), h: lerp(sheet.h, column.h, k) };
  const at = (x: number, y: number, w: number, h: number): [number, number, number] => [x + w / 2, -(y + h / 2), 0];
  // (each layout fitted to its width as it goes; as many rows as it shows at its tallest laid out once, those it shows now seen)
  const a = onSheet.laid;
  const b = inColumn.laid;
  const sa = r.w / a.width;
  const sb = r.w / b.width;
  // (as many rows as it shows at its tallest laid out once, those within it now seen)
  const firstB = rowAt(b, inColumn.top);
  const tallest = Math.max(sheet.h / (sheet.w / b.width), column.h / (column.w / b.width));
  const lastB = rowAt(b, (b.rows[firstB]?.y ?? 0) + tallest) + 1;
  const half = useRef(0);
  const ready = useRef(onReady);
  ready.current = onReady;
  const one = () => {
    if (++half.current === 2) ready.current();
  };
  return (
    <group>
      {lift > 0.001 && (
        <mesh position={at(r.x - SHADOW_PX * lift * 0.5, r.y + SHADOW_PX * lift, r.w + SHADOW_PX * lift, r.h)} scale={[r.w + SHADOW_PX * lift, r.h, 1]} renderOrder={1} raycast={noRaycast}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#000000" transparent opacity={SHADOW * lift * seen} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <mesh position={at(r.x, r.y, r.w, r.h)} scale={[r.w, r.h, 1]} renderOrder={2} raycast={noRaycast}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={PAPER} transparent opacity={seen} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {[
        [r.x, r.y, r.w, 1],
        [r.x, r.y + r.h - 1, r.w, 1],
        [r.x, r.y, 1, r.h],
        [r.x + r.w - 1, r.y, 1, r.h],
      ].map(([x, y, w, h], i) => (
        <mesh key={`edge${i}`} position={at(x, y, w, h)} scale={[w, h, 1]} renderOrder={4} raycast={noRaycast}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color={EDGE} transparent opacity={seen * (1 - k)} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <group position={[r.x, -r.y, 0]}>
        <MarkdownRows laid={a} rows={onSheet.rows} scale={sa} words={1} opacity={seen * (1 - smooth(0.28, 0.5, k))} order={5} reach={r.h / sa} onReady={one} />
      </group>
      <group position={[r.x, -r.y, 0]}>
        <MarkdownRows laid={b} first={firstB} rows={lastB} scale={sb} words={1} opacity={seen * smooth(0.5, 0.72, k)} order={6} reach={r.h / sb} onReady={one} />
      </group>
    </group>
  );
}
