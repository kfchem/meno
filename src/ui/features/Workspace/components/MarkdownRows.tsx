/**
 * A Markdown text's rows in the page's type (docs/PDF.md, *Markdown*): as
 * a sheet on the page shows its first rows, and as a text on its way
 * between the sheet and the column moves - each part of its words a
 * signed-distance text (troika), sharp at every zoom, in IBM Plex Sans or
 * Mono; strong words thickened by an outline of their own colour,
 * emphasised ones slanted, as the page's type has no heavier or italic
 * face; what is drawn under and round them in flat colour. Seen too small
 * to read, its words are grey strokes. From one layout with the column's
 * (TextEditor/markdownLayout), in its units made `scale` as large, from
 * the group's origin, down negative.
 */
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { Text } from "@react-three/drei";
import type { Deco, Laid, Piece } from "../../TextEditor/markdownLayout";
import { COLOURS } from "../../TextEditor/markdownLayout";
import { faceStretch, measureText } from "../../TextEditor/markdownType";
import { DEFAULT_LABEL_FAMILY, labelFont } from "../../../../lib/chem/labelFonts";
import plexSans from "../../../../assets/fonts/IBMPlexSans-Regular.ttf?url";
import plexMono from "../../../../assets/fonts/IBMPlexMono-Regular.ttf?url";

/** How far an emphasised word leans, as a share of its height: as Plex's italics do. */
const LEAN = 0.2;
/** How thick a strong word's outline is, as a share of its size. */
const STRONG = "3.5%";
/** A stroke's colour, standing for words too small to read. */
const STROKE = "rgb(200, 206, 213)";

const noRaycast = () => null;

/**
 * Rows `first` to `rows` of a text laid out, `scale` world units a pixel of
 * it, the first's top at the origin: its words seen as much as `words` (0
 * strokes, 1 words), all of it as much as `opacity` - those rows within
 * `reach` of the first's top, in its pixels, where it says. `onReady` once
 * troika has set every part's letters.
 */
export function MarkdownRows({
  laid,
  first = 0,
  rows,
  scale,
  words,
  opacity = 1,
  order,
  reach = Infinity,
  onReady,
}: {
  laid: Laid;
  first?: number;
  rows: number;
  scale: number;
  words: number;
  opacity?: number;
  order?: number;
  reach?: number;
  onReady?: () => void;
}) {
  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const disc = useMemo(() => new THREE.CircleGeometry(1, 20), []);
  const ring = useMemo(() => new THREE.RingGeometry(0.75, 1, 20), []);
  useEffect(
    () => () => {
      plane.dispose();
      disc.dispose();
      ring.dispose();
    },
    [plane, disc, ring],
  );
  const shown = laid.rows.slice(first, rows);
  const shift = laid.rows[first]?.y ?? 0;
  const pieces = shown.flatMap((r) => r.pieces.filter((p) => p.text.trim()).map((p) => ({ p, top: r.y })));
  const within = (top: number) => top - shift < reach;
  // (told once every part's letters are set)
  const synced = useRef(new Set<number>());
  const ready = useRef(onReady);
  ready.current = onReady;
  const told = useRef(false);
  const sync = (i: number) => {
    synced.current.add(i);
    if (!told.current && synced.current.size >= pieces.length) {
      told.current = true;
      ready.current?.();
    }
  };
  useEffect(() => {
    if (!pieces.length && !told.current) {
      told.current = true;
      ready.current?.();
    }
  }, [pieces.length]);
  const at = (x: number, y: number): [number, number, number] => [x * scale, -y * scale, 0];
  const mesh = (key: string, geometry: THREE.BufferGeometry, x: number, y: number, sx: number, sy: number, colour: string, z = 0) => (
    <mesh key={key} visible={within(y - sy / 2)} geometry={geometry} position={[x * scale, -y * scale, z]} scale={[sx * scale, sy * scale, 1]} renderOrder={order} raycast={noRaycast}>
      {/* (in a pass's order, all of it drawn as what is seen through is, after the paper it lies on - never among the opaque, before it) */}
      <meshBasicMaterial color={colour} transparent={order != null || opacity < 1} opacity={opacity} depthWrite={false} depthTest={order == null} toneMapped={false} />
    </mesh>
  );
  const decoOf = (d: Deco, top: number, key: string) => {
    switch (d.kind) {
      case "fill":
        return [mesh(key, plane, d.x + d.w / 2, top + d.y + d.h / 2, d.w, d.h, d.colour, -1e-5)];
      case "frame":
        return [
          mesh(`${key}t`, plane, d.x + d.w / 2, top + d.y + 0.5, d.w, 1, d.colour),
          mesh(`${key}b`, plane, d.x + d.w / 2, top + d.y + d.h - 0.5, d.w, 1, d.colour),
          mesh(`${key}l`, plane, d.x + 0.5, top + d.y + d.h / 2, 1, d.h, d.colour),
          mesh(`${key}r`, plane, d.x + d.w - 0.5, top + d.y + d.h / 2, 1, d.h, d.colour),
        ];
      case "disc":
      case "ring":
        return [mesh(key, d.kind === "disc" ? disc : ring, d.x, top + d.y, d.r, d.r, d.colour)];
      case "square":
        return [mesh(key, plane, d.x, top + d.y, 2 * d.r, 2 * d.r, d.colour)];
      case "check":
        return d.checked
          ? [mesh(key, plane, d.x + d.size / 2, top + d.y + d.size / 2, d.size, d.size, COLOURS.link)]
          : [
              mesh(`${key}t`, plane, d.x + d.size / 2, top + d.y + 0.5, d.size, 1, COLOURS.muted),
              mesh(`${key}b`, plane, d.x + d.size / 2, top + d.y + d.size - 0.5, d.size, 1, COLOURS.muted),
              mesh(`${key}l`, plane, d.x + 0.5, top + d.y + d.size / 2, 1, d.size, COLOURS.muted),
              mesh(`${key}r`, plane, d.x + d.size - 0.5, top + d.y + d.size / 2, 1, d.size, COLOURS.muted),
            ];
    }
  };
  return (
    <group position={[0, shift * scale, 0]}>
      {shown.flatMap((r, i) => r.decos.flatMap((d, k) => decoOf(d, r.y, `d${i}:${k}`)))}
      {/* (far off, or small, its words as strokes) */}
      {words < 1 &&
        pieces.map(({ p, top }, i) => {
          const w = measureText(p.text.trimEnd(), p.font);
          const h = p.font.px * 0.42;
          return (
            <mesh key={`s${i}`} visible={within(top)} geometry={plane} position={[(p.x + w / 2) * scale, -(top + p.y - p.font.px * 0.32) * scale, 1e-5]} scale={[w * scale, h * scale, 1]} renderOrder={order} raycast={noRaycast}>
              <meshBasicMaterial color={STROKE} transparent opacity={(1 - words) * opacity} depthWrite={false} depthTest={order == null} toneMapped={false} />
            </mesh>
          );
        })}
      {words > 0 && pieces.map(({ p, top }, i) => <Words key={`w${i}`} p={p} top={top} scale={scale} opacity={words * opacity} order={order} visible={within(top)} onSync={() => sync(i)} at={at} />)}
    </group>
  );
}

/** A part of a row's words: slanted where emphasised, an outline thickening it where strong; struck through where it says. */
function Words({
  p,
  top,
  scale,
  opacity,
  order,
  visible,
  onSync,
  at,
}: {
  p: Piece;
  top: number;
  scale: number;
  opacity: number;
  order?: number;
  visible: boolean;
  onSync: () => void;
  at: (x: number, y: number) => [number, number, number];
}) {
  // (slanted about its baseline, where emphasised; as wide as its own face sets it, the page's regular one stretched)
  const lean = useMemo(() => {
    const k = faceStretch(p.text, p.font);
    if (!p.font.italic && k === 1) return null;
    return new THREE.Matrix4().set(k, p.font.italic ? LEAN : 0, 0, p.x * scale, 0, 1, 0, -(top + p.y) * scale, 0, 0, 1, 2e-5, 0, 0, 0, 1);
  }, [p, top, scale]);
  const strong = p.font.weight >= 600;
  const text = (
    <Text
      visible={visible}
      font={p.font.mono ? plexMono : plexSans}
      fontSize={p.font.px * scale}
      anchorX="left"
      anchorY="top-baseline"
      position={lean ? [0, 0, 0] : [...at(p.x, top + p.y).slice(0, 2), 2e-5] as [number, number, number]}
      color={p.colour}
      fillOpacity={opacity}
      outlineWidth={strong ? STRONG : 0}
      outlineColor={p.colour}
      outlineOpacity={strong ? opacity : 0}
      renderOrder={order}
      onSync={onSync}
      raycast={noRaycast}
    >
      {labelFont(DEFAULT_LABEL_FAMILY).shown(p.text)}
    </Text>
  );
  const strike = p.strike && (
    <mesh visible={visible} position={[(p.x + measureText(p.text, p.font) / 2) * scale, -(top + p.y - p.font.px * 0.3) * scale, 3e-5]} scale={[measureText(p.text, p.font) * scale, scale, 1]} renderOrder={order} raycast={noRaycast}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color={p.colour} transparent opacity={opacity} depthWrite={false} depthTest={order == null} toneMapped={false} />
    </mesh>
  );
  return (
    <>
      {lean ? (
        <group matrixAutoUpdate={false} matrix={lean}>
          {text}
        </group>
      ) : (
        text
      )}
      {strike}
    </>
  );
}
