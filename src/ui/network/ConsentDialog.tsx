import { AnimatePresence, motion } from "motion/react";
import { usePresentingWindow } from "../presenting";
import { FADE, RISE } from "../theme/motion";
import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef } from "react";
import { purposeName, useNetwork } from "../../lib/net/network";

/**
 * Asks before something first uses the network: what will be fetched, from
 * where, and for what. A yes is remembered for that purpose until it is
 * withdrawn in Settings; a no fetches nothing.
 */
export default function ConsentDialog() {
  // (asked once a talk given in the window has ended: ../presenting - whatever asks waits meanwhile)
  const talking = usePresentingWindow((s) => s.on);
  const asking = useNetwork((s) => (talking ? null : s.asking));
  const noRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!asking) return;
    // Not fetching is the safe answer, so it is the one a stray Enter gives.
    noRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        asking.answer(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking]);
  return (
    <AnimatePresence>
    {asking && (
    <motion.div key="consent" {...FADE} className="absolute inset-0 z-[110] flex items-center justify-center bg-black/20">
      <motion.div
        {...RISE}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="w-[420px] max-w-[92%] rounded-lg border border-gh-line bg-white shadow-lg p-5 text-sm text-gh-black"
      >
        <div className="flex items-start gap-3">
          <GlobeAltIcon className="h-6 w-6 shrink-0 text-accel-base" />
          <div className="min-w-0">
            <h2 id="consent-title" className="font-semibold">
              {asking.title}
            </h2>
            <p className="mt-2 text-gh-gray">{asking.detail}</p>
            <ul className="mt-2 space-y-0.5 text-gh-black">
              {asking.sources.map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="text-gh-gray">·</span>
                  <span className="break-words">{s}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gh-gray">
              Every connection is shown as it happens and kept in the record in
              Settings › Network. Meno remembers a yes for “
              {purposeName(asking.purpose)}” until you withdraw it there.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={noRef}
            onClick={() => asking.answer(false)}
            className="rounded-md border border-gh-line px-3 py-1.5 hover:bg-gray-100"
          >
            Not now
          </button>
          <button
            onClick={() => asking.answer(true)}
            className="rounded-md bg-accel-base px-3 py-1.5 text-white hover:opacity-90"
          >
            Allow and download
          </button>
        </div>
      </motion.div>
    </motion.div>
    )}
    </AnimatePresence>
  );
}
