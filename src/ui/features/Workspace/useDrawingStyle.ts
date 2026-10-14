import { useMemo } from "react";
import {
  styleOf,
  type DrawingStyle,
  type StyleChoice,
} from "../../../lib/chem/style";
import type { LayoutOptions } from "../../../lib/chem/layout2d";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { useEditor } from "./store";
import { editorLayoutOptions } from "./layoutOptions";

/**
 * The style choice this canvas is drawn in: its document's own, or the
 * application's.
 */
export function useStyleChoice(): StyleChoice {
  const own = useEditor((s) => s.docStyle);
  const app = useAppSettings((s) => s.drawingStyle);
  return own ?? app;
}

/** The drawing style this canvas is drawn in. */
export function useDrawingStyle(): DrawingStyle {
  const choice = useStyleChoice();
  return useMemo(() => styleOf(choice), [choice]);
}

/**
 * The layout's options as the drawing style alone makes them - its type,
 * its ink, a point's size on the page - for layers drawn by the style and
 * not by the drawing: those that take them from the drawing's layout
 * (components/DrawnLayout) are drawn again at every frame of a zoom, which
 * it carries too.
 */
export function useStyleOptions(): LayoutOptions {
  const style = useDrawingStyle();
  return useMemo(() => editorLayoutOptions(style), [style]);
}
