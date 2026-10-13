import * as THREE from "three";
import PageHtml from "./PageHtml";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import {
  fontStack,
  labelBox,
  labelSetOf,
  type Atom as LAtom,
  type LabelBox,
} from "../../../../lib/chem/layout2d";
import {
  MARK_MIN_PX,
  MARK_SCALE,
  stereoPlaces,
  stereoTextEms,
  valenceMessage,
  type ChemMarks,
} from "../chem/marks";
import { useEditor } from "../store";
import type { Model } from "../store/types";
import { useDrawnLayout, useDrawnZoom } from "./drawnLayoutContext";
import { usePresence } from "../../../theme/presence";
import StereoText from "./StereoText";
import { MarkHold } from "./MarkHold2D";
import { usePageHtmlLayer } from "./coverLayer";
import { TIP_GAP_PX, tipPlace, tipUnder, type ScreenBox } from "./markTip";

/** Nothing worked out, for a drawing with nothing to mark. */
const NO_ATOMS = new Map<number, LAtom>();
const NO_MODEL: Model = { atoms: [], bonds: [] };

/** Marks sit over the drawing, and under the canvas's buttons and cards. */
const Z_RANGE = [20, 10];

/** Half a capital letter's height, as a share of the labels' size: how far R or S stands off its atom where the style does not say. */
const HALF_CAPITAL = 0.35;

/** Half the height of a mark's letters, in ems of their size: a capital's, and a little round it. */
const MARK_HALF_HEIGHT = 0.42;

/** How far apart two of R, S, E and Z keep at the least, in ems of their size. */
const MARKS_APART = 0.6;

/**
 * The plugin's marks on the structure: a ring round each atom with more bonds
 * than it can have - saying what is wrong while the pointer is on it - and
 * R, S, E and Z beside stereocentres and double bonds, each placed clear of
 * the bonds and labels, and written as the drawing's labels are - in its
 * typeface and its colour, in italics, in parentheses if its style says
 * so. They are the editor's, laid over the drawing where it stands this
 * frame; they are not part of it, and no picture of it has them.
 */
export default function ChemMarks2D({
  marks,
  unsure,
  read,
}: {
  marks: ChemMarks | null;
  unsure?: { atoms: Set<number>; bonds: Set<number> };
  /** What Meno was unsure of as it read parts from a figure, still as read: each with what it says (utils/figures `readMarks`). */
  read?: { atoms: Map<number, string>; bonds: Map<number, string> };
}) {
  const { atoms, layout, opts } = useDrawnLayout();
  const model = useEditor((s) => s.model);
  const hoveredAtom = useEditor((s) => s.hovered.atomId);
  const hoveredBond = useEditor((s) => s.hovered.bondId);
  // (what can be seen of the canvas, the column over its right side left out: where what a mark says is kept - markTip)
  const gl = useThree((s) => s.gl);
  const layer = usePageHtmlLayer();
  const cover = useEditor((s) => s.cover);
  const room = useCallback((): ScreenBox => {
    const r = (layer?.current ?? gl.domElement).getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right - cover, bottom: r.bottom };
  }, [layer, gl, cover]);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [marks, invalidate]);

  // (nothing worked out over the drawing while there is nothing to mark -
  // every frame of a drag over a large drawing - and R, S, E and Z only
  // where there are any)
  const stereoWanted = !!marks && (marks.centres.size > 0 || marks.doubleBonds.size > 0);
  const wanted = stereoWanted || !!marks?.valence.size || !!unsure?.atoms.size || !!unsure?.bonds.size || !!read?.atoms.size || !!read?.bonds.size;
  // (the view's zoom, where there is anything to mark: with nothing, a zoom draws nothing here again)
  const zoom = useDrawnZoom((z) => (wanted ? z : 1));
  // each atom where it is drawn this frame: a dragged atom where it is
  const at = useMemo(() => (wanted ? new Map(atoms.map((a) => [a.id, a])) : NO_ATOMS), [wanted, atoms]);
  // the structure where it is drawn this frame
  const drawn: Model = useMemo(
    () =>
      stereoWanted
        ? {
            atoms: model.atoms.map((a) => {
              const d = at.get(a.id);
              return d ? { ...a, x: d.x, y: d.y } : a;
            }),
            bonds: model.bonds,
          }
        : NO_MODEL,
    [stereoWanted, at, model],
  );
  // (labels sized in the drawing's units are as big at any zoom: their boxes
  // are not worked out again as the view zooms)
  const labelZoom = opts.units === "px" ? zoom : null;
  const boxes = useMemo(() => {
    const set = labelSetOf(opts);
    const out = new Map<number, LabelBox>();
    if (!wanted) return out;
    for (const t of layout.texts) {
      const id = t.atom != null ? atoms[t.atom]?.id : undefined;
      if (id == null) continue;
      const size = labelZoom != null ? t.fontPx / Math.max(labelZoom, 1e-6) : t.fontPx;
      out.set(id, labelBox(t, size, set));
    }
    return out;
  }, [wanted, layout, atoms, opts, labelZoom]);

  const z = Math.max(zoom, 1e-6);
  const labelFont = opts.units === "px" ? opts.fontPx / z : opts.fontPx;
  const fontPx = Math.max(MARK_MIN_PX, labelFont * MARK_SCALE * z);
  // (R, S, E and Z as the drawing's style writes them)
  const parentheses = !!opts.stereoParentheses;
  const gap = opts.stereoGap ?? HALF_CAPITAL;
  const writing = { family: fontStack(labelSetOf(opts).fontFamily ?? "Arial"), color: opts.labelColor ?? "#000000" };

  // R, S, E and Z, each placed clear of the bonds, the labels and the
  // marks placed before it
  // (the marks as big on the page as before - the letters grown with the
  // view, as they are once past their least size - go where they went: a
  // zoom does not place them all again)
  const markSize = (fontPx / z).toPrecision(12);
  // what each of R, S, E and Z is measured from - its atom, its bond's
  // middle - and those put by hand, where they were put
  const from = useMemo(() => {
    const out = new Map<string, { x: number; y: number }>();
    if (!marks || !stereoWanted) return out;
    for (const id of marks.centres.keys()) {
      const a = at.get(id);
      if (a) out.set(`centre-${id}`, { x: a.x, y: a.y });
    }
    for (const b of model.bonds) {
      if (!marks.doubleBonds.has(b.id)) continue;
      const p = at.get(b.a);
      const q = at.get(b.b);
      if (p && q) out.set(`bond-${b.id}`, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    }
    return out;
  }, [marks, stereoWanted, at, model.bonds]);
  const fixed = useMemo(() => {
    const out = new Map<string, { x: number; y: number }>();
    if (!marks || !stereoWanted) return out;
    const put = (key: string, by?: { x: number; y: number }) => {
      const f = from.get(key);
      if (f && by) out.set(key, { x: f.x + by.x * labelFont, y: f.y + by.y * labelFont });
    };
    for (const a of model.atoms) if (a.stereoAt && marks.centres.has(a.id)) put(`centre-${a.id}`, a.stereoAt);
    for (const b of model.bonds) if (b.stereoAt && marks.doubleBonds.has(b.id)) put(`bond-${b.id}`, b.stereoAt);
    return out;
  }, [marks, stereoWanted, model, from, labelFont]);
  const stereo = useMemo(() => {
    // (none to place: nothing to keep them off)
    if (!marks || (!marks.centres.size && !marks.doubleBonds.size)) return [];
    return stereoPlaces({
      model: drawn,
      centres: marks.centres,
      doubleBonds: marks.doubleBonds,
      boxes,
      half: (cip) => ({
        x: (fontPx * stereoTextEms(cip, parentheses)) / 2 / z,
        y: (fontPx * MARK_HALF_HEIGHT) / z,
      }),
      // (a mark placed keeps the next a little way off, not just clear of
      // it: two side by side read as one, and as either atom's)
      apart: (MARKS_APART * fontPx) / z,
      off: gap * labelFont,
      bond: NOMINAL_BOND_LENGTH,
      fixed,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fontPx, z: as far as they make markSize
  }, [marks, drawn, boxes, markSize, parentheses, labelFont, gap, fixed]);

  // Each mark where it goes: a valence problem's box round its atom's label
  // (or a ring round its atom), and the stereodescriptors.
  const boxesOf: { key: string; id: number; x: number; y: number; w: number; h: number; round: boolean; message: string; bond?: boolean; dashed?: boolean }[] = [];
  for (const [id, problem] of marks ? [...marks.valence] : []) {
    const a = at.get(id);
    if (!a) continue;
    const box = boxes.get(id);
    const pad = 0.12 * labelFont;
    const r = box
      ? { left: box.left + pad, right: box.right + pad, top: box.top + pad, bottom: box.bottom + pad }
      : { left: 0.3 * labelFont, right: 0.3 * labelFont, top: 0.3 * labelFont, bottom: 0.3 * labelFont };
    boxesOf.push({
      key: `valence-${id}`,
      id,
      x: a.x + (r.right - r.left) / 2,
      y: a.y + (r.top - r.bottom) / 2,
      w: (r.left + r.right) * z,
      h: (r.top + r.bottom) * z,
      round: !box,
      // (read from a figure and unsure there too: said after - the one mark says both)
      message: [valenceMessage(a.el, problem), read?.atoms.get(id)].filter(Boolean).join(" "),
    });
  }
  // and, dashed, what the drawing says of its stereochemistry only by luck:
  // a centre - its box as a valence problem's - or a double bond, a ring
  // at its middle (the maintainer, 2026-10-11: never shown as if certain)
  // (an atom read from a figure says what was unsure of it; a stereocentre otherwise)
  const atomsSaid = new Map<number, string>([...(unsure?.atoms ?? [])].map((id) => [id, "This stereocentre can be read either way as drawn."]));
  for (const [id, said] of read?.atoms ?? []) atomsSaid.set(id, said);
  const bondsSaid = new Map<number, string>([...(unsure?.bonds ?? [])].map((id) => [id, "This double bond can be read as cis or trans as drawn."]));
  for (const [id, said] of read?.bonds ?? []) bondsSaid.set(id, said);
  for (const [id, said] of atomsSaid) {
    const a = at.get(id);
    if (!a || marks?.valence.has(id)) continue;
    const box = boxes.get(id);
    const pad = 0.12 * labelFont;
    const r = box
      ? { left: box.left + pad, right: box.right + pad, top: box.top + pad, bottom: box.bottom + pad }
      : { left: 0.3 * labelFont, right: 0.3 * labelFont, top: 0.3 * labelFont, bottom: 0.3 * labelFont };
    boxesOf.push({
      key: `unsure-${id}`,
      id,
      x: a.x + (r.right - r.left) / 2,
      y: a.y + (r.top - r.bottom) / 2,
      w: (r.left + r.right) * z,
      h: (r.top + r.bottom) * z,
      round: !box,
      message: said,
      dashed: true,
    });
  }
  const bondsHere = bondsSaid.size ? new Map(model.bonds.filter((b) => bondsSaid.has(b.id)).map((b) => [b.id, b])) : null;
  for (const [id, said] of bondsSaid) {
    const b = bondsHere?.get(id);
    const p = b && at.get(b.a);
    const q = b && at.get(b.b);
    if (!p || !q) continue;
    const d = 0.6 * labelFont * z;
    boxesOf.push({
      key: `unsure-bond-${id}`,
      id,
      x: (p.x + q.x) / 2,
      y: (p.y + q.y) / 2,
      w: d,
      h: d,
      round: true,
      message: said,
      bond: true,
      dashed: true,
    });
  }
  // (each comes into view and goes out of it, rather than appearing and
  // vanishing as the marks are worked out again after an edit)
  const valenceShown = usePresence(boxesOf, (m) => m.key);
  const stereoShown = usePresence(marks ? stereo : [], (m) => m.key);

  // R, S, E and Z, all in one layer over the canvas, each moved to where its
  // point is seen as the view moves: a layer of its own for each - its own
  // root, moved by its own frame callback - made a structure of thousands
  // of stereocentres take seconds to show them. Each sits where a layer of
  // its own put it: its middle on its point (as Html's `center` does).
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const markEls = useRef(new Map<string, HTMLDivElement>());
  const shownNow = useRef(stereoShown);
  shownNow.current = stereoShown;
  const seenFrom = useRef("");
  const seen = (x: number, y: number) => {
    const v = new THREE.Vector3(x, y, 0).project(camera);
    return [v.x * (size.width / 2) + size.width / 2, -(v.y * (size.height / 2)) + size.height / 2];
  };
  const placeOne = (el: HTMLDivElement, m: { x: number; y: number }, [ox, oy] = seen(0, 0)) => {
    const [x, y] = seen(m.x, m.y);
    el.style.transform = `translate3d(${x - ox}px,${y - oy}px,0) translate3d(-50%,-50%,0)`;
  };
  const placeAll = () => {
    camera.updateMatrixWorld();
    const origin = seen(0, 0);
    for (const { key, item: m } of shownNow.current) {
      const el = markEls.current.get(key);
      if (el) placeOne(el, m, origin);
    }
  };
  useFrame(() => {
    // (only when the view has moved; what is shown changing is seen to below)
    const view = `${camera.projectionMatrix.elements.join()},${camera.matrixWorld.elements.join()},${size.width},${size.height}`;
    if (view === seenFrom.current) return;
    seenFrom.current = view;
    placeAll();
  });
  useEffect(() => {
    placeAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- placeAll: the view as it is now
  }, [stereoShown]);
  if (!valenceShown.length && !stereoShown.length) return null;

  return (
    <group>
      {/* each R, S, E and Z taken hold of on its letters, and moved by hand */}
      {stereoShown.map(({ key, item: m, leaving }) => {
        const base = from.get(key);
        if (leaving || !base) return null;
        const id = Number(key.slice(key.indexOf("-") + 1));
        return (
          <MarkHold
            key={`hold-${key}`}
            of={key.startsWith("bond-") ? { bond: id } : { atom: id, kind: "stereo" }}
            at={m}
            halfW={(fontPx * stereoTextEms(m.text, parentheses)) / 2 / z}
            halfH={(fontPx * MARK_HALF_HEIGHT) / z}
            from={base}
            em={labelFont}
          />
        );
      })}
      {valenceShown.map(({ key, item: m, leaving }) => (
        <PageHtml key={key} position={[m.x, m.y, 0]} center zIndexRange={Z_RANGE} style={{ pointerEvents: "none" }}>
          <div
            role="img"
            aria-label={m.message}
            className={"relative border-[1.5px] border-accel-accent " + (m.dashed ? "border-dashed " : "bg-accel-accent/10 ") + (leaving ? "meno-fade-out" : "meno-fade-in")}
            style={{ width: m.w, height: m.h, borderRadius: m.round ? "50%" : 3 }}
          >
            {(m.bond ? hoveredBond === m.id : hoveredAtom === m.id) && !leaving && (
              <MarkTip text={m.message} room={room} />
            )}
          </div>
        </PageHtml>
      ))}
      {stereoShown.length > 0 && (
        <PageHtml position={[0, 0, 0]} zIndexRange={Z_RANGE} style={{ pointerEvents: "none" }}>
          {stereoShown.map(({ key, item: m, leaving }) => (
            <div
              key={key}
              ref={(el) => {
                if (!el) {
                  markEls.current.delete(key);
                  return;
                }
                markEls.current.set(key, el);
                // (put where it goes as it comes: this layer is drawn by
                // a root of its own, after this one's effects have run)
                placeOne(el, m);
              }}
              style={{ position: "absolute", top: 0, left: 0, transform: "translate3d(-50%,-50%,0)" }}
            >
              <div className={leaving ? "meno-fade-out" : "meno-fade-in"}>
                <StereoMark text={m.text} fontPx={fontPx} parentheses={parentheses} {...writing} />
              </div>
            </div>
          ))}
        </PageHtml>
      )}
    </group>
  );
}

/** What a mark says, under it - moved along, or put over it, to lie where it can be seen (markTip). */
function MarkTip({ text, room }: { text: string; room: () => ScreenBox }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ dx: number; above: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const mark = el?.parentElement?.getBoundingClientRect();
    if (!el || !mark) return;
    setPlace(tipPlace(tipUnder(mark, el.offsetWidth, el.offsetHeight), mark, room()));
  }, [text, room]);
  return (
    <div
      ref={ref}
      className={"meno-fade-in absolute left-1/2 w-max max-w-[22rem] rounded-md border border-gh-line bg-white px-2 py-1 text-[11px] text-gh-black shadow-sm " + (place?.above ? "bottom-full" : "top-full")}
      style={{
        [place?.above ? "marginBottom" : "marginTop"]: TIP_GAP_PX,
        transform: `translateX(calc(-50% + ${place?.dx ?? 0}px))`,
        visibility: place ? undefined : "hidden",
      }}
    >
      {text}
    </div>
  );
}

/** A stereodescriptor as the drawing writes it (StereoText), in its typeface and colour. */
function StereoMark({ text, fontPx, parentheses, family, color }: { text: string; fontPx: number; parentheses: boolean; family: string; color: string }) {
  return (
    <span className="whitespace-nowrap select-none" style={{ fontSize: fontPx, lineHeight: 1, fontFamily: family, color }}>
      <StereoText cip={text} parentheses={parentheses} />
    </span>
  );
}
