import { useEffect, useMemo, useRef, useState } from "react";
import type { Role3D, Style3D } from "../../../lib/chem/style3d";
import { DEFAULT_WORKSPACE_3D, mixStyle3d, style3dIn } from "../../../lib/chem/workspaceStyle3d";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { DURATION } from "../../theme/motion";
import { useEditor } from "./store";
import type { EditorState } from "./store/types";

/**
 * How a workspace's molecules in 3D look and turn: its styles in 3D (its
 * looks and its light, lib/chem/workspaceStyle3d) - how a drag turns one,
 * and how very large drawings are drawn, Settings'.
 */
export function style3dOf(st: Partial<Pick<EditorState, "docStyle3d">>): Style3D {
  // (a page that is no workspace's - an abbreviation's picture: Meno's own)
  return style3dIn(st.docStyle3d ?? DEFAULT_WORKSPACE_3D, useAppSettings.getState().style3d);
}

/** The same, for a component: it draws again as the workspace's styles, or Settings', change. */
export function useStyle3D(): Style3D {
  const ws = useEditor((s) => s.docStyle3d);
  const viewer = useAppSettings((s) => s.style3d);
  return useMemo(() => style3dIn(ws, viewer), [ws, viewer]);
}

/** The names of the styles the workspace's primary and secondary look are: what a switch to either is called. */
export function useStyleNames3D(): Record<Role3D, string> {
  const ws = useEditor((s) => s.docStyle3d);
  return useMemo(() => ({ primary: ws.primary.name, secondary: ws.secondary.name }), [ws]);
}

/**
 * `style` as the canvas draws it: a change gone over to rather than jumped
 * to - each number and colour of its looks and its light eased from what
 * it was to what it is (the rest at once), as a change of the drawing
 * style eases its bond (docs/WORKSPACE.md, *Styles in 3D*); `atOnce`, a
 * very large drawing's, without easing; and, where nothing was `drawn` in
 * 3D before it came - a workspace opened, its style coming with its
 * molecules - at once, in the very render it comes in (`styleGoesOver`):
 * there is nothing to go over from, and each step would make every
 * molecule again.
 */
export function useEasedStyle3D(style: Style3D, atOnce = false, drawn = true): Style3D {
  const [shown, setShown] = useState(style);
  const now = useRef(style);
  const drawnBefore = useRef(drawn);
  if (styleGoesOver(style, now.current, drawnBefore.current) === "at once") now.current = style;
  drawnBefore.current = drawn;
  useEffect(() => {
    if (style === now.current) return;
    // (a very large drawing: at once - each step would make every molecule again)
    if (atOnce) {
      now.current = style;
      setShown(style);
      return;
    }
    const start = performance.now();
    const was = now.current;
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / (DURATION.move * 1000 * 1.6));
      const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const s = t >= 1 ? style : mixStyle3d(was, style, k);
      now.current = s;
      setShown(s);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [style, atOnce]);
  return style === now.current ? style : shown;
}

/**
 * How a canvas takes a style that has come (`style`) for the one it draws
 * (`was`): not at all, the same; at once, where nothing was drawn in 3D
 * before it came; else eased (`useEasedStyle3D`).
 */
export function styleGoesOver(style: Style3D, was: Style3D, drawnBefore: boolean): "same" | "at once" | "eased" {
  if (style === was) return "same";
  return drawnBefore ? "eased" : "at once";
}
