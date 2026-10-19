import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { usePresentingWindow } from "../../presenting";
import { useInFront } from "../../layouts/inFront";
import { useEditor, useEditorStore } from "./store";
import { keyOf, settingsStylesOf, styleAsk, type StyleAsk } from "./styleOffer";

/**
 * Asked over a workspace's canvas when a style in Settings - the drawing
 * style, or the 3D styles in their roles - has changed while it was open
 * and is not the workspace's own (docs/WORKSPACE.md, *Drawing style*;
 * styleOffer): whether to apply it to this workspace. Asked once a
 * change - in each workspace open, when it is in front - never in Settings
 * itself, nor over a talk: it waits, and is asked when the workspace is
 * next in front after it. *Apply to this workspace* (Enter) takes
 * Settings' styles as one step, eased; *Keep its style* - and Escape, or a
 * press elsewhere - leaves the workspace as it is, and it is not asked
 * again until Settings' styles change again.
 */
export default function SettingsStyleAsk({ active }: { active: boolean }) {
  const store = useEditorStore();
  const drawing = useAppSettings((s) => s.drawingStyle);
  const style3d = useAppSettings((s) => s.style3d);
  const settings = useMemo(() => settingsStylesOf(drawing, style3d), [drawing, style3d]);
  const style = useEditor((s) => s.docStyle);
  const docStyle3d = useEditor((s) => s.docStyle3d);
  const talking = usePresentingWindow((s) => s.on);
  // (Settings' styles as the workspace was opened - and then as it last answered: a change from these is asked about)
  const [answered, setAnswered] = useState(() => keyOf(settingsStylesOf(useAppSettings.getState().drawingStyle, useAppSettings.getState().style3d)));
  const ask = styleAsk({ style, style3d: docStyle3d }, settings, answered);
  const shown = !!ask && active && !talking;
  const answer = (apply: boolean) => {
    if (apply && ask) store.getState().adoptSettingsStyles(ask.drawing ? settings.drawing : null, ask.d3 ? settings.roles : null);
    setAnswered(keyOf(settings));
  };
  return <AnimatePresence>{shown && ask && <Card key="settings-style" ask={ask} onApply={() => answer(true)} onKeep={() => answer(false)} />}</AnimatePresence>;
}

function Card({ ask, onApply, onKeep }: { ask: StyleAsk; onApply: () => void; onKeep: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const apply = useRef<HTMLButtonElement>(null);
  const inFront = useInFront();
  // (Enter on Apply, as it opens)
  useEffect(() => apply.current?.focus(), []);
  // (Enter applies - wherever the keys are but in a field being typed in; Escape, or a press elsewhere, keeps - while its tab is in front)
  useEffect(() => {
    if (!inFront) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) && !box.current?.contains(t);
      if (e.key === "Enter" && !typing && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        onApply();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onKeep();
      }
    };
    const onPress = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onKeep();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPress, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPress, true);
    };
  }, [onKeep, onApply, inFront]);
  return (
    <motion.div
      ref={box}
      role="dialog"
      aria-labelledby="settings-style-title"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-[420px] max-w-[90%] rounded-lg border border-gh-line bg-white/95 shadow-lg p-3 text-sm text-gh-black"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="settings-style-title" className="font-semibold mb-1">
        Settings has a new style
      </h2>
      {ask.drawing && (
        <p className="text-gh-gray mb-1">
          Drawing: this workspace is drawn in {ask.drawing.now}; Settings now has {ask.drawing.settings}.
        </p>
      )}
      {ask.d3 && (
        <p className="text-gh-gray mb-1">
          3D: this workspace shows {ask.d3.now}; Settings now has {ask.d3.settings}.
        </p>
      )}
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onKeep} className="rounded-md border border-gh-line px-3 py-1.5 hover:bg-gray-100">
          Keep its style
        </button>
        <button ref={apply} onClick={onApply} className="rounded-md border border-accel-base bg-accel-lightbase px-3 py-1.5 hover:brightness-95">
          Apply to this workspace
        </button>
      </div>
    </motion.div>
  );
}
