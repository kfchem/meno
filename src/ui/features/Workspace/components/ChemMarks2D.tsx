import PageHtml from "./PageHtml";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import {
  labelBox,
  labelSetOf,
  type Atom as LAtom,
  type LabelBox,
} from "../../../../lib/chem/layout2d";
import {
  MARK_HALF_HEIGHT,
  MARK_MIN_PX,
  MARK_SCALE,
  MARKS_APART,
  STEREO_GAP,
  marksReadAt,
  stereoPlaces,
  stereoTextEms,
  stereoTextItem,
  valenceMessage,
  type ChemMarks,
} from "../chem/marks";
import { useEditor } from "../store";
import { switchFade, switchStep, type SwitchFade } from "../utils/zoomSwitch";
import type { Model } from "../store/types";
import { useDrawnLayout, useDrawnZoom } from "./drawnLayoutContext";
import { usePresence } from "../../../theme/presence";
import { MarkHold } from "./MarkHold2D";
import MarkBoxes2D from "./MarkBoxes2D";
import { Texts2D } from "./Labels2D";
import { usePageHtmlLayer } from "./coverLayer";
import { TIP_GAP_PX, tipPlace, tipUnder, type ScreenBox } from "./markTip";

/** Nothing worked out, for a drawing with nothing to mark. */
const NO_ATOMS = new Map<number, LAtom>();
const NO_MODEL: Model = { atoms: [], bonds: [] };

/** A mark's words sit over the drawing, and under the canvas's buttons and cards. */
const Z_RANGE = [20, 10];
/** R, S, E and Z over the drawing's bonds and labels, under the marks' boxes. */
const STEREO_ORDER = 35;




/**
 * The plugin's marks on the structure: a ring round each atom with more bonds
 * than it can have - saying what is wrong while the pointer is on it - and
 * R, S, E and Z beside stereocentres and double bonds, each placed clear of
 * the bonds and labels, and written as the drawing's labels are - in its
 * typeface and its colour, in italics, in parentheses if its style says
 * so. They are the editor's, drawn by WebGL with the page - never lagging
 * a pan or a zoom (the maintainer, 2026-10-27; docs/LOOK.md) - over the
 * drawing where it stands this frame; only what a box says, while it is
 * pointed at, is HTML. A picture of the drawing has R, S, E and Z placed
 * and written as here (chem/marks `stereoPictureItems`, `stereoTextItem`,
 * 2026-10-21), never the rings.
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
  // (the view's zoom, where there is anything to mark: with nothing, a zoom
  // draws nothing here again - and marks fading out keep the size they had)
  const zoomWanted = useRef(1);
  const zoom = useDrawnZoom((z) => (wanted ? (zoomWanted.current = z) : zoomWanted.current));
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
  // (and, the view far out, whether they are still seen: switched past their least size, not faded with the zoom - marksReadAt)
  const marksRead = useRef(true);
  marksRead.current = marksReadAt(marksRead.current, labelFont * MARK_SCALE * z);
  // (R, S, E and Z as the drawing's style writes them)
  const parentheses = !!opts.stereoParentheses;
  const gap = opts.stereoGap ?? STEREO_GAP;

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

  // Each mark where it goes, in the page's units: a valence problem's box
  // round its atom's label (or a ring round its atom), and the
  // stereodescriptors.
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
      w: r.left + r.right,
      h: r.top + r.bottom,
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
      w: r.left + r.right,
      h: r.top + r.bottom,
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
    const d = 0.6 * labelFont;
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

  // R, S, E and Z as texts on the page, each its middle where it is placed,
  // as large as the drawing's labels times MARK_SCALE (or MARK_MIN_PX on the
  // screen): set as a label is, in the units the labels are set in
  const stereoKeys = stereoShown.map((s) => s.key);
  const stereoTexts = useMemo(
    () => stereoShown.map(({ item: m }) => stereoTextItem(m, fontPx / z, opts, opts.units === "px" ? fontPx : fontPx / z)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fontPx, z: as far as they make markSize
    [stereoShown, markSize, opts],
  );
  const stereoLeaving = useMemo(() => new Set(stereoShown.filter((s) => s.leaving).map((s) => s.key)), [stereoShown]);
  // (one new since the last set fades in; the rest are set again as they are, at once)
  const stereoWere = useRef(new Set<string>());
  const stereoArriving = useMemo(() => {
    const now = new Set(stereoKeys.filter((k) => !stereoWere.current.has(k) && !stereoLeaving.has(k)));
    stereoWere.current = new Set(stereoKeys);
    return now;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stereoKeys: as stereoShown
  }, [stereoShown, stereoLeaving]);
  // (and, switched there, faded in or out over a short time: utils/zoomSwitch)
  const seen = useRef<SwitchFade>(switchFade(marksRead.current));
  const stereoSeen = useRef(seen.current.v);
  useFrame((_, dt) => {
    if (switchStep(seen.current, marksRead.current, Math.min(dt, 1 / 20))) invalidate();
    stereoSeen.current = seen.current.v;
  });
  const boxesLeaving = useMemo(() => new Set(valenceShown.filter((s) => s.leaving).map((s) => s.key)), [valenceShown]);
  const boxesNow = useMemo(() => valenceShown.map(({ item }) => item), [valenceShown]);
  const pointed = valenceShown.find(({ item: m, leaving }) => !leaving && (m.bond ? hoveredBond === m.id : hoveredAtom === m.id))?.item;
  if (!valenceShown.length && !stereoShown.length) return null;

  return (
    <group>
      {/* each R, S, E and Z taken hold of on its letters, and moved by hand */}
      {stereoShown.map(({ key, item: m, leaving }) => {
        const base = from.get(key);
        // (none to take hold of where they are switched off with the zoom)
        if (leaving || !base || !marksRead.current) return null;
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
      {boxesNow.length > 0 && <MarkBoxes2D boxes={boxesNow} leaving={boxesLeaving} zoom={z} />}
      {/* what the box pointed at says, under it: words over the page, while it is pointed at */}
      {pointed && (
        <PageHtml key={`tip-${pointed.key}`} position={[pointed.x, pointed.y, 0]} center zIndexRange={Z_RANGE} style={{ pointerEvents: "none" }}>
          <div role="img" aria-label={pointed.message} className="relative" style={{ width: pointed.w * z, height: pointed.h * z }}>
            <MarkTip text={pointed.message} room={room} />
          </div>
        </PageHtml>
      )}
      {stereoTexts.length > 0 && (
        <Texts2D
          texts={stereoTexts}
          renderOrder={STEREO_ORDER}
          fade={false}
          keyOf={(_, i) => stereoKeys[i]}
          leaving={stereoLeaving}
          arriving={stereoArriving}
          opacity={stereoSeen}
        />
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
