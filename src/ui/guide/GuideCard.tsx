import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import { DURATION, EASE, FADE } from "../theme/motion";
import { closeGuide, nextStep, shownStep, useGuide } from "../../lib/plugins/guides";
import { anyPluginById, type Plugin } from "../../lib/calc/catalog";
import { addPlugin, useReaders } from "../../lib/calc/workers";
import { forThisSystem } from "../../lib/plugins/here";
import type { GuidePlace } from "../../lib/plugins/guide";
import { placeCard, type Box } from "./place";

/**
 * A plugin's guide, a step at a time (lib/plugins/guides): a card in Meno's
 * own look, beside the part of the window its step points at - found by the
 * name Meno gives it (`data-guide`), never by how the window is built -
 * with a ring round that part. Nothing else is dimmed or held: the chemist
 * does what the step says on the page itself, and a step waiting for that
 * goes on by itself. Its words are the plugin's, as plain text.
 */
export default function GuideCard() {
  const open = useGuide((s) => s.open);
  const shown = shownStep(open);
  const at = shown?.step.at;
  const part = usePart(at && at !== "page" ? at : undefined);
  // (looked for only while a guide is open)
  const page = usePart(shown ? "page" : undefined);
  const cardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 160 });
  const isShown = shown != null;
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => setSize((was) => (was.width === el.offsetWidth && was.height === el.offsetHeight ? was : { width: el.offsetWidth, height: el.offsetHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isShown]);
  const win = { width: window.innerWidth, height: window.innerHeight };
  const where = placeCard(part, page ?? { left: 0, top: 0, width: win.width, height: win.height }, size, win);
  const width = shown?.step.suggest ? 380 : 312;
  return (
    <>
      <AnimatePresence>
        {shown && part && (
          <motion.div
            key="ring"
            aria-hidden
            className="fixed z-[90] pointer-events-none rounded-lg"
            style={{ boxShadow: "0 0 0 2px var(--color-accel-base), 0 0 0 6px rgb(49 118 137 / 0.15)" }}
            initial={{ opacity: 0, left: part.left - 4, top: part.top - 4, width: part.width + 8, height: part.height + 8 }}
            animate={{ opacity: 1, left: part.left - 4, top: part.top - 4, width: part.width + 8, height: part.height + 8 }}
            exit={FADE.exit}
            transition={{ duration: DURATION.move, ease: EASE }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {shown && (
          <motion.div
            key={shown.plugin.id}
            ref={cardRef}
            role="dialog"
            aria-label={shown.plugin.name}
            aria-describedby="guide-text"
            className="fixed z-[90] rounded-lg border border-gh-line bg-white p-4 text-sm text-gh-black shadow-lg"
            style={{ width }}
            initial={{ opacity: 0, left: where.left, top: where.top + 4 }}
            animate={{ opacity: 1, left: where.left, top: where.top }}
            exit={FADE.exit}
            transition={{ duration: DURATION.move, ease: EASE }}
          >
            {where.notch && <Notch side={where.notch.side} at={where.notch.at} />}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={shown.at} {...FADE}>
                <h2 className="font-semibold">{shown.step.title}</h2>
                <p id="guide-text" className="mt-1.5 text-gh-gray">
                  {shown.step.text}
                </p>
                {shown.step.suggest && <Suggested guide={shown.plugin} ids={shown.step.suggest} />}
              </motion.div>
            </AnimatePresence>
            <div className="mt-3 flex items-center gap-2">
              <span className="flex gap-1" aria-label={`Step ${shown.at + 1} of ${shown.of}`}>
                {Array.from({ length: shown.of }, (_, i) => (
                  <span key={i} className={`h-1.5 w-1.5 rounded-full transition-colors duration-150 ease-meno ${i === shown.at ? "bg-accel-base" : "bg-gh-line"}`} />
                ))}
              </span>
              <span className="flex-1" />
              {shown.at + 1 < shown.of && (
                <button onClick={closeGuide} className="rounded-md px-2 py-1.5 text-gh-gray transition-colors duration-150 ease-meno hover:bg-gh-base hover:text-gh-black">
                  Skip
                </button>
              )}
              <button onClick={nextStep} className="rounded-md bg-accel-base px-3 py-1.5 text-white transition-opacity duration-150 ease-meno hover:opacity-90">
                {shown.at + 1 < shown.of ? "Next" : "Done"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** The notch on the card's side towards what it points at. */
function Notch({ side, at }: { side: "top" | "left" | "right"; at: number }) {
  const edge = "1px solid var(--color-gh-line)";
  const style: React.CSSProperties =
    side === "top"
      ? { left: at - 6, top: -6.5, borderLeft: edge, borderTop: edge }
      : side === "left"
        ? { top: at - 6, left: -6.5, borderLeft: edge, borderBottom: edge }
        : { top: at - 6, right: -6.5, borderRight: edge, borderTop: edge };
  return <span aria-hidden className="absolute h-3 w-3 rotate-45 bg-white transition-[left,top] duration-200 ease-meno" style={style} />;
}

/**
 * The plugins a step offers, each with what it is for - as the guide's
 * plugin says - and Add, which asks for the network as adding always does;
 * those not made for this system left out.
 */
function Suggested({ guide, ids }: { guide: Plugin; ids: readonly string[] }) {
  const states = useReaders((s) => s.state);
  const problems = useReaders((s) => s.problem);
  const plugins = ids.map(anyPluginById).filter((p): p is Plugin => !!p && forThisSystem(p));
  if (!plugins.length) return null;
  return (
    <>
      <ul className="mt-3 divide-y divide-gh-line rounded-md border border-gh-line">
        {plugins.map((p) => {
          const state = states[p.id];
          return (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-gh-black">{p.name}</div>
                <div className="text-xs text-gh-gray">{guide.suggests.find((s) => s.plugin === p.id)?.for ?? p.description}</div>
                {problems[p.id] && <div className="mt-0.5 text-xs text-accel-accent meno-fade-in">{problems[p.id]}</div>}
              </div>
              <span key={state ?? "none"} className="meno-fade-in shrink-0">
                {state === "added" ? (
                  <span className="flex items-center gap-1 text-xs text-gh-gray">
                    <CheckIcon className="h-3.5 w-3.5" /> Added
                  </span>
                ) : state === "adding" ? (
                  <span className="text-xs text-gh-gray">Adding…</span>
                ) : (
                  <button
                    onClick={() => void addPlugin(p).catch(() => undefined)}
                    className="rounded-md border border-gh-line px-2.5 py-1 text-xs transition-colors duration-150 ease-meno hover:bg-gh-base"
                  >
                    Add
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-gh-gray">More in Settings, Plugins.</p>
    </>
  );
}

/**
 * Where a part of the window is that a step points at, as it moves: the one
 * seen, of those named so - a workspace in a tab behind has its own, unseen
 * - or none, where none is there now (Quick Add, a menu, closed).
 */
function usePart(place: GuidePlace | undefined): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    if (!place) {
      setBox(null);
      return;
    }
    let frame = 0;
    const look = () => {
      let seen: Box | null = null;
      for (const el of document.querySelectorAll<HTMLElement>(`[data-guide="${place}"]`)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          seen = { left: r.left, top: r.top, width: r.width, height: r.height };
          break;
        }
      }
      setBox((was) =>
        was === seen || (was && seen && was.left === seen.left && was.top === seen.top && was.width === seen.width && was.height === seen.height) ? was : seen,
      );
      frame = requestAnimationFrame(look);
    };
    look();
    return () => cancelAnimationFrame(frame);
  }, [place]);
  return box;
}
