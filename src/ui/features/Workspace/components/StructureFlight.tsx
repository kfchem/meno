/**
 * A structure carried out of a PDF (./structureDrag), drawn as Meno draws it,
 * over everything - the column too. It lifts off where the structure lay on
 * the PDF's page, as large as it was there, and follows the pointer, held
 * where the pointer pressed it; over the canvas it is as large as the canvas
 * will draw it. Let go there, it is drawn over the structure put down a
 * moment and fades; let go anywhere else, it goes back to where it was, and
 * fades. Every change eased, none at once.
 */
import { useEffect, useState } from "react";
import { useEditor, useEditorStore } from "../store";
import { canvasPxPerUnit } from "./wordsDrag";
import { BACK_MS, HANDOVER_MS } from "./structureDrag";
import { DURATION } from "../../../theme/motion";

/** How long it takes to lift off, and to grow or shrink as it goes over the canvas or off it, in ms: what comes into view, as a mark does. */
const LIFT_MS = DURATION.base * 1000;
const SIZE_MS = DURATION.base * 1000;

export default function StructureFlight() {
  const store = useEditorStore();
  const f = useEditor((s) => s.pdfStructureFlight);
  const [lifted, setLifted] = useState(false);
  useEffect(() => {
    if (!f) {
      setLifted(false);
      return;
    }
    const t = window.setTimeout(() => setLifted(true), 16);
    return () => window.clearTimeout(t);
  }, [f?.start]);
  if (!f) return null;
  // (as large as the canvas would draw it, over the canvas; as it lay on the PDF's page, elsewhere)
  const k = f.now.over ? canvasPxPerUnit(store, f.now.x, f.now.y) : null;
  const width = k ? f.w * k : f.from.width;
  const height = k ? f.h * k : f.from.height;
  // (held where it was pressed: the same share of it under the pointer)
  const rx = f.from.width > 0 ? (f.grab.x - f.from.left) / f.from.width : 0.5;
  const ry = f.from.height > 0 ? (f.grab.y - f.from.top) / f.from.height : 0.5;
  const back = f.now.end?.to === "back";
  const landed = f.now.end?.to === "page";
  const left = back ? f.from.left : f.now.x - rx * width;
  const top = back ? f.from.top : f.now.y - ry * height;
  const shown = back ? f.from : { width, height };
  const ms = back ? BACK_MS : landed ? HANDOVER_MS : SIZE_MS;
  return (
    <img
      alt=""
      aria-hidden
      src={`data:image/svg+xml;utf8,${encodeURIComponent(f.svg)}`}
      draggable={false}
      // (lifted, its shadow the theme's for what floats over the page - docs/LOOK: shadow-lg - following its ink, not its box)
      className={lifted && !back && !landed ? "drop-shadow-lg" : ""}
      style={{
        position: "fixed",
        left,
        top,
        width: shown.width,
        height: shown.height,
        pointerEvents: "none",
        zIndex: 60,
        opacity: back || landed ? 0 : 1,
        transform: lifted && !back && !landed ? "scale(1.04)" : "scale(1)",
        // (Meno's easing, and its leaving one for what goes - theme/motion, App.css)
        transition: [
          `left ${back ? BACK_MS : 0}ms var(--ease-meno)`,
          `top ${back ? BACK_MS : 0}ms var(--ease-meno)`,
          `width ${ms}ms var(--ease-meno)`,
          `height ${ms}ms var(--ease-meno)`,
          `opacity ${ms}ms ${back || landed ? "var(--ease-meno-leave)" : "var(--ease-meno)"}`,
          `transform ${LIFT_MS}ms var(--ease-meno)`,
          `filter ${LIFT_MS}ms var(--ease-meno)`,
        ].join(", "),
      }}
    />
  );
}
