import { Text } from "@react-three/drei";
import * as THREE from "three";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { DURATION, EASE, TAU, eased, follow } from "../../../theme/motion";
import { usePresence } from "../../../theme/presence";
import { labelSetOf, placeLabel, sameTexts, type TextItem } from "../../../../lib/chem/layout2d";
import { needsFallback, useLabelFontUrl } from "../../../fonts/typefaces";
import { labelFont } from "../../../../lib/chem/labelFonts";
import { useDrawnLayout, useDrawnZoom } from "./drawnLayoutContext";
import { useEditor, useEditorStore } from "../store";
import { fadeLetters, fadedOpacity, fadingOut } from "./labelFade";
import { BOLD, ITALIC_SLANT, TextBatch, type BatchRun } from "./textBatch";
import { noTextSets, setDrawn, textsGiven } from "./textSets";

// (how far an italic run leans - about a sans-serif italic's slant: the canvas leans the label's own
// letters, a picture asks for the typeface's italic - and how much a bold run's letters are thickened, as
// Markdown's strong words are, components/MarkdownRows: ./textBatch)

/** A run at (x, y), its baseline, leaning to the right above it. */
function slanted(x: number, y: number): THREE.Matrix4 {
  return new THREE.Matrix4().set(1, ITALIC_SLANT, 0, x, 0, 1, 0, y, 0, 0, 1, 0, 0, 0, 0, 1);
}

/**
 * The drawing's atom labels, from the shared layout - which puts an atom
 * being dragged where it is being dragged to, so its label goes with it.
 * Each is drawn by what its atom is: a label added or taken away sets no
 * other label's letters again. A label just written is told when it is
 * drawn (LabelTyping2D), drawn over until then by what was written.
 */
export default function Labels2D() {
  const { layout, atoms } = useDrawnLayout();
  const store = useEditorStore();
  const waited = useEditor((s) => s.labelLeft != null);
  // (a label written over and let go - or kept as it was - comes back as the writing goes: faded in, not there at once)
  const ended = useEditor((s) => s.labelEnd);
  // (a selection let go after a turn or a drag: each label carried with it is set again, and one set otherwise - OH
  // become HO - goes over as one fading out and the other in together, by a key of its own for the one set now)
  const held = useEditor((s) => s.panHold.active);
  const generation = useRef(new Map<string, number>());
  const ghosts = useRef(new Map<string, { item: TextItem; atom: number; dx: number; dy: number }>());
  const settled = useRef<{ held: boolean; texts: readonly TextItem[]; atoms: readonly { id: number; x: number; y: number }[] }>({ held, texts: layout.texts, atoms });
  const baseOf = (t: TextItem, i: number, on: readonly { id: number }[]) => {
    const index = t.beside ? t.markOf : t.atom;
    const id = index != null ? on[index]?.id : undefined;
    return id != null ? `${t.beside ? "mark" : "atom"}-${id}` : `txt-${i}`;
  };
  const resetNow = useMemo(() => {
    const was = settled.current;
    settled.current = { held, texts: layout.texts, atoms };
    if (!was.held || held) return [];
    // (each label's letters and where they stand from its atom, then and now)
    const placed = (t: TextItem, on: readonly { x: number; y: number }[]) => {
      const a = on[(t.beside ? t.markOf : t.atom) ?? -1];
      const { x, y, ...rest } = t;
      return a ? JSON.stringify(rest) + `@${Math.round((x - a.x) * 1e4)},${Math.round((y - a.y) * 1e4)}` : null;
    };
    const before = new Map(was.texts.map((t, i) => [baseOf(t, i, was.atoms), placed(t, was.atoms)]));
    const changed = layout.texts.flatMap((t, i) => {
      const key = baseOf(t, i, atoms);
      return before.has(key) && before.get(key) !== placed(t, atoms) ? [key] : [];
    });
    // (the one going stays by its atom as it fades, wherever its atom is drawn - still gliding to where the turn left it)
    const thenAt = new Map(was.texts.map((t, i) => [baseOf(t, i, was.atoms), t]));
    for (const key of changed) {
      const n = generation.current.get(key) ?? 0;
      const t = thenAt.get(key)!;
      const a = was.atoms[(t.beside ? t.markOf : t.atom) ?? -1];
      if (a) ghosts.current.set(n ? `${key}~${n}` : key, { item: t, atom: a.id, dx: t.x - a.x, dy: t.y - a.y });
      generation.current.set(key, n + 1);
    }
    return changed;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as the texts are, and the press
  }, [layout.texts, held]);
  const keyOf = (t: TextItem, i: number) => {
    const base = baseOf(t, i, atoms);
    const n = generation.current.get(base);
    return n ? `${base}~${n}` : base;
  };
  const arriving = useMemo(() => {
    const typed = ended && ended.how !== "kept" ? [`atom-${ended.atomId}`, `mark-${ended.atomId}`] : [];
    const reset = resetNow.map((k) => `${k}~${generation.current.get(k)}`);
    return typed.length || reset.length ? new Set([...typed, ...reset]) : undefined;
  }, [ended, resetNow]);
  // (a label gone - its atom undone or deleted, its label taken back - kept a moment, by what it was drawn by, as it fades out)
  const at = new Map(layout.texts.map((t, i) => [t, i]));
  // (kept a little past the fade, so that it ends at naught, not cut short by a slow frame)
  const shown = usePresence(layout.texts, (t) => keyOf(t, at.get(t) ?? -1), DURATION.quick * 1000 + 50);
  const leavingKeys = shown.filter((e) => e.leaving).map((e) => e.key);
  const signature = leavingKeys.join("\u0000");
  // (a label set otherwise on letting go, fading out by its atom: where its atom is drawn now, as it stood from it)
  for (const k of [...ghosts.current.keys()]) if (!leavingKeys.includes(k)) ghosts.current.delete(k);
  const following = ghosts.current.size > 0;
  const texts = useMemo(() => {
    if (!following) return shown.map((e) => e.item);
    const index = new Map(atoms.map((a, i) => [a.id, i]));
    return shown.map((e) => {
      const g = e.leaving ? ghosts.current.get(e.key) : undefined;
      const i = g ? index.get(g.atom) : undefined;
      if (!g || i == null) return e.item;
      return { ...g.item, x: atoms[i].x + g.dx, y: atoms[i].y + g.dy, ...(g.item.beside ? { markOf: i } : { atom: i }) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as the texts are, which are going, and - while one goes by its atom - where the atoms are
  }, [layout.texts, signature, following ? atoms : null]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the same
  const keys = useMemo(() => shown.map((e) => e.key), [layout.texts, signature]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the same
  const leaving = useMemo(() => new Set(leavingKeys), [signature]);
  return <Texts2D texts={texts} keyOf={(_, i) => keys[i]} leaving={leaving} arriving={arriving} onDrawn={waited ? () => store.getState().labelShown() : undefined} />;
}

/** troika's text, as far as Meno looks into it: whether its letters are still to be set, or being set. */
type Setting = THREE.Object3D & { sync?: unknown; _needsSync?: boolean; _isSyncing?: boolean };
const isText = (o: THREE.Object3D): o is Setting => typeof (o as Setting).sync === "function" && "text" in o;
const setting = (o: Setting) => !!(o._needsSync || o._isSyncing);


/**
 * Texts set as the drawing sets its labels (lib/chem/layout2d `placeLabel`):
 * the labels, and the words on the page (Captions2D) - and words carried
 * out of a PDF (WordsFlight), `moved`: each text's group placed, and its
 * letters seen, by what draws them, frame by frame; given `shadow` (how far
 * it is blurred), as their shadow alone. Not `fade`d in: seen at once, as
 * soon as they are drawn. `onDrawn` is told the texts once every letter of
 * them is set (troika sets them a frame or two after it is given them).
 */
type TextsProps = {
  texts: readonly TextItem[];
  moved?: boolean;
  shadow?: string;
  renderOrder?: number;
  fade?: boolean;
  onDrawn?: (texts: readonly TextItem[]) => void;
  /** What each text is drawn by, from one set to the next: by default its place in the set. */
  keyOf?: (t: TextItem, i: number) => string;
  /** The texts, by `keyOf`, gone from the drawing and fading out (Labels2D). */
  leaving?: ReadonlySet<string>;
  /** The texts, by `keyOf`, faded in as they are drawn rather than seen at once: a label back as what was written over it goes (Labels2D). */
  arriving?: ReadonlySet<string>;
  /** How opaque all of them are, read at each frame: a label being written as it comes and goes (LabelTyping2D). */
  opacity?: { readonly current: number };
  /** The typeface they are set in, where it is not the labels': words on the page given one of their own (Captions2D). */
  family?: string;
};

/** How texts given `family` are set: as the labels are, in it. */
const setIn = (opts: Parameters<typeof labelSetOf>[0], family: string | undefined) => {
  const set = labelSetOf(opts);
  return family ? { ...set, fontFamily: family } : set;
};

export function Texts2D(props: TextsProps) {
  // (drawn a few draw calls in all where they stand still and the renderer
  // takes float textures, troika's batch needs them - not one each: a page
  // at its whole had tens of thousands; carried or shadowed - a few words -
  // one by one, as ever)
  const batchable = useThree((st) => st.gl.capabilities.isWebGL2);
  return !props.shadow && !props.moved && batchable ? <BatchedTexts2D {...props} /> : <EachText2D {...props} />;
}

function EachText2D({
  texts: items,
  moved,
  shadow,
  renderOrder = 30,
  fade = true,
  onDrawn,
  keyOf,
  leaving,
  family: own,
}: TextsProps) {
  const { opts } = useDrawnLayout();

  // Set in the style's typeface, where the layout has placed each run: the
  // font the layout measures in is the one drawn with, so nothing needs
  // measuring here. Until the font is known nothing is drawn, rather than a
  // label in some other font that then jumps.
  const family = own ?? opts.fontFamily ?? "Arial";
  // (a letter no typeface of Meno's has drawn as a white square - as the layout measured it: lib/chem/labelFonts `STAND_IN`)
  const fallback = useMemo(() => needsFallback(items.map((t) => t.text)), [items]);
  const font = useLabelFontUrl(family, fallback);
  // Once the font is in, the labels fade in (TAU.quick) rather than appear:
  // each label's own opacity brought up a frame at a time, not the labels
  // drawn again - a drawing can have thousands.
  const seen = useRef<{ font: string | null; level: number }>({ font: null, level: 0 });
  if (seen.current.font !== font) seen.current = { font, level: fade ? 0 : 1 };
  const group = useRef<THREE.Group>(null);
  // (each time they are drawn anew: told once every letter is set - after the
  // texts' own effects, which give troika their letters)
  useLayoutEffect(() => {
    const g = group.current;
    if (!onDrawn || !g) return;
    const texts: Setting[] = [];
    g.traverse((o) => {
      if (isText(o)) texts.push(o);
    });
    let told = false;
    const check = () => {
      if (told || texts.some(setting)) return;
      told = true;
      onDrawn(items);
    };
    for (const t of texts) t.addEventListener("synccomplete" as never, check);
    check();
    return () => {
      told = true;
      for (const t of texts) t.removeEventListener("synccomplete" as never, check);
    };
  });
  const invalidate = useThree((st) => st.invalidate);
  useFrame((_, dt) => {
    const s = seen.current;
    if (s.font === null || s.level === 1) return;
    const n = follow(s.level, 1, Math.min(dt, 1 / 20), TAU.quick);
    s.level = n > 0.99 ? 1 : n;
    if (moved) return;
    group.current?.traverse((o) => fadeLetters(o, s.level));
    invalidate();
  });
  // the texts gone, faded out - each to naught in DURATION.quick, then let go
  // by what holds them; one back before then (a redo) seen whole again
  const out = useRef(new Map<string, number>());
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    let going = false;
    for (const child of g.children) {
      const k = child.name;
      if (leaving?.has(k)) {
        const level = fadingOut(out.current.get(k) ?? 1, Math.min(dt, 1 / 20), DURATION.quick);
        out.current.set(k, level);
        child.traverse((o) => fadeLetters(o, Math.min(seen.current.level, fadedOpacity(level))));
        if (level > 0) going = true;
      } else if (out.current.has(k)) {
        out.current.delete(k);
        child.traverse((o) => fadeLetters(o, seen.current.level));
      }
    }
    if (going) invalidate();
  });
  // (labels sized in the drawing's own units are the same at any zoom: the
  // view zooming leaves them as they are, and draws none of them again)
  const labelZoom = useDrawnZoom((z) => (opts.units === "px" ? z : null));
  const labelColor = opts.labelColor ?? "black";
  // (each text drawn as it was while it is the same object, drawn the same
  // way: a structure the layout did not lay out again keeps its labels, and
  // React passes them by - not a thousand labels drawn again at every frame
  // of a drag)
  const made = useRef<{ under: unknown[]; texts: WeakMap<TextItem, { key: string; label: ReactElement }> }>({ under: [], texts: new WeakMap() });
  const labels = useMemo(() => {
    if (font === null) return null;
    const set = setIn(opts, own);
    const glyphs = labelFont(set.fontFamily);
    const fill = shadow || moved ? 0 : seen.current.level;
    const under = [opts, labelZoom, labelColor, font, moved, shadow, renderOrder, fill];
    if (under.some((v, k) => v !== made.current.under[k])) made.current = { under, texts: new WeakMap() };
    const kept = made.current.texts;
    return items.map((t, i) => {
      const key = keyOf ? keyOf(t, i) : `txt-${i}`;
      const was = kept.get(t);
      if (was && was.key === key) return was.label;
      const fontWorld = labelZoom != null ? t.fontPx / Math.max(labelZoom, 1e-6) : t.fontPx;
      const label = (
        <group key={key} name={key}>
          {/* (a mark - a charge's circle, a radical's dot - is drawn with the lines) */}
          {placeLabel(t, fontWorld, set).map((run, k) => run.mark ? null : (
            // (an italic run - the t of t-Bu - slanted about its baseline)
            <group key={`run-${k}`} position={[run.x, run.y, 0]} matrixAutoUpdate={!run.italic} matrix={run.italic ? slanted(run.x, run.y) : undefined}>
              <Text
                font={font}
                fontSize={run.size}
                color={run.color ?? t.color ?? labelColor}
                fillOpacity={fill}
                anchorX="left"
                anchorY="top-baseline"
                renderOrder={renderOrder}
                {...(shadow
                  ? { outlineBlur: shadow, outlineColor: "black", outlineOpacity: 0 }
                  : run.bold
                    ? // (bold: the letters thickened by an outline of their own colour, as Markdown's are - one face of each)
                      { outlineWidth: BOLD, outlineColor: run.color ?? t.color ?? labelColor, outlineOpacity: fill }
                    : {})}
              >
                {glyphs.shown(run.text)}
                {/* (its own material, not `material-*` props: an outlined text's material is two - its outline's
                    and its letters' - and those props went to neither, so a bold run was drawn tone mapped, darker) */}
                <meshBasicMaterial side={THREE.DoubleSide} transparent toneMapped={false} depthTest={false} depthWrite={false} />
              </Text>
            </group>
          ))}
        </group>
      );
      kept.set(t, { key, label });
      return label;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyOf: what each is drawn by, as the texts are
  }, [items, opts, own, labelZoom, labelColor, font, moved, shadow, renderOrder]);
  if (font === null) return null;
  return <group ref={group}>{labels}</group>;
}

/**
 * The texts of `Texts2D` that stand still, drawn by a batch (./textBatch):
 * no element for each run, and a few draw calls in all. Each label kept
 * while it is the same item, faded in as the font comes, told when drawn -
 * as `EachText2D` draws them one by one.
 */
function BatchedTexts2D({ texts: items, renderOrder = 30, fade = true, onDrawn, keyOf, leaving, arriving, opacity, family: own }: TextsProps) {
  const { opts } = useDrawnLayout();
  const family = own ?? opts.fontFamily ?? "Arial";
  const fallback = useMemo(() => needsFallback(items.map((t) => t.text)), [items]);
  const font = useLabelFontUrl(family, fallback);
  const seen = useRef<{ font: string | null; level: number }>({ font: null, level: 0 });
  if (seen.current.font !== font) seen.current = { font, level: fade ? 0 : 1 };
  // (one batch for a typeface and the order it is drawn in; made again as either changes)
  const invalidate = useThree((st) => st.invalidate);
  const batch = useMemo(() => (font === null ? null : new TextBatch(font, renderOrder, () => invalidate())), [font, renderOrder, invalidate]);
  useEffect(() => () => batch?.dispose(), [batch]);
  // (as `EachText2D`: labels in the drawing's own units are not set again as the view zooms)
  const labelZoom = useDrawnZoom((z) => (opts.units === "px" ? z : null));
  const labelColor = opts.labelColor ?? "black";
  const under = useRef<unknown[]>([]);
  // (how far each label going, or coming back, has come: 1 whole, 0 gone)
  const out = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const b = batch;
    if (!b) return;
    const set = setIn(opts, own);
    const glyphs = labelFont(set.fontFamily);
    // (what every label is drawn by: all of them set again where it changes)
    const now = [opts, labelZoom, labelColor, b];
    if (now.some((v, k) => v !== under.current[k])) {
      under.current = now;
      b.keepOnly(new Set());
    }
    const keep = new Set<string>();
    items.forEach((t, i) => {
      const key = keyOf ? keyOf(t, i) : `txt-${i}`;
      keep.add(key);
      if (b.has(key, t)) return;
      // (one coming back: from naught, or from as far as it had faded)
      if (arriving?.has(key) && !b.holds(key) && !out.current.has(key)) out.current.set(key, 0);
      const fading = out.current.get(key);
      const fontWorld = labelZoom != null ? t.fontPx / Math.max(labelZoom, 1e-6) : t.fontPx;
      const runs: BatchRun[] = placeLabel(t, fontWorld, set)
        .filter((run) => !run.mark)
        .map((run) => ({ text: glyphs.shown(run.text), x: run.x, y: run.y, size: run.size, color: run.color ?? t.color ?? labelColor, italic: !!run.italic, bold: !!run.bold }));
      const level = Math.min(seen.current.level, opacity?.current ?? 1);
      b.set(key, t, runs, fading != null ? Math.min(level, fadedOpacity(fading)) : level);
    });
    b.keepOnly(keep);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyOf: what each is drawn by, as the texts are
  }, [items, opts, own, labelZoom, labelColor, batch, invalidate]);
  // (told once every letter is set - after the batch has set them)
  useLayoutEffect(() => {
    const b = batch;
    if (!onDrawn || !b) return;
    let told = false;
    const check = () => {
      if (told || b.setting()) return;
      told = true;
      onDrawn(items);
    };
    const stop = b.onSynced(check);
    check();
    return () => {
      told = true;
      stop();
    };
  });
  useFrame((_, dt) => {
    const s = seen.current;
    const b = batch;
    if (s.font === null || s.level === 1 || !b) return;
    const n = follow(s.level, 1, Math.min(dt, 1 / 20), TAU.quick);
    s.level = n > 0.99 ? 1 : n;
    for (const t of b.members()) fadeLetters(t, s.level);
    invalidate();
  });
  // (as opaque as they are told, frame by frame: a batch's members are not in the scene's tree, for a traverse to reach)
  const told = useRef(1);
  useFrame(() => {
    const b = batch;
    if (!b || !opacity) return;
    const l = Math.min(seen.current.level, opacity.current);
    if (l === told.current) return;
    told.current = l;
    for (const t of b.members()) fadeLetters(t, l);
    invalidate();
  });
  // the labels gone, faded out - each to naught in DURATION.quick, then let go by what holds them; one back
  // before then (a redo), or `arriving`, faded in again in as long: its members' opacity, by key
  useFrame((_, dt) => {
    const b = batch;
    if (!b) return;
    const d = Math.min(dt, 1 / 20);
    let going = false;
    for (const k of leaving ?? []) {
      const level = fadingOut(out.current.get(k) ?? 1, d, DURATION.quick);
      out.current.set(k, level);
      b.fadeKey(k, Math.min(seen.current.level, fadedOpacity(level)));
      if (level > 0) going = true;
    }
    for (const [k, was] of [...out.current]) {
      if (leaving?.has(k)) continue;
      const level = Math.min(1, was + d / DURATION.quick);
      if (level >= 1) {
        out.current.delete(k);
        b.fadeKey(k, seen.current.level);
        continue;
      }
      out.current.set(k, level);
      // (coming in on Meno's curve, as an element's meno-fade-in does)
      b.fadeKey(k, Math.min(seen.current.level, eased(EASE, level)));
      going = true;
    }
    if (going) invalidate();
  });
  if (!batch) return null;
  return <primitive object={batch.root} />;
}

/**
 * Texts that change as they are typed - words on the page, a label - drawn
 * whole: each set shown only once every letter of it is set, the set before
 * it shown until then. troika sets a text's letters a frame or two after it
 * is given them and draws the old ones meanwhile, where their run now is: a
 * letter deleted stayed on the page for a moment, the caret already before
 * it. The first set is shown as it comes - nothing was there before it -
 * faded in if `fadeIn`. `onDrawn` is told each set once every letter of it
 * is in view. Moved, they are moved by what holds them: a set placed
 * elsewhere is another set. Sets given faster than they are set: the one
 * being set shown, then the latest (textSets).
 */
export function WholeTexts2D({
  texts,
  fadeIn = false,
  onDrawn,
  renderOrder,
  opacity,
  family,
}: {
  texts: readonly TextItem[];
  fadeIn?: boolean;
  onDrawn?: (texts: readonly TextItem[]) => void;
  renderOrder?: number;
  /** How opaque they are, read at each frame (Texts2D `opacity`). */
  opacity?: { readonly current: number };
  /** Their own typeface, where it is not the labels' (Texts2D `family`). */
  family?: string;
}) {
  // (two sets, one shown and one being set - each set made anew, so that it waits in its own Suspense - and the latest, to be set next: textSets)
  const sets = useRef(noTextSets<readonly TextItem[]>());
  const [, setShown] = useState(0);
  const told = useRef(onDrawn);
  told.current = onDrawn;
  const s = sets.current;
  textsGiven(s, texts, sameTexts);
  const first = useRef(true);
  const drawn = (i: 0 | 1, items: readonly TextItem[]) => {
    const was = setDrawn(sets.current, i, items);
    if (!was) return;
    if (was === "shown") setShown((n) => n + 1);
    told.current?.(items);
  };
  const out = (
    <group>
      {([0, 1] as const).map((i) => {
        const items = s.at[i];
        if (!items) return null;
        return (
          <Suspense key={i} fallback={null}>
            <group visible={i === s.front}>
              <Texts2D texts={items} fade={fadeIn && first.current} onDrawn={(t) => drawn(i, t)} renderOrder={renderOrder} opacity={opacity} family={family} />
            </group>
          </Suspense>
        );
      })}
    </group>
  );
  first.current = false;
  return out;
}
