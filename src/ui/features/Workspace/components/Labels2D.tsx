import { Text } from "@react-three/drei";
import * as THREE from "three";
import { Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { DURATION, TAU, follow } from "../../../theme/motion";
import { usePresence } from "../../../theme/presence";
import { labelSetOf, placeLabel, sameTexts, type TextItem } from "../../../../lib/chem/layout2d";
import { needsFallback, useLabelFontUrl } from "../../../fonts/typefaces";
import { labelFont } from "../../../../lib/chem/labelFonts";
import { useDrawnLayout } from "./drawnLayoutContext";
import { useEditor, useEditorStore } from "../store";
import { fadeLetters, fadedOpacity, fadingOut } from "./labelFade";

/**
 * How far an italic run leans: about the slant of a sans-serif's italic.
 * The canvas leans the label's own letters; a picture asks for the
 * typeface's italic.
 */
const ITALIC_SLANT = Math.tan((12 * Math.PI) / 180);
/** How much a bold run's letters are thickened, as a share of their size: Markdown's strong words' (components/MarkdownRows). */
const BOLD = "3.5%";

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
  const keyOf = (t: TextItem, i: number) => {
    const index = t.beside ? t.markOf : t.atom;
    const id = index != null ? atoms[index]?.id : undefined;
    return id != null ? `${t.beside ? "mark" : "atom"}-${id}` : `txt-${i}`;
  };
  // (a label gone - its atom undone or deleted, its label taken back - kept a moment, by what it was drawn by, as it fades out)
  const at = new Map(layout.texts.map((t, i) => [t, i]));
  // (kept a little past the fade, so that it ends at naught, not cut short by a slow frame)
  const shown = usePresence(layout.texts, (t) => keyOf(t, at.get(t) ?? -1), DURATION.quick * 1000 + 50);
  const leavingKeys = shown.filter((e) => e.leaving).map((e) => e.key);
  const signature = leavingKeys.join("\u0000");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- as the texts are, and which are going
  const texts = useMemo(() => shown.map((e) => e.item), [layout.texts, signature]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the same
  const keys = useMemo(() => shown.map((e) => e.key), [layout.texts, signature]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the same
  const leaving = useMemo(() => new Set(leavingKeys), [signature]);
  return <Texts2D texts={texts} keyOf={(_, i) => keys[i]} leaving={leaving} onDrawn={waited ? () => store.getState().labelShown() : undefined} />;
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
export function Texts2D({
  texts: items,
  moved,
  shadow,
  renderOrder = 30,
  fade = true,
  onDrawn,
  keyOf,
  leaving,
}: {
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
}) {
  const { opts, zoom } = useDrawnLayout();

  // Set in the style's typeface, where the layout has placed each run: the
  // font the layout measures in is the one drawn with, so nothing needs
  // measuring here. Until the font is known nothing is drawn, rather than a
  // label in some other font that then jumps.
  const family = opts.fontFamily ?? "Arial";
  const texts = items.map((t) => t.text);
  // (a letter no typeface of Meno's has drawn as a white square - as the layout measured it: lib/chem/labelFonts `STAND_IN`)
  const font = useLabelFontUrl(family, needsFallback(texts));
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
  // view zooming leaves them as they are)
  const labelZoom = opts.units === "px" ? zoom : null;
  const labelColor = opts.labelColor ?? "black";
  const labels = useMemo(() => {
    if (font === null) return null;
    const set = labelSetOf(opts);
    const glyphs = labelFont(set.fontFamily);
    const fill = shadow || moved ? 0 : seen.current.level;
    return items.map((t, i) => {
      const fontWorld = labelZoom != null ? t.fontPx / Math.max(labelZoom, 1e-6) : t.fontPx;
      const key = keyOf ? keyOf(t, i) : `txt-${i}`;
      return (
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
                material-toneMapped={false}
                material-depthTest={false}
                material-depthWrite={false}
              >
                {glyphs.shown(run.text)}
              </Text>
            </group>
          ))}
        </group>
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyOf: what each is drawn by, as the texts are
  }, [items, opts, labelZoom, labelColor, font, moved, shadow, renderOrder]);
  if (font === null) return null;
  return <group ref={group}>{labels}</group>;
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
 * elsewhere is another set.
 */
export function WholeTexts2D({ texts, fadeIn = false, onDrawn, renderOrder }: { texts: readonly TextItem[]; fadeIn?: boolean; onDrawn?: (texts: readonly TextItem[]) => void; renderOrder?: number }) {
  // (two sets, one shown and one being set - each set made anew, so that it waits in its own Suspense)
  const sets = useRef<{ at: [readonly TextItem[] | null, readonly TextItem[] | null]; front: 0 | 1; told: readonly TextItem[] | null }>({ at: [null, null], front: 0, told: null });
  const [, setShown] = useState(0);
  const told = useRef(onDrawn);
  told.current = onDrawn;
  const s = sets.current;
  const back = (1 - s.front) as 0 | 1;
  const front = s.at[s.front];
  if (!front) s.at[s.front] = texts;
  else if (sameTexts(front, texts)) s.at[back] = null;
  else if (!(s.at[back] && sameTexts(s.at[back]!, texts))) s.at[back] = texts;
  const first = useRef(true);
  const drawn = (i: 0 | 1, items: readonly TextItem[]) => {
    const now = sets.current;
    if (now.at[i] !== items || now.told === items) return;
    if (i !== now.front) {
      now.front = i;
      now.at[(1 - i) as 0 | 1] = null;
      setShown((n) => n + 1);
    }
    now.told = items;
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
              <Texts2D texts={items} fade={fadeIn && first.current} onDrawn={(t) => drawn(i, t)} renderOrder={renderOrder} />
            </group>
          </Suspense>
        );
      })}
    </group>
  );
  first.current = false;
  return out;
}
