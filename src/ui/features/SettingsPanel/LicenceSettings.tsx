import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { BaseDirectory, readDir, readTextFile } from "@tauri-apps/plugin-fs";
import { DURATION, EASE, LEAVE } from "../../theme/motion";
import { PROSE_WIDTH } from "./widths";

/** Where the app carries the licences' texts (tauri.conf.json, `bundle.resources`). */
const FOLDER = "resources/licenses";
/** The notices of every npm package and crate Meno is built with (scripts/licenses/notices.mjs), shown first. */
const NOTICES = "THIRD-PARTY-NOTICES.txt";

/** The licences' files, the notices first and the rest by name. */
function licenceOrder(names: string[]): string[] {
  return [...names].sort((a, b) => (a === NOTICES ? -1 : b === NOTICES ? 1 : a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The licences of the software by others that Meno is built with and
 * carries (docs/RELEASING.md, *Third-party notices*): each file in the
 * app's licences folder, read from the app itself, and shown as it is.
 */
export default function LicenceSettings() {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || names) return;
    let gone = false;
    readDir(FOLDER, { baseDir: BaseDirectory.Resource })
      .then((entries) => {
        if (gone) return;
        const files = licenceOrder(entries.filter((e) => e.isFile).map((e) => e.name));
        setNames(files);
        setChosen(files[0] ?? null);
      })
      .catch((e) => {
        console.warn("the licences could not be listed", e);
        if (!gone) setFailed(true);
      });
    return () => {
      gone = true;
    };
  }, [open, names]);

  useEffect(() => {
    if (!chosen) return;
    let gone = false;
    setText(null);
    readTextFile(`${FOLDER}/${chosen}`, { baseDir: BaseDirectory.Resource })
      .then((t) => !gone && setText(t))
      .catch((e) => {
        console.warn(`${chosen} could not be read`, e);
        if (!gone) setFailed(true);
      });
    return () => {
      gone = true;
    };
  }, [chosen]);

  return (
    <div className="mt-4 rounded-lg border border-gh-line bg-white">
      <div className="px-3 py-2.5 flex gap-3 items-start">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-gh-black">Licences</div>
          <p className={`text-xs leading-snug text-gh-gray mt-0.5 ${PROSE_WIDTH}`}>
            The software by others that Meno is built with and carries, and the licence each comes under.
            {failed && <span className="block text-gh-black mt-1">The licences could not be read.</span>}
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="shrink-0 h-7 px-2.5 rounded-md border border-gh-line bg-white text-xs text-gh-black hover:bg-gh-base"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="licences"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: LEAVE }}
            transition={{ duration: DURATION.base, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t border-gh-line px-3 py-2.5">
              {names && (
                <div className="flex flex-wrap gap-1">
                  {names.map((n) => (
                    <button
                      key={n}
                      onClick={() => setChosen(n)}
                      aria-pressed={chosen === n}
                      className={clsx(
                        "h-6 px-2 rounded-md border text-[11px] transition-[background-color,border-color,color] duration-150 ease-meno",
                        chosen === n ? "border-gh-line bg-gh-base text-gh-black" : "border-transparent text-gh-gray hover:text-gh-black",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
              <pre className="mt-2 h-96 overflow-auto rounded-md border border-gh-line bg-gh-base/40 px-3 py-2 font-mono text-[11px] leading-snug text-gh-black whitespace-pre-wrap break-words select-text">
                {text ?? ""}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
