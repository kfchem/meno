/**
 * A Markdown text read in the column, formatted, drawn on the canvas (docs/
 * PDF.md, *Markdown*, *One canvas*): in the column's pass, as a text's
 * source is (ColumnText) - each row of it laid out a picture drawn in the
 * system's type (TextEditor/markdownPictures), only those in view; what is
 * selected lit over them. Its HTML half, over it, takes the pointer, the
 * wheel and the keys (TextEditor/MarkdownBody); the two share its reader
 * (TextEditor/columnText). In the column's units: CSS pixels from its
 * body's top left, down negative.
 */
import * as THREE from "three";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { flushSync, useThree } from "@react-three/fiber";
import { COLORS } from "../../../theme/colors";
import { selFrom, selTo } from "../../../../lib/text/editing";
import { useKinds } from "../../../../lib/io/kinds";
import { useEditorStore } from "../store";
import type { WorkspaceText } from "../store/types";
import { columnText, markdownReaderOf } from "../../TextEditor/columnText";
import { BAND_PX } from "../../TextEditor/linePictures";
import { forgetRowPictures, rowPicture } from "../../TextEditor/markdownPictures";
import { markdownTypeReady, measureText } from "../../TextEditor/markdownType";
import { codeColoursFor } from "../../TextEditor/markdownCode";

/** What is selected, lit as in a text's source; less, where the column has not the keys. */
const SELECTED = 0.3;
const SELECTED_AWAY = 0.15;

/** `hidden`, nothing: its rows are on their way into the column, or back to the page (TextFlight). */
export default function MarkdownText({ text, hidden = false }: { text: WorkspaceText; hidden?: boolean }) {
  const store = useEditorStore();
  const entry = columnText(store, text.id, text.text);
  const reader = markdownReaderOf(entry, text.text);
  const { invalidate } = useThree();
  const dpr = useThree((s) => s.viewport.dpr);
  const at = (x: number, top: number, w: number, h: number): [number, number, number] => [Math.round(x * dpr) / dpr + w / 2, -(Math.round(top * dpr) / dpr + h / 2), 0];
  const [, setTick] = useState(0);
  const [typeIn, setTypeIn] = useState(false);
  useEffect(() => {
    void markdownTypeReady().then(() => {
      // (its rows drawn again in the type come)
      forgetRowPictures();
      reader.relay();
      setTypeIn(true);
    });
  }, [reader]);
  useEffect(() => {
    let due = false;
    entry.redraw = () => {
      if (!due) {
        due = true;
        queueMicrotask(() => {
          due = false;
          flushSync(() => setTick((t) => t + 1));
        });
      }
      invalidate();
    };
    return () => {
      entry.redraw = () => {};
    };
  }, [entry, invalidate]);
  // (what it says as it is now: written in its source, an undo)
  useEffect(() => reader.setText(text.text), [reader, text.text]);
  // (its code coloured by the grammars Meno has, and the plugins added - laid out again once a plugin's grammar is made)
  const told = useKinds();
  useEffect(() => reader.setColours(codeColoursFor(told.kinds, told.texts, () => reader.relay())), [reader, told]);
  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => plane.dispose(), [plane]);
  if (!typeIn || hidden || !reader.viewW) return null;
  const laid = reader.layout;
  const top = reader.scrollTop;
  const bottom = top + reader.viewH;
  const out: ReactNode[] = [];
  const from = selFrom(reader.sel);
  const to = selTo(reader.sel);
  laid.rows.forEach((r, i) => {
    if (r.y + r.h < top || r.y > bottom || (!r.pieces.length && !r.decos.length)) return;
    for (let band = 0; band * BAND_PX < laid.width; band++) {
      const p = rowPicture(r, laid.width, band, dpr);
      if (!p) break;
      out.push(
        <mesh key={`r${i}:${band}`} geometry={plane} position={at(band * BAND_PX, r.y - top, p.w, p.h)} scale={[p.w, p.h, 1]} renderOrder={0}>
          <meshBasicMaterial map={p.texture} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>,
      );
    }
    // (what is selected of its words: one band a line, as tall as its largest type - and on past its end, where it goes on)
    if (from === to) return;
    const lines = new Map<number, { x0: number; x1: number; px: number }>();
    for (const p of r.pieces) {
      if (p.at < 0 || p.at >= to || p.at + p.text.length <= from) continue;
      const a = Math.max(0, from - p.at);
      const b = Math.min(p.text.length, to - p.at);
      const x0 = p.x + measureText(p.text.slice(0, a), p.font);
      const x1 = p.x + measureText(p.text.slice(0, b), p.font) + (to > p.at + p.text.length ? measureText(" ", p.font) : 0);
      const l = lines.get(p.y);
      lines.set(p.y, l ? { x0: Math.min(l.x0, x0), x1: Math.max(l.x1, x1), px: Math.max(l.px, p.font.px) } : { x0, x1, px: p.font.px });
    }
    for (const [base, l] of lines) {
      const h = Math.round(l.px * 1.45);
      const y = r.y - top + base - Math.round(l.px * 1.08);
      const w = Math.max(1, l.x1 - l.x0);
      out.push(
        <mesh key={`s${i}:${base}`} geometry={plane} position={at(l.x0, y, w, h)} scale={[w, h, 1]} renderOrder={1}>
          <meshBasicMaterial color={COLORS.highlight} transparent opacity={reader.focused ? SELECTED : SELECTED_AWAY} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>,
      );
    }
  });
  return <>{out}</>;
}
