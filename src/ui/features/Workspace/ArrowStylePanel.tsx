import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo } from "react";
import { resolveStyle, type DrawingStyle } from "../../../lib/chem/style";
import { fieldOf, sameValue } from "../../../lib/chem/styleFields";
import {
  ARROW_SETTINGS,
  type ArrowLook,
  type ArrowSetting,
} from "../../../lib/chem/reactionArrow";
import { SettingRow } from "../StyleEditor";
import { useEditor } from "./store";
import { useDrawingStyle } from "./useDrawingStyle";

/**
 * One reaction arrow's own line and head, beside the canvas: each setting
 * left alone follows the drawing style, and one changed here is the arrow's
 * own. Changes are edits to the document, so undo takes them back.
 */
export default function ArrowStylePanel({
  arrowId,
  onClose,
}: {
  arrowId: number;
  onClose: () => void;
}) {
  const arrow = useEditor((s) => s.arrows.find((a) => a.id === arrowId));
  const setArrowLook = useEditor((s) => s.setArrowLook);
  const style = useDrawingStyle();
  const look = useMemo(() => arrow?.look ?? {}, [arrow]);
  const drawn = useMemo(() => resolveStyle(style, look), [style, look]);
  // an arrow deleted, or undone away, takes its panel with it
  useEffect(() => {
    if (!arrow) onClose();
  }, [arrow, onClose]);
  if (!arrow) return null;

  const setTo = (key: ArrowSetting, value: DrawingStyle[ArrowSetting] | undefined) => {
    const next: ArrowLook = { ...look };
    // the drawing style's own value is no change of the arrow's
    if (value === undefined || sameValue(style[key], value)) delete next[key];
    else (next as Record<string, unknown>)[key] = value;
    setArrowLook(arrowId, next, `arrow-style:${arrowId}:${key}`);
  };

  return (
    <aside
      aria-label="This arrow's style"
      className="w-[25rem] max-w-[50vw] shrink-0 h-full border-l border-gh-line bg-white flex flex-col"
    >
      <header className="flex items-center justify-between px-4 h-11 border-b border-gh-line">
        <h2 className="text-sm font-semibold text-gh-black">Arrow</h2>
        <button
          onClick={onClose}
          aria-label="Close Arrow"
          title="Close Arrow"
          className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-gh-base"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 overflow-auto px-4 py-3">
        <p className="text-xs leading-snug text-gh-gray">
          This arrow&apos;s line and head. A setting left alone follows the
          drawing style; one changed here is this arrow&apos;s own.
        </p>
        <div className="mt-3 rounded-lg border border-gh-line divide-y divide-gh-line bg-white">
          {ARROW_SETTINGS.map((key) => (
            <SettingRow
              key={key}
              field={fieldOf(key)!}
              style={drawn}
              changed={key in look}
              onSet={(v) => setTo(key, v as DrawingStyle[ArrowSetting] | undefined)}
              onReset={() => setTo(key, undefined)}
              resetTitle="Back to the drawing style's value"
              stacked
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
