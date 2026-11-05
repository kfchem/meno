import { useEffect, useState } from "react";
import { listOnline, useOnline } from "../../../lib/plugins/online";
import type { RoleId } from "../../../lib/plugins/roles";
import { addOffered, listShown, offeredHere } from "./offerSteps";

const BUTTON = "shrink-0 rounded-md border border-gh-line px-2 py-0.5 transition-colors duration-150 ease-meno hover:bg-gh-base disabled:opacity-60";

/**
 * What the canvas offers where a role is asked of and no plugin here fills
 * it (docs/PLUGINS.md, *Plugins online*): the plugins online that fill it,
 * each to add - got, then set up as any plugin is, asking first - and,
 * where the list of them is not here yet, the button that lists them,
 * asking first too. Nothing is fetched without the person's consent: asked
 * first, or given for the list already. Nothing is added of itself. Added,
 * it says so to the caller (`done`), which lets the line go.
 */
export default function RoleOffer({ role, done }: { role: RoleId; done: () => void }) {
  const online = useOnline();
  const [getting, setGetting] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => void listShown(), []);
  if (online.state !== "listed" || !online.catalogue) {
    return (
      <>
        <button
          disabled={online.state === "listing"}
          onClick={(e) => {
            e.stopPropagation();
            void listOnline(true);
          }}
          className={BUTTON}
        >
          {online.state === "listing" ? "Listing the plugins online…" : "List the plugins online"}
        </button>
        {online.state === "failed" && online.problem && <span className="text-accel-accent">{online.problem}</span>}
      </>
    );
  }
  const entries = offeredHere(role, online.catalogue);
  if (!entries.length) return <span className="text-gh-gray">No plugin online does it yet.</span>;
  return (
    <>
      {entries.map((entry) => (
        <button
          key={entry.id}
          disabled={getting != null}
          onClick={(e) => {
            e.stopPropagation();
            setGetting(entry.id);
            setProblem(null);
            void addOffered(entry, done, setProblem).finally(() => setGetting(null));
          }}
          className={BUTTON}
        >
          {getting === entry.id ? `Adding ${entry.name}…` : `Add ${entry.name}`}
        </button>
      ))}
      {problem && <span className="text-accel-accent">{problem}</span>}
    </>
  );
}
