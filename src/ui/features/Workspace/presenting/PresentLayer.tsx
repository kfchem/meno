import { useEditor, useEditorStore } from "../store";
import { stageOf } from "./stage";

/**
 * What a talk is given on, over the canvas (docs/PRESENTING.md): while one
 * is given, a surface over everything takes the pointer - the canvas's part
 * of the talk (Presenter) says what a press, a drag or the wheel does there
 * - everything about the slide shown is black, as slides software has it,
 * the screen can be made black or white, and the slide's number
 * shows a moment as it comes. Always there, and nothing - letting the
 * pointer through - while no talk is given.
 */
export default function PresentLayer() {
  const store = useEditorStore();
  const on = useEditor((s) => s.presenting != null);
  const stage = stageOf(store);
  return (
    <div
      ref={(el) => {
        stage.layer = el;
      }}
      data-presenting={on || undefined}
      className="absolute inset-0 z-[60]"
      style={{ pointerEvents: on ? "auto" : "none", touchAction: "none" }}
      // (no menu while a talk is given)
      onContextMenu={(e) => {
        if (!on) return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        ref={(el) => {
          stage.veil = el;
        }}
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: 0 }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            ref={(el) => {
              stage.bands[i] = el;
            }}
            className="absolute bg-black"
            style={{ left: 0, top: 0, width: 0, height: 0 }}
          />
        ))}
      </div>
      <div
        ref={(el) => {
          stage.screen = el;
        }}
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: 0, background: "#000000", transition: "opacity 300ms cubic-bezier(0.45, 0, 0.55, 1)" }}
      />
      <div
        ref={(el) => {
          stage.count = el;
        }}
        aria-live="polite"
        className="absolute right-4 bottom-3 rounded-md bg-white/85 px-2 py-0.5 font-mono text-xs text-gh-gray pointer-events-none"
        style={{ opacity: 0, transition: "opacity 400ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
      />
    </div>
  );
}
