import { useMemo } from "react";
import {
  styleOf,
  type DrawingStyle,
  type StyleChoice,
} from "../../../lib/chem/style";
import { useEditor } from "./store";

/** The style choice this canvas is drawn in: its workspace's, the one it was made in or given since. */
export function useStyleChoice(): StyleChoice {
  return useEditor((s) => s.docStyle);
}

/** The drawing style this canvas is drawn in. */
export function useDrawingStyle(): DrawingStyle {
  const choice = useStyleChoice();
  return useMemo(() => styleOf(choice), [choice]);
}
