/**
 * Pictures on the page (docs/PDF.md, *A picture*): each drawn as it is,
 * turned and as large as it is made, under the drawing and over the PDFs,
 * in the order they were put there - a light grey sheet until it has been
 * decoded - and lit round while the pointer is on it. A film (a render's,
 * docs/RENDER.md) plays as it lies there, over and over, without sound,
 * until it is paused from its menu.
 *
 * A press on one is as on empty space: a drag moves the view. Held still a
 * moment, it is taken hold of - lit from the pointer out, as a structure
 * is - and selected, and the drag then moves it. A click selects it alone;
 * Ctrl (⌘ on a Mac) and a click adds it to the selection or takes it out.
 * Selected, its frame shows, with a handle at each corner that makes it
 * larger or smaller, its proportions kept and the opposite corner where it
 * was; a drag on it moves the selection; it is turned, copied, cut and
 * deleted with the rest of the selection (Selection2D, clipboardActions).
 */
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import type { PictureFrom, PictureItem } from "../store/types";
import { pictureBytes } from "../../../../lib/picture/held";
import { isFilm } from "../../../../lib/picture/image";
import { filmTexture, textures, type Shared } from "./pictureTextures";
import { ALPHA, COLORS } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import { setCursor } from "../../../theme/cursors";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { pageAt } from "../utils/page";
import { cornersOf } from "../utils/selection";
import { dragSelection } from "../utils/dragSelection";
import { setViewGoal } from "./viewGoal";
import { DOUBLE_CLICK_MS, LONG_PRESS_MS } from "../constants";
import { HeldLight } from "./HeldLight";
import { heldShows, type Held } from "./held";
import { spotMoving, spotOn } from "./figureTie";
import { atomAtSpot } from "../utils/figures";

/** Where pictures lie: under the drawing and its selection's shade, over the PDFs (Pdfs2D's -0.4); each put there later a little over the one before - far enough apart for the depth buffer to tell them apart. */
const Z = -0.3;
const Z_STEP = 1e-3;
/** How lit a picture under the pointer is, and how far round it, on the screen, in pixels. */
const LIT = 0.16;
const LIT_PAD_PX = 5;
/** How far a press may move and still be a click; and before it moves the view (PanZoom2D's), when a hold begun is let go - in pixels. */
const CLICK_PX = 4;
const PAN_PX = 3;
/** A corner's handle, on the screen: its radius, and how far off it a press still takes it, in its radii; how small a picture may be made, in pixels. */
const HANDLE_PX = 6;
const HANDLE_HIT = 2;
const LEAST_PX = 12;
/** The grey a picture shows until it is decoded. */
const UNREAD = "#eef0f2";

type Pt = { x: number; y: number };

/** A picture's texture: none until it is decoded - `came` called then - or where its bytes are held nowhere. A film's draws a frame of the page for each of its own (`invalidate`). */
function useTexture(p: Pick<PictureItem, "sha256" | "media">, gl: THREE.WebGLRenderer, invalidate: () => void): THREE.Texture | null {
  const [, setCame] = useState(0);
  const key = p.sha256;
  useEffect(() => {
    let entry = textures.get(key);
    let release: (() => void) | undefined;
    if (!entry) {
      const made: Shared = { texture: null, users: 0, waiting: new Set() };
      textures.set(key, made);
      entry = made;
      const bytes = pictureBytes(key);
      if (bytes && isFilm(p.media)) release = filmTexture(made, bytes);
      else if (bytes) {
        createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: p.media }), { imageOrientation: "flipY" })
          .then((bitmap) => {
            const t = new THREE.Texture(bitmap);
            t.colorSpace = THREE.SRGBColorSpace;
            t.flipY = false;
            t.minFilter = THREE.LinearMipmapLinearFilter;
            t.magFilter = THREE.LinearFilter;
            t.generateMipmaps = true;
            t.anisotropy = gl.capabilities.getMaxAnisotropy();
            t.needsUpdate = true;
            made.texture = t;
            for (const w of made.waiting) w();
          })
          .catch(() => undefined);
      }
    }
    const e = entry;
    if (release) (e as Shared & { release?: () => void }).release = release;
    e.users++;
    const tell = () => setCame((n) => n + 1);
    e.waiting.add(tell);
    e.drawn?.add(invalidate);
    return () => {
      e.waiting.delete(tell);
      e.drawn?.delete(invalidate);
      if (--e.users > 0) return;
      // (gone a moment later, so that one moved to another place in the list is not decoded again)
      window.setTimeout(() => {
        if (e.users > 0 || textures.get(key) !== e) return;
        textures.delete(key);
        (e as Shared & { release?: () => void }).release?.();
        const image = e.video ? undefined : (e.texture?.image as ImageBitmap | undefined);
        e.texture?.dispose();
        image?.close?.();
      }, 1000);
    };
  }, [key, p.media, gl, invalidate]);
  return textures.get(key)?.texture ?? null;
}

export default function Pictures2D() {
  const pictures = useEditor((s) => s.pictures);
  const selPictures = useEditor((s) => s.selPictures);
  // (a box carried out of a PDF, settling where it was let go: the picture it became, once it has)
  const landing = useEditor((s) => s.pdfPicture?.landing ?? null);
  const hovered = useEditor((s) => s.hoveredPicture);
  const store = useEditorStore();
  const { camera, gl, invalidate, size } = useThree();

  // a picture just put on the page is brought into view, the view easing to it where it is not all in view
  const newest = useRef<number | null>(null);
  useEffect(() => {
    const top = pictures.reduce((m, p) => Math.max(m, p.id), 0);
    if (newest.current == null || top <= newest.current) {
      newest.current = Math.max(newest.current ?? 0, top);
      return;
    }
    // (one let go where the chemist put it - a box carried out of a PDF - stays as the view is)
    const landing = store.getState().pdfPicture?.landing;
    const added = pictures.filter((p) => p.id > newest.current! && p.id !== landing);
    newest.current = top;
    if (!added.length) return;
    const pts = added.flatMap(cornersOf);
    const b = { x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) };
    const cam = camera as THREE.OrthographicCamera;
    const a = pageAt(-1, -1, cam);
    const c = pageAt(1, 1, cam);
    const cover = store.getState().cover;
    const right = Math.max(a.x, c.x) - cover / cam.zoom;
    if (b.x0 >= Math.min(a.x, c.x) && b.x1 <= right && b.y0 >= Math.min(a.y, c.y) && b.y1 <= Math.max(a.y, c.y)) return;
    const zoom = Math.min((size.width - cover) / ((b.x1 - b.x0) * 1.12), size.height / ((b.y1 - b.y0) * 1.12), cam.zoom);
    setViewGoal(cam, { zoom, x: (b.x0 + b.x1) / 2 + cover / 2 / zoom, y: (b.y0 + b.y1) / 2 });
    invalidate();
  }, [pictures, camera, size, invalidate, store]);

  const toWorld = (cx: number, cy: number): Pt => {
    const rect = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };

  return (
    <group>
      {pictures.map((p, i) => (
        // (one landing there, unseen till then, but decoded meanwhile)
        <Picture key={p.id} p={p} z={Z + i * Z_STEP} selected={selPictures.has(p.id)} hovered={hovered === p.id} hidden={p.id === landing} toWorld={toWorld} />
      ))}
    </group>
  );
}

function Picture({
  p,
  z,
  selected,
  hovered,
  hidden,
  toWorld,
}: {
  p: PictureItem;
  z: number;
  selected: boolean;
  hovered: boolean;
  hidden: boolean;
  toWorld: (cx: number, cy: number) => Pt;
}) {
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const texture = useTexture(p, gl, invalidate);
  const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
  const px = 1 / zoom;
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
  // taken hold of by a press held on it: where, in its own frame, lit from there
  const [held, setHeld] = useState<(Held & Pt) | null>(null);
  const [, setTick] = useState(0);
  // (a frame for each change of it: let go, its light goes from the next one)
  useEffect(() => invalidate(), [held, invalidate]);
  useFrame(() => {
    if (!held || !heldShows(held, performance.now())) return;
    setTick((t) => t + 1);
    invalidate();
  });
  const local = (q: Pt): Pt => {
    const c = Math.cos(-(p.turn ?? 0));
    const s = Math.sin(-(p.turn ?? 0));
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  };

  const onDown = (e: { nativeEvent: PointerEvent; stopPropagation: () => void }) => {
    const ev = e.nativeEvent;
    if (ev.button !== 0) return;
    const st = store.getState();
    // (what is drawn over it is pressed, not it)
    if (st.hovered.atomId != null || st.hovered.bondId != null || st.hovered3d || st.hoveredArrow != null || st.hoveredPlus != null || st.hoveredCaption != null) return;
    e.stopPropagation();
    if (addsToSelection(ev)) {
      st.togglePictureSel(p.id);
      st.suppressDoubleClick(DOUBLE_CLICK_MS);
      return;
    }
    const from = { x: ev.clientX, y: ev.clientY };
    const move = () => {
      store.getState().beginPanHold(ev.pointerId);
      dragSelection(store, toWorld, from, (u) => {
        const s = store.getState();
        s.endPanHold(u.pointerId);
        s.suppressDoubleClick(DOUBLE_CLICK_MS);
        setHeld((h) => (h && h.let == null ? { ...h, let: performance.now() } : h));
      });
    };
    // selected: a drag moves the selection
    if (st.selPictures.has(p.id)) {
      move();
      return;
    }
    // else a drag moves the view; held still, it is taken hold of; a click selects it
    setHeld({ ...local(toWorld(ev.clientX, ev.clientY)), start: performance.now() });
    invalidate();
    let panned = false;
    const hold = window.setTimeout(() => {
      stop();
      const s = store.getState();
      s.clearSel();
      s.selectPictures([p.id]);
      setHeld((h) => (h ? { ...h, done: true } : h));
      move();
    }, LONG_PRESS_MS);
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
      const s = store.getState();
      s.clearSel();
      s.selectPictures([p.id]);
      s.suppressDoubleClick(DOUBLE_CLICK_MS);
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  const pad = LIT_PAD_PX * px;
  const now = performance.now();
  return (
    <group position={[p.x, p.y, z]} rotation={[0, 0, p.turn ?? 0]} visible={!hidden}>
      {/* (round it, not under it: a light under a picture shows through it at so near a depth) */}
      <group position={[0, 0, -Z_STEP / 2]}>
        {[
          [0, (p.h + pad) / 2, p.w + 2 * pad, pad],
          [0, -(p.h + pad) / 2, p.w + 2 * pad, pad],
          [(p.w + pad) / 2, 0, pad, p.h],
          [-(p.w + pad) / 2, 0, pad, p.h],
        ].map(([x, y, w, h], k) => (
          <mesh key={k} position={[x, y, 0]} scale={[w, h, 1]} material={lightMaterial}>
            <planeGeometry args={[1, 1]} />
          </mesh>
        ))}
      </group>
      <mesh
        scale={[p.w, p.h, 1]}
        onPointerOver={() => store.getState().setHoveredPicture(p.id)}
        onPointerOut={() => {
          if (store.getState().hoveredPicture === p.id) store.getState().setHoveredPicture(null);
          if (store.getState().figureLit != null) store.getState().setFigureLit(null);
        }}
        onPointerMove={(e) => {
          // (over where an atom read from it was drawn - from the PDF it was cut out of, or from it - that atom lit in the drawing)
          const q = local(e.point);
          const st = store.getState();
          let lit: number | null = null;
          for (const f of figuresIn(p)) {
            const x = f.box[0] + (q.x / p.w + 0.5) * (f.box[2] - f.box[0]);
            const y = f.box[1] + (0.5 - q.y / p.h) * (f.box[3] - f.box[1]);
            lit ??= atomAtSpot(st.model, f.sha256, f.page, x, y);
          }
          if (lit !== st.figureLit) st.setFigureLit(lit);
        }}
        onPointerDown={onDown}
      >
        <planeGeometry args={[1, 1]} />
        {/* (a material of its own once decoded: one made without a picture is drawn without one) */}
        {/* (a PNG's transparency kept: the page shows through a render's transparent background) */}
        {texture ? <meshBasicMaterial key="decoded" map={texture} toneMapped={false} transparent={p.media === "image/png"} /> : <meshBasicMaterial key="unread" color={UNREAD} toneMapped={false} />}
      </mesh>
      {figuresIn(p).map((f) => (
        <SpotRing key={f.page ?? "own"} p={p} from={f} />
      ))}
      {held && <HeldLight b={{ x0: -p.w / 2, x1: p.w / 2, y0: -p.h / 2, y1: p.h / 2 }} at={held} held={held} now={now} z={Z_STEP / 2} />}
      {selected && <Frame p={p} px={px} toWorld={toWorld} />}
    </group>
  );
}

/**
 * Where an atom read from the figure a picture was cut out of was drawn,
 * ringed on the picture while it is lit (components/figureTie), as the
 * drawing rings it.
 */
/** Where a picture shows a figure an atom may have been read from: the box of the PDF's page it was cut out of, if it was, and itself, in its pixels (no page). */
type FigureIn = { sha256: string; page?: number; box: PictureFrom["box"] };
const figuresIn = (p: PictureItem): FigureIn[] => [...(p.from ? [p.from] : []), { sha256: p.sha256, box: [0, 0, p.px[0], p.px[1]] }];

function SpotRing({ p, from }: { p: PictureItem; from: FigureIn }) {
  const { invalidate } = useThree();
  const mesh = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const now = performance.now();
    const s = spotOn(from.sha256, from.page, now);
    const [x0, y0, x1, y1] = from.box;
    const inside = s && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
    mesh.current.visible = !!inside;
    if (s && inside) {
      const k = p.w / (x1 - x0);
      mesh.current.position.set(((s.x - x0) / (x1 - x0) - 0.5) * p.w, (0.5 - (s.y - y0) / (y1 - y0)) * p.h, Z_STEP / 4);
      mesh.current.scale.set(s.r * k, s.r * k, 1);
      (mesh.current.material as THREE.MeshBasicMaterial).opacity = ALPHA.highlight * s.level;
    }
    if (spotMoving(now)) invalidate();
  });
  return (
    <mesh ref={mesh} visible={false}>
      <ringGeometry args={[0.82, 1, 48]} />
      <meshBasicMaterial color={COLORS.highlight} transparent opacity={0} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/**
 * A selected picture's frame, drawn in its own turned frame: its edge in
 * Meno's light and a handle at each corner, the same size on the screen at
 * any zoom. A handle dragged makes the picture larger or smaller - its
 * proportions kept, the opposite corner where it was - as one step.
 */
function Frame({ p, px, toWorld }: { p: PictureItem; px: number; toWorld: (cx: number, cy: number) => Pt }) {
  const store = useEditorStore();
  const { gl } = useThree();
  const edge = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(
      [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ].map(([x, y]) => new THREE.Vector3(x, y, 0)),
    );
    return g;
  }, []);
  useEffect(() => () => edge.dispose(), [edge]);
  const corners = cornersOf(p);
  // (each handle by the corner it is at - lower left, lower right, upper right, upper left - and the one across from it)
  const handles = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const;
  const startScale = (k: number, ev: PointerEvent) => {
    const fixed = corners[(k + 2) % 4];
    const grabbed = corners[k];
    const len = Math.hypot(grabbed.x - fixed.x, grabbed.y - fixed.y);
    const dir = { x: (grabbed.x - fixed.x) / len, y: (grabbed.y - fixed.y) / len };
    const least = (LEAST_PX * px * len) / Math.min(p.w, p.h);
    const gesture = `scale-${performance.now()}`;
    const st = store.getState();
    st.beginPanHold(ev.pointerId);
    const onMove = (m: PointerEvent) => {
      const q = toWorld(m.clientX, m.clientY);
      const along = Math.max(least, (q.x - fixed.x) * dir.x + (q.y - fixed.y) * dir.y);
      const f = along / len;
      store.getState().updatePicture(p.id, { w: p.w * f, h: p.h * f, x: fixed.x + (dir.x * along) / 2, y: fixed.y + (dir.y * along) / 2 }, gesture);
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      const s = store.getState();
      s.endPanHold(u.pointerId);
      s.suppressDoubleClick(DOUBLE_CLICK_MS);
      setCursor(gl.domElement, null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };
  // (the pointer a corner shows: down to the right or up to the right, as it points on the screen)
  const cornerCursor = (k: number) => {
    const c = corners[k];
    return (c.x - p.x) * (c.y - p.y) < 0 ? "corner-down" : "corner-up";
  };
  return (
    <group>
      <lineLoop geometry={edge} scale={[p.w, p.h, 1]} renderOrder={39}>
        <lineBasicMaterial color={COLORS.highlight} depthTest={false} toneMapped={false} transparent />
      </lineLoop>
      {handles.map(([i, j], k) => (
        <group
          key={k}
          position={[(i * p.w) / 2, (j * p.h) / 2, 0.001]}
          scale={HANDLE_PX * px}
          onPointerOver={() => setCursor(gl.domElement, cornerCursor(k))}
          onPointerOut={() => setCursor(gl.domElement, null)}
          onPointerDown={(e) => {
            if (e.nativeEvent.button !== 0) return;
            e.stopPropagation();
            startScale(k, e.nativeEvent);
          }}
        >
          <mesh>
            <circleGeometry args={[HANDLE_HIT, 20]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh renderOrder={41}>
            <circleGeometry args={[1, 20]} />
            <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
          </mesh>
          <mesh renderOrder={42}>
            <ringGeometry args={[0.68, 1, 20]} />
            <meshBasicMaterial color={COLORS.highlight} depthTest={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
