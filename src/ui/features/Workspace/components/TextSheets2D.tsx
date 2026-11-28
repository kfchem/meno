/**
 * Texts' sheets on the page (docs/PDF.md, *A text*, *What a thing on the
 * page is*): each a white sheet with its first lines, at the size they
 * would be printed (utils/textSheets), in Meno's monospaced type - signed-
 * distance glyphs (troika), sharp at every zoom - and its name under it, as
 * a PDF's is. Seen from far off, it is a picture of its own words, drawn
 * once and scaled down with the page (components/sheetPictures); nearer,
 * its words themselves take over from it, unseen.
 *
 * Handled as a picture is: a drag on it moves the view; held still, it is
 * taken hold of and moved; a click selects it, Ctrl/Cmd and a click adds it
 * or takes it out; selected, a drag moves the whole selection. Two clicks
 * read it in the column (hooks/useStructureEvents).
 */
import { longPressMs } from "../longPress";
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import type { WorkspaceText } from "../store/types";
import { COLORS } from "../../../theme/colors";
import { ICON_NAME_WIDTH, pointOf, scaleOf } from "../../../../lib/pdf/layout";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { DOUBLE_CLICK_MS } from "../constants";
import { iconScaleOf, restWords, SHEET_LINE_PT, SHEET_PAD_PT, SHEET_TYPE_PT, sheetBoxAt, sheetNameRoom, sheetOfText } from "../utils/textSheets";
import { dragSelection } from "../utils/dragSelection";
import { follow, TAU } from "../../../theme/motion";
import { needsFallback, useLabelFontUrl } from "../../../fonts/typefaces";
import { DEFAULT_LABEL_FAMILY, labelFont } from "../../../../lib/chem/labelFonts";
import { useDrawnLayout, useDrawnZoom } from "./drawnLayoutContext";
import { pageAt } from "../utils/page";
import { pageLength } from "../utils/pageScale";
import { devicePx, thinLine } from "../pageGl/units";
import { HeldLight } from "./HeldLight";
import { heldShows, type Held } from "./held";
import { GRAY } from "./pdfPictures";
import { ease } from "./Pdfs2D";
import { MarkdownRows } from "./MarkdownRows";
import { useMarkdownType } from "../../TextEditor/markdownType";
import { pictureKey, sheetDrawing } from "../utils/sheetPicture";
import { pictureMaterial, useSheetPicture, useViewStill } from "./sheetPictures";
import plexMono from "../../../../assets/fonts/IBMPlexMono-Regular.ttf?url";

/** Over the PDFs, under the pictures and the drawing; each put there later a step over the one before. */
const Z = -0.35;
const Z_STEP = 1e-3;
/** How far a press moves before it is a drag, and how far before it moves the view, in pixels. */
const CLICK_PX = 4;
const PAN_PX = 3;
/** The light round a sheet hovered, and how far out it reaches, in page pixels. */
const LIT = 0.16;
const LIT_PAD_PX = 5;
/** The sheet's colours: its paper, its edge and its words. */
const PAPER = "#ffffff";
const EDGE = "rgb(209, 217, 224)";
const INK = "rgb(31, 35, 40)";
/** How long it takes to be made an icon, or full size again, in ms - as a PDF. */
const ICON_MS = 380;

type Pt = { x: number; y: number };
const noRaycast = () => null;

export default function TextSheets2D() {
  const texts = useEditor((s) => s.texts);
  const selTexts = useEditor((s) => s.selTexts);
  const hovered = useEditor((s) => s.hoveredText);
  const { camera, gl } = useThree();
  const { opts } = useDrawnLayout();
  const sheets = useMemo(() => texts.filter((t) => t.at), [texts]);
  // (their pictures made only while the view is still)
  useViewStill();
  const nameFont = useLabelFontUrl(opts.fontFamily ?? "Arial", needsFallback(sheets.map((t) => t.name)));
  const toWorld = (cx: number, cy: number): Pt => {
    const rect = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };
  return (
    <group>
      {sheets.map((t, i) => (
        <Sheet key={t.id} t={t} z={Z + i * Z_STEP} selected={selTexts.has(t.id)} hovered={hovered === t.id} nameFont={nameFont ?? undefined} nameFamily={opts.fontFamily ?? "Arial"} nameSize={opts.fontPx} toWorld={toWorld} />
      ))}
    </group>
  );
}

function Sheet({
  t,
  z,
  selected,
  hovered,
  nameFont,
  nameFamily,
  nameSize,
  toWorld,
}: {
  t: WorkspaceText;
  z: number;
  selected: boolean;
  hovered: boolean;
  nameFont?: string;
  nameFamily: string;
  nameSize: number;
  toWorld: (cx: number, cy: number) => Pt;
}) {
  const store = useEditorStore();
  const { invalidate, gl } = useThree();
  // (being edited: shown in the column, open, its words typed there)
  const editing = useEditor((st) => st.textsOpen && st.textShown === t.id) && t.reading !== false;
  // (the view's zoom as the drawing takes it up: drawn again as it changes - drawnLayoutContext `useDrawnZoom`)
  const zoom = useDrawnZoom();
  // (kept by its text - a Markdown text's laid out again once its type has come)
  const typeVersion = useMarkdownType();
  const s = sheetOfText(t);
  const [, setTick] = useState(0);
  const at = t.at!;
  // (at the point it was laid at: the workspace's, or ACS 1996's for one kept from before)
  const point = pointOf(t);
  const pad = SHEET_PAD_PT * point;
  const line = SHEET_LINE_PT * point;
  // how large it is drawn: 1 full size, an icon's size made small, or on its way between them - as a PDF is
  const small = iconScaleOf(s, scaleOf(t));
  const turning = useRef<{ to: boolean; start: number } | null>(null);
  const was = useRef(!!t.icon);
  if (was.current !== !!t.icon) {
    turning.current = { to: !!t.icon, start: performance.now() };
    was.current = !!t.icon;
  }
  const tm = turning.current;
  const it = tm ? ease(Math.min(1, (performance.now() - tm.start) / ICON_MS)) : 1;
  const k = tm ? (tm.to ? 1 + (small - 1) * it : small + (1 - small) * it) : t.icon ? small : 1;
  // (how much of an icon it is, 0 to 1: its name going under its middle)
  const iconness = small < 1 ? (1 - k) / (1 - small) : t.icon ? 1 : 0;
  useFrame(() => {
    const m = turning.current;
    if (!m) return;
    if (performance.now() - m.start > ICON_MS + 80) turning.current = null;
    setTick((n) => n + 1);
    invalidate();
  });
  const b = sheetBoxAt(at, s, k);
  const mid = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  // (its words, once the letters Meno's typefaces have are known - those they have not drawn as squares: lib/chem/labelFonts `STAND_IN`:
  // far off, a picture of them drawn once (utils/sheetPicture), made again only as what it shows changes; near, or edited, the words themselves)
  const lettersKnown = useLabelFontUrl(DEFAULT_LABEL_FAMILY, needsFallback(s.md ? [s.md.laid.plain.slice(0, 8000)] : s.lines)) != null;
  const typePx = SHEET_TYPE_PT * point * zoom * k;
  const sheetGroup = useRef<THREE.Group>(null);
  const key = `${pictureKey(t.text, s.w, s.h, point, lettersKnown)}|${s.md ? typeVersion : 0}`;
  const picture = useSheetPicture(t.id, sheetGroup, key, lettersKnown && !editing && !tm, s.w, s.h, SHEET_TYPE_PT * point);
  // (the picture comes in, and goes, eased - never at once)
  const pictureIn = useRef(0);
  const inTo = picture.made && !editing ? 1 : 0;
  useFrame((_, dt) => {
    if (pictureIn.current === inTo) return;
    if (Math.abs(pictureIn.current - inTo) < 1e-3) {
      // (come quite: drawn once more, its live words let go of where the picture is all that is seen)
      pictureIn.current = inTo;
      setTick((n) => n + 1);
      invalidate();
      return;
    }
    pictureIn.current = follow(pictureIn.current, inTo, Math.min(dt, 1 / 20), TAU.move);
    setTick((n) => n + 1);
    invalidate();
  });
  const drawing = sheetDrawing(typePx, editing, picture.made || pictureIn.current > 0, pictureIn.current);
  const live = lettersKnown && drawing.live;
  const shownMaterial = useMemo(() => pictureMaterial(), []);
  useEffect(() => () => shownMaterial.dispose(), [shownMaterial]);
  shownMaterial.uniforms.map.value = picture.texture;
  shownMaterial.uniforms.opacity.value = drawing.picture;

  // the light round it while the pointer is on it, coming and going
  const lightMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: COLORS.highlight, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => lightMaterial.dispose(), [lightMaterial]);
  useFrame((_, dt) => {
    const m = lightMaterial;
    const to = hovered ? LIT : 0;
    if (Math.abs(m.opacity - to) < 1e-3) {
      m.opacity = to;
      return;
    }
    m.opacity = follow(m.opacity, to, Math.min(dt, 1 / 20), TAU.quick);
    invalidate();
  });
  // taken hold of by a press held on it: where on the page, lit from there
  const [held, setHeld] = useState<(Held & Pt) | null>(null);
  useEffect(() => invalidate(), [held, invalidate]);
  useFrame(() => {
    if (!held || !heldShows(held, performance.now())) return;
    setTick((k) => k + 1);
    invalidate();
  });

  const onDown = (e: { nativeEvent: PointerEvent; stopPropagation: () => void }) => {
    const ev = e.nativeEvent;
    if (ev.button !== 0) return;
    const st = store.getState();
    // (what is drawn over it is pressed, not it)
    if (st.hovered.atomId != null || st.hovered.bondId != null || st.hovered3d || st.hoveredArrow != null || st.hoveredPlus != null || st.hoveredCaption != null || st.hoveredPicture != null) return;
    e.stopPropagation();
    if (addsToSelection(ev)) {
      st.toggleTextSel(t.id);
      st.suppressDoubleClick(DOUBLE_CLICK_MS);
      return;
    }
    const from = { x: ev.clientX, y: ev.clientY };
    const move = () => {
      store.getState().beginPanHold(ev.pointerId);
      dragSelection(store, toWorld, from, (u) => {
        const s2 = store.getState();
        s2.endPanHold(u.pointerId);
        setHeld((h) => (h && h.let == null ? { ...h, let: performance.now() } : h));
      });
    };
    // selected: a drag moves the selection
    if (st.selTexts.has(t.id)) {
      move();
      return;
    }
    // else a drag moves the view; held still, it is taken hold of; a click selects it
    const q = toWorld(ev.clientX, ev.clientY);
    setHeld({ x: q.x, y: q.y, start: performance.now() });
    invalidate();
    let panned = false;
    const hold = window.setTimeout(() => {
      stop();
      const s2 = store.getState();
      s2.clearSel();
      s2.selectTexts([t.id]);
      setHeld((h) => (h ? { ...h, done: true } : h));
      move();
    }, longPressMs());
    const onMove = (m: PointerEvent) => {
      if (panned || Math.hypot(m.clientX - from.x, m.clientY - from.y) < PAN_PX) return;
      panned = true;
      window.clearTimeout(hold);
      setHeld((h) => (h ? { ...h, let: performance.now() } : h));
    };
    const onUp = (u: PointerEvent) => {
      stop();
      window.clearTimeout(hold);
      setHeld((h) => (h && h.let == null ? { ...h, let: performance.now() } : h));
      if (panned || Math.hypot(u.clientX - from.x, u.clientY - from.y) >= CLICK_PX) return;
      // (a click: it alone selected - a second click, the first's: read in the column, by the canvas's double-click)
      const s2 = store.getState();
      s2.clearSel();
      s2.selectTexts([t.id]);
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  // (its light round it as large on the page at every zoom)
  const pg = pageLength(1);
  const lit = LIT_PAD_PX * pg;
  const now = performance.now();
  // (its edge a page pixel - thinner than a device pixel, a device pixel wide and as much fainter: pageGl/units `thinLine`)
  const edgeLine = thinLine(pg, devicePx(zoom, gl.getPixelRatio()));
  const edge = edgeLine.width;
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  // its name under it, in the drawing's type: at its left as a sheet, at a size on the page; under its middle as an icon, at the size of the drawing's labels, as a file's under its icon - and on
  // its way between them (as a PDF's)
  const nameX = b.x0 + (mid.x - b.x0) * iconness;
  // (a sheet's: its size, gap and width as the built document's layout counts them - ../utils/textSheets `sheetNameRoom`)
  const full = sheetNameRoom({ x0: b.x0, x1: b.x0 + s.w, y0: b.y0 });
  const nameSizeNow = full.size * (1 - iconness) + nameSize * iconness;
  const nameGap = full.gap * (1 - iconness) + 0.4 * nameSize * iconness;
  const nameWidth = full.width * (1 - iconness) + ICON_NAME_WIDTH * scaleOf(t) * iconness;
  return (
    <group position={[0, 0, z]}>
      {/* (round it, not under it, as a picture's) */}
      {[
        [mid.x, b.y1 + lit / 2, w + 2 * lit, lit],
        [mid.x, b.y0 - lit / 2, w + 2 * lit, lit],
        [b.x1 + lit / 2, mid.y, lit, h],
        [b.x0 - lit / 2, mid.y, lit, h],
      ].map(([x, y, ww, hh], i) => (
        <mesh key={`lit${i}`} position={[x, y, -Z_STEP / 2]} scale={[ww, hh, 1]} material={lightMaterial} raycast={noRaycast}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
      {/* the sheet, made small about its middle as an icon: its paper, and its lines on it */}
      <group position={[mid.x, mid.y, 0]} scale={[k, k, 1]}>
        <group ref={sheetGroup} position={[-s.w / 2, s.h / 2, 0]}>
          <mesh
            position={[s.w / 2, -s.h / 2, 0]}
            scale={[s.w, s.h, 1]}
            onPointerOver={() => store.getState().setHoveredText(t.id)}
            onPointerOut={() => {
              if (store.getState().hoveredText === t.id) store.getState().setHoveredText(null);
            }}
            onPointerDown={onDown}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial color={PAPER} toneMapped={false} />
          </mesh>
          {/* a Markdown text's first rows, formatted, as the column shows them */}
          {s.md && live && (
            <group position={[0, 0, Z_STEP / 4]}>
              <MarkdownRows laid={s.md.laid} rows={s.md.rows} scale={s.md.scale} />
            </group>
          )}
          {/* its words - a line at a time: a letter the type lacks, taken from another, takes no line but its own with it */}
          {!s.md &&
            live &&
            s.lines.map((l, i) =>
              l.trim() ? (
                <Text
                  key={`line${i}`}
                  font={plexMono}
                  fontSize={SHEET_TYPE_PT * point}
                  anchorX="left"
                  anchorY="middle"
                  position={[pad, -(pad + (i + 0.5) * line), Z_STEP / 4]}
                  color={INK}
                  clipRect={[0, -line, s.w - 2 * pad, line]}
                  raycast={noRaycast}
                >
                  {labelFont(DEFAULT_LABEL_FAMILY).shown(l)}
                </Text>
              ) : null,
            )}
          {/* a text that goes on past its sheet: its last line says how many lines are not on it, in the name's grey */}
          {s.rest && live && (
            <Text
              font={plexMono}
              fontSize={SHEET_TYPE_PT * point}
              anchorX="left"
              anchorY="middle"
              position={[s.rest.x, -s.rest.y, Z_STEP / 4]}
              color={GRAY}
              raycast={noRaycast}
            >
              {restWords(s.rest.lines)}
            </Text>
          )}
        </group>
      </group>
      {/* far off, its picture of its words over them - the words' own look, drawn once - fading as they take over */}
      {picture.texture && drawing.picture > 0 && (
        <mesh position={[mid.x, mid.y, Z_STEP * 0.3]} scale={[w, h, 1]} material={shownMaterial} raycast={noRaycast}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      )}
      {/* its edge, a page pixel wide - or the selection's light, where it is selected */}
      {[
        [mid.x, b.y1, w, edge],
        [mid.x, b.y0, w, edge],
        [b.x0, mid.y, edge, h],
        [b.x1, mid.y, edge, h],
      ].map(([x, y, ww, hh], i) => (
        <mesh key={`edge${i}`} position={[x, y, Z_STEP / 3]} scale={[selected ? ww + edge : ww, selected ? hh + edge : hh, 1]} raycast={noRaycast}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color={selected ? COLORS.highlight : EDGE} transparent opacity={edgeLine.ink} toneMapped={false} />
        </mesh>
      ))}
      <group position={[nameX, b.y0 - nameGap, Z_STEP / 4]}>
        {/* (troika takes a share of the text's width as its anchor; drei's types do not say so) */}
        <Text
          font={nameFont}
          fontSize={nameSizeNow}
          anchorX={`${50 * iconness}%` as unknown as number}
          anchorY="top"
          color={GRAY}
          maxWidth={nameWidth}
          textAlign={iconness > 0.5 ? "center" : "left"}
          raycast={noRaycast}
        >
          {labelFont(nameFamily).shown(t.name)}
        </Text>
      </group>
      {held && <HeldLight b={b} at={held} held={held} now={now} z={Z_STEP / 2} />}
    </group>
  );
}
