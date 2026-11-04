import { showGuide } from "../../../lib/guide/guide";

/** Meno's first steps, shown again when asked (lib/guide): in a workspace, a step at a time. */
export default function FirstStepsSettings() {
  return (
    <div className="mb-4 rounded-lg border border-gh-line bg-white">
      <div className="px-3 py-2.5 flex gap-3 items-start">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-gh-black">First steps</div>
          <p className="text-xs leading-snug text-gh-gray mt-0.5 max-w-2xl">A short tour of drawing in Meno, a step at a time, each beside the part of the window it is about.</p>
        </div>
        <button onClick={showGuide} className="shrink-0 h-7 px-2.5 rounded-md border border-gh-line bg-white text-xs text-gh-black hover:bg-gh-base">
          Show
        </button>
      </div>
    </div>
  );
}
