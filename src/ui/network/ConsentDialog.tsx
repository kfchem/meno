import { AnimatePresence, motion } from "motion/react";
import { usePresentingWindow } from "../presenting";
import { FADE, RISE } from "../theme/motion";
import { Leaving, QUESTION_ARRIVING_MS } from "../theme/leaving";
import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { useCallback, useRef } from "react";
import { useAskedKeys } from "../layouts/asking";
import { purposeName, useNetwork, type ConsentRequest } from "../../lib/net/network";
import { questionKey } from "./questionKey";

/**
 * Asks before something first uses the network: what will be fetched, from
 * where, and for what. A yes is remembered for that purpose until it is
 * withdrawn in Settings; a no fetches nothing.
 */
export default function ConsentDialog() {
  // (asked once a talk given in the window has ended: ../presenting - whatever asks waits meanwhile)
  const talking = usePresentingWindow((s) => s.on);
  const asking = useNetwork((s) => (talking ? null : s.asking));
  const boxRef = useRef<HTMLDivElement>(null);
  // (the keys its own while it asks: Escape fetches nothing, and nothing behind it acts on one)
  useAskedKeys(boxRef, () => asking?.answer(false), !!asking);
  // Not fetching is the safe answer, so it is the one a stray Enter gives: each question's own as it comes.
  const focusNo = useCallback((el: HTMLButtonElement | null) => el?.focus(), []);
  return (
    // (one question gone before the next comes: neither shown over the other)
    <AnimatePresence mode="wait">
    {asking && (
    <Leaving key={questionKey(asking)} arriving={QUESTION_ARRIVING_MS}>
    {(held) => (
    <motion.div {...FADE} {...held} className="absolute inset-0 z-[110] flex items-center justify-center bg-black/20">
      <motion.div
        ref={boxRef}
        {...RISE}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="w-[420px] max-w-[92%] rounded-lg border border-gh-line bg-white shadow-lg p-5 text-sm text-gh-black"
      >
        <div className="flex items-start gap-3">
          <GlobeAltIcon className="h-6 w-6 shrink-0 text-accel-base" />
          <ConsentWords asking={asking} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={focusNo}
            onClick={() => asking.answer(false)}
            className="rounded-md border border-gh-line px-3 py-1.5 outline-none hover:bg-gh-base focus-visible:border-accel-base focus-visible:ring-2 focus-visible:ring-accel-lightbase"
          >
            Not now
          </button>
          <button
            onClick={() => asking.answer(true)}
            className="rounded-md bg-accel-base px-3 py-1.5 text-white outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accel-base/40"
          >
            Allow and download
          </button>
        </div>
      </motion.div>
    </motion.div>
    )}
    </Leaving>
    )}
    </AnimatePresence>
  );
}

/** A question's words: what it asks, and from where - and, where several are asked in one, each one's own under its name (a plugin and those it uses); then what every question says. */
export function ConsentWords({ asking }: { asking: ConsentRequest }) {
  return (
    <div className={asking.parts?.length ? "min-w-0 max-h-[70vh] overflow-y-auto" : "min-w-0"}>
      <h2 id="consent-title" className="font-semibold">
        {asking.title}
      </h2>
      <p className="mt-2 text-gh-gray">{asking.detail}</p>
      <Sources sources={asking.sources} />
      {asking.parts?.map((part) => (
        <section key={part.name} className="mt-3">
          <h3 className="font-semibold">{part.name}</h3>
          <p className="mt-1 text-gh-gray">{part.detail}</p>
          <Sources sources={part.sources} />
        </section>
      ))}
      <ConsentSmallPrint purpose={asking.purpose} />
    </div>
  );
}

/** Where a question's downloads come from, a line each. */
function Sources({ sources }: { sources: readonly string[] }) {
  if (!sources.length) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-gh-black">
      {sources.map((s) => (
        <li key={s} className="flex gap-2">
          <span className="text-gh-gray">·</span>
          <span className="break-words">{s}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * What every question says under its own words, once for them all: each
 * connection shown and recorded, none made offline, and a yes kept until it
 * is withdrawn. A question's own words leave these out.
 */
export function ConsentSmallPrint({ purpose }: { purpose: string }) {
  return (
    <p className="mt-3 text-xs text-gh-gray">
      Every connection is shown as it happens and kept in the record in
      Settings › Network, and none is made while Meno works offline. Meno
      remembers a yes for “{purposeName(purpose)}” until you withdraw it there.
    </p>
  );
}
