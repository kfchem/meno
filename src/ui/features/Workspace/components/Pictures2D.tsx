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
import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { guideScale } from "../utils/guiding";
import { dragSelection } from "../utils/dragSelection";
import { setViewGoal } from "./viewGoal";
import { DOUBLE_CLICK_MS, LONG_PRESS_MS } from "../constants";
import { HeldLight } from "./HeldLight";
import { heldShows, type Held } from "./held";
import { spotMoving, spotOn } from "./figureTie";
import { atomAtSpot } from "../utils/figures";
import { greatest, least } from "../../../../lib/chem/lists";

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

/**
 * The shapes every picture draws with, made once and shared: a geometry each
 * was 9,000 pictures' 45,000 - 162,000 with them all selected - all of them
 * made and thrown away as the pictures came and went. So too the colours of
 * the selected ones' frames, the same for all.
 */
const PLANE = new THREE.PlaneGeometry(1, 1);
const SPOT_RING = new THREE.RingGeometry(0.82, 1, 48);
const HANDLE_HIT_DISC = new THREE.CircleGeometry(HANDLE_HIT, 20);
const HANDLE_DISC = new THREE.CircleGeometry(1, 20);
const HANDLE_RING = new THREE.RingGeometry(0.68, 1, 20);
const EDGE_LINE = new THREE.LineBasicMaterial({ color: COLORS.highlight, depthTest: false, toneMapped: false, transparent: true });
const HANDLE_HIT_FILL = new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0, depthWrite: false });
const HANDLE_FILL = new THREE.MeshBasicMaterial({ color: "#ffffff", depthTest: false, toneMapped: false });
const HANDLE_LINE = new THREE.MeshBasicMaterial({ color: COLORS.highlight, depthTest: false, toneMapped: false });

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
  // (each picture's work at each frame done from this one callback: one each made every mount and unmount cost as much as all of them)
  const parts = useMemo(() => new Set<PartFrame>(), []);
  useFrame((_, dt) => {
    const px = 1 / ((camera as THREE.OrthographicCamera).zoom || 1);
    for (const part of parts) part(px, dt);
  });

  // a picture just put on the page is brought into view, the view easing to it where it is not all in view
  const newest = useRef<number | null>(null);
  useEffect(() => {
    const top = pictures.reduce((m, p) => Math.max(m, p.id), 0);
    if (newest.current == null || top <= newest.current) {
      newest.current = Math.max(newest.current ?? 0, top);
      return;
    }
    // (one let go where the chemist put it - a box carried out of a PDF - or a render's, the view eased to as it was begun, stays as the view is)
    const { pdfPicture, picturesLaid } = store.getState();
    const added = pictures.filter((p) => p.id > newest.current! && p.id !== pdfPicture?.landing && !picturesLaid.has(p.id));
    newest.current = top;
    if (!added.length) return;
    const pts = added.flatMap(cornersOf);
    // (four corners each, more than a call takes as its arguments where thousands come at once: not spread)
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const b = { x0: least(xs), x1: greatest(xs), y0: least(ys), y1: greatest(ys) };
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

  const toWorld = useCallback(
    (cx: number, cy: number): Pt => {
      const rect = gl.domElement.getBoundingClientRect();
      const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
      return { x: p.x, y: p.y };
    },
    [gl, camera],
  );

  // (the selected ones' frames, but not one still landing, unseen till then)
  const framed = useMemo(() => pictures.flatMap((p, i) => (selPictures.has(p.id) && p.id !== landing ? [{ p, z: Z + i * Z_STEP }] : [])), [pictures, selPictures, landing]);

  return (
    <PartFrames.Provider value={parts}>
      <group>
        {pictures.map((p, i) => (
          // (one landing there, unseen till then, but decoded meanwhile)
          <Picture key={p.id} p={p} z={Z + i * Z_STEP} hovered={hovered === p.id} hidden={p.id === landing} toWorld={toWorld} />
        ))}
      </group>
      {framed.length > 0 && <Frames framed={framed} toWorld={toWorld} />}
    </PartFrames.Provider>
  );
}

/** A part's work at each frame, before it is drawn: given a pixel's size on the page, and the frame's time. */
type PartFrame = (px: number, dt: number) => void;
const PartFrames = createContext<Set<PartFrame> | null>(null);

/** `work` done at each frame by the pictures' one frame callback (Pictures2D), as long as the part is there. */
function usePartFrame(work: PartFrame): void {
  const parts = useContext(PartFrames);
  const latest = useRef(work);
  latest.current = work;
  useEffect(() => {
    if (!parts) return;
    const part: PartFrame = (px, dt) => latest.current(px, dt);
    parts.add(part);
    return () => void parts.delete(part);
  }, [parts]);
}

// (drawn again only as it changes: a pointer coming onto one picture leaves the other thousands as they were)
const Picture = memo(function Picture({
  p,
  z,
  hovered,
  hidden,
  toWorld,
}: {
  p: PictureItem;
  z: number;
  hovered: boolean;
  hidden: boolean;
  toWorld: (cx: number, cy: number) => Pt;
}) {
  const store = useEditorStore();
  // (the canvas's state taken a part at a time: the whole of it would draw every picture again as any of it changed)
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const texture = useTexture(p, gl, invalidate);
  // the light round it while the pointer is on it, coming and going - there only as long as it is, as are the rings below
  // (each part there for every picture was a part to take away as thousands were deleted, each taking longer for them all)
  const [glowing, setGlowing] = useState(false);
  if (hovered && !glowing) setGlowing(true);
  const figures = useMemo(() => figuresIn(p), [p]);
  const [ringed, setRinged] = useState(false);
  usePartFrame(() => {
    const now = performance.now();
    const on = figures.some((f) => insideBox(spotOn(f.sha256, f.page, now), f.box));
    if (on !== ringed) setRinged(on);
  });
  // an atom lit in the drawing from a place in it: unlit as the pointer leaves it - or as it goes, under the pointer
  const lit = useRef(false);
  const unlight = () => {
    if (lit.current && store.getState().figureLit != null) store.getState().setFigureLit(null);
    lit.current = false;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- (once, as it goes)
  useEffect(() => unlight, []);
  // taken hold of by a press held on it: where, in its own frame, lit from there
  const [held, setHeld] = useState<(Held & Pt) | null>(null);
  const [, setTick] = useState(0);
  // (a frame for each change of it: let go, its light goes from the next one)
  useEffect(() => invalidate(), [held, invalidate]);
  usePartFrame(() => {
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

  const now = performance.now();
  return (
    <group position={[p.x, p.y, z]} rotation={[0, 0, p.turn ?? 0]} visible={!hidden}>
      {glowing && <LightRound p={p} on={hovered} out={() => setGlowing(false)} />}
      <mesh
        scale={[p.w, p.h, 1]}
        onPointerOver={() => store.getState().setHoveredPicture(p.id)}
        onPointerOut={() => {
          if (store.getState().hoveredPicture === p.id) store.getState().setHoveredPicture(null);
          unlight();
        }}
        onPointerMove={(e) => {
          // (over where an atom read from it was drawn - from the PDF it was cut out of, or from it - that atom lit in the drawing)
          const q = local(e.point);
          const st = store.getState();
          let atom: number | null = null;
          for (const f of figures) {
            const x = f.box[0] + (q.x / p.w + 0.5) * (f.box[2] - f.box[0]);
            const y = f.box[1] + (0.5 - q.y / p.h) * (f.box[3] - f.box[1]);
            atom ??= atomAtSpot(st.model, f.sha256, f.page, x, y);
          }
          if (atom !== st.figureLit) st.setFigureLit(atom);
          lit.current = atom != null;
        }}
        onPointerDown={onDown}
        geometry={PLANE}
      >
        {/* (a material of its own once decoded: one made without a picture is drawn without one) */}
        {/* (a PNG's transparency kept: the page shows through a render's transparent background) */}
        {texture ? <meshBasicMaterial key="decoded" map={texture} toneMapped={false} transparent={p.media === "image/png"} /> : <meshBasicMaterial key="unread" color={UNREAD} toneMapped={false} />}
      </mesh>
      {ringed && figures.map((f) => <SpotRing key={f.page ?? "own"} p={p} from={f} />)}
      {held && <HeldLight b={{ x0: -p.w / 2, x1: p.w / 2, y0: -p.h / 2, y1: p.h / 2 }} at={held} held={held} now={now} z={Z_STEP / 2} />}
    </group>
  );
});

/** The light round a picture (Picture's), coming as it is `on` and going as it is not - `out` called once gone - its band the same width on the screen at any zoom. */
function LightRound({ p, on, out }: { p: PictureItem; on: boolean; out: () => void }) {
  const invalidate = useThree((s) => s.invalidate);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: COLORS.highlight, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => material.dispose(), [material]);
  const bars = useRef<(THREE.Mesh | null)[]>([]);
  usePartFrame((px, dt) => {
    const pad = LIT_PAD_PX * px;
    const at = [
      [0, (p.h + pad) / 2, p.w + 2 * pad, pad],
      [0, -(p.h + pad) / 2, p.w + 2 * pad, pad],
      [(p.w + pad) / 2, 0, pad, p.h],
      [-(p.w + pad) / 2, 0, pad, p.h],
    ];
    bars.current.forEach((b, k) => {
      b?.position.set(at[k][0], at[k][1], 0);
      b?.scale.set(at[k][2], at[k][3], 1);
    });
    const to = on ? LIT : 0;
    if (Math.abs(material.opacity - to) < 1e-3) {
      material.opacity = to;
      if (!on) out();
      return;
    }
    material.opacity = follow(material.opacity, to, Math.min(dt, 1 / 20), TAU.quick);
    invalidate();
  });
  return (
    // (round it, not under it: a light under a picture shows through it at so near a depth)
    <group position={[0, 0, -Z_STEP / 2]}>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} ref={(m) => void (bars.current[k] = m)} geometry={PLANE} material={material} />
      ))}
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
/** Whether the ring `s` is in the figure's `box`. */
const insideBox = (s: { x: number; y: number } | null, [x0, y0, x1, y1]: FigureIn["box"]) => !!s && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;

function SpotRing({ p, from }: { p: PictureItem; from: FigureIn }) {
  const invalidate = useThree((s) => s.invalidate);
  const mesh = useRef<THREE.Mesh>(null!);
  usePartFrame(() => {
    const now = performance.now();
    const s = spotOn(from.sha256, from.page, now);
    const [x0, y0, x1, y1] = from.box;
    const inside = insideBox(s, from.box);
    mesh.current.visible = inside;
    if (s && inside) {
      const k = p.w / (x1 - x0);
      mesh.current.position.set(((s.x - x0) / (x1 - x0) - 0.5) * p.w, (0.5 - (s.y - y0) / (y1 - y0)) * p.h, Z_STEP / 4);
      mesh.current.scale.set(s.r * k, s.r * k, 1);
      (mesh.current.material as THREE.MeshBasicMaterial).opacity = ALPHA.highlight * s.level;
    }
    if (spotMoving(now)) invalidate();
  });
  return (
    <mesh ref={mesh} visible={false} geometry={SPOT_RING}>
      <meshBasicMaterial color={COLORS.highlight} transparent opacity={0} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/**
 * The selected pictures' frames, drawn all together: each one's edge in
 * Meno's light and a handle at each corner, the same size on the screen at
 * any zoom. A handle dragged makes its picture larger or smaller - its
 * proportions kept, the opposite corner where it was - as one step; Escape
 * on the way lets it go, as large as it was.
 *
 * (A frame each, its handles each a part to point at, was some twenty parts
 * a picture: thousands selected took seconds to come and to go.)
 */
function Frames({ framed, toWorld }: { framed: { p: PictureItem; z: number }[]; toWorld: (cx: number, cy: number) => Pt }) {
  const store = useEditorStore();
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  // the edges, as one set of lines
  const edges = useMemo(() => {
    const at = new Float32Array(framed.length * 24);
    framed.forEach(({ p, z }, i) => {
      const c = cornersOf(p);
      for (let k = 0; k < 4; k++) {
        const a = c[k];
        const b = c[(k + 1) % 4];
        at.set([a.x, a.y, z, b.x, b.y, z], i * 24 + k * 6);
      }
    });
    return new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(at, 3));
  }, [framed]);
  useEffect(() => () => void edges.dispose(), [edges]);
  // the handles, each corner's an instance - what a press takes, never drawn; its white; its ring - room kept for more as more are selected
  const room = 2 ** Math.ceil(Math.log2(Math.max(4, framed.length * 4)));
  const hit = useRef<THREE.InstancedMesh>(null);
  const fill = useRef<THREE.InstancedMesh>(null);
  const ring = useRef<THREE.InstancedMesh>(null);
  const laidAt = useRef(0);
  const lay = useCallback(
    (px: number) => {
      const meshes = [hit.current, fill.current, ring.current];
      const m = new THREE.Matrix4();
      framed.forEach(({ p, z }, i) =>
        cornersOf(p).forEach((c, k) => {
          m.makeScale(HANDLE_PX * px, HANDLE_PX * px, 1).setPosition(c.x, c.y, z + 0.001);
          for (const mesh of meshes) mesh?.setMatrixAt(i * 4 + k, m);
        }),
      );
      for (const mesh of meshes) {
        if (!mesh) continue;
        mesh.count = framed.length * 4;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
      laidAt.current = px;
      invalidate();
    },
    [framed, invalidate],
  );
  // (laid before they are first drawn, and again as the zoom changes)
  useLayoutEffect(() => lay(1 / ((camera as THREE.OrthographicCamera).zoom || 1)), [lay, room, camera]);
  usePartFrame((px) => {
    if (px !== laidAt.current) lay(px);
  });
  const startScale = (p: PictureItem, k: number, ev: PointerEvent) => {
    const corners = cornersOf(p);
    const fixed = corners[(k + 2) % 4];
    const grabbed = corners[k];
    const len = Math.hypot(grabbed.x - fixed.x, grabbed.y - fixed.y);
    const dir = { x: (grabbed.x - fixed.x) / len, y: (grabbed.y - fixed.y) / len };
    const px = 1 / ((camera as THREE.OrthographicCamera).zoom || 1);
    const least = (LEAST_PX * px * len) / Math.min(p.w, p.h);
    const gesture = `scale-${performance.now()}`;
    const st = store.getState();
    st.beginPanHold(ev.pointerId);
    // (as wide or as tall as something near, where it comes near - upright, as most are: docs/PRESENTING.md, *Guides*)
    const placeAt = (f: number) => ({ w: p.w * f, h: p.h * f, x: fixed.x + (dir.x * len * f) / 2, y: fixed.y + (dir.y * len * f) / 2 });
    const boxAt = (f: number) => {
      const q = cornersOf({ ...p, ...placeAt(f) });
      return { x0: Math.min(...q.map((v) => v.x)), y0: Math.min(...q.map((v) => v.y)), x1: Math.max(...q.map((v) => v.x)), y1: Math.max(...q.map((v) => v.y)) };
    };
    const guide = guideScale(store, toWorld, { x: ev.clientX, y: ev.clientY }, boxAt(1));
    const onMove = (m: PointerEvent) => {
      const q = toWorld(m.clientX, m.clientY);
      const along = Math.max(least, (q.x - fixed.x) * dir.x + (q.y - fixed.y) * dir.y);
      const f = Math.max(least / len, guide.step(along / len, m, boxAt));
      store.getState().updatePicture(p.id, placeAt(f), gesture);
    };
    // Escape lets it go, as large as it was (as a drag of the selection: the maintainer, 2026-10-12)
    const onKey = (k: KeyboardEvent) => {
      if (k.key !== "Escape") return;
      k.preventDefault();
      k.stopPropagation();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey, true);
      guide.end();
      store.getState().dropPictureChange(p.id, gesture);
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("keydown", onKey, true);
      guide.end();
      const s = store.getState();
      s.endPanHold(u.pointerId);
      s.suppressDoubleClick(DOUBLE_CLICK_MS);
      setCursor(gl.domElement, null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("keydown", onKey, true);
  };
  // (the pointer a corner shows: down to the right or up to the right, as it points on the screen)
  const cornerCursor = (at: number | undefined) => {
    if (at == null || !framed[at >> 2]) return null;
    const { p } = framed[at >> 2];
    const c = cornersOf(p)[at % 4];
    return (c.x - p.x) * (c.y - p.y) < 0 ? "corner-down" : "corner-up";
  };
  return (
    <group>
      <lineSegments geometry={edges} material={EDGE_LINE} renderOrder={39} frustumCulled={false} />
      <instancedMesh
        key={room}
        ref={hit}
        args={[HANDLE_HIT_DISC, HANDLE_HIT_FILL, room]}
        frustumCulled={false}
        onPointerOver={(e) => setCursor(gl.domElement, cornerCursor(e.instanceId))}
        onPointerMove={(e) => setCursor(gl.domElement, cornerCursor(e.instanceId))}
        onPointerOut={() => setCursor(gl.domElement, null)}
        onPointerDown={(e) => {
          if (e.nativeEvent.button !== 0 || e.instanceId == null || !framed[e.instanceId >> 2]) return;
          e.stopPropagation();
          startScale(framed[e.instanceId >> 2].p, e.instanceId % 4, e.nativeEvent);
        }}
      />
      <instancedMesh key={`fill-${room}`} ref={fill} args={[HANDLE_DISC, HANDLE_FILL, room]} renderOrder={41} frustumCulled={false} />
      <instancedMesh key={`ring-${room}`} ref={ring} args={[HANDLE_RING, HANDLE_LINE, room]} renderOrder={42} frustumCulled={false} />
    </group>
  );
}
