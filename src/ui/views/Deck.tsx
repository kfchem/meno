import type { TabId, TabInstance } from "../../lib/core";
import type { DocumentStore } from "../../lib/doc";
import type { ViewEntry } from "../views/registry";
import { useEffect, useState } from "react";
import { DURATION } from "../theme/motion";
import { ErrorBoundary, StoppedCard } from "../layouts/ErrorBoundary";
import { InFront } from "../layouts/inFront";
import { chosen, layerOf, type Shown } from "./deckLayers";

type Props = {
  order: TabId[];
  tabs: Record<TabId, TabInstance>;
  activeId: TabId | null;
  resolveView: (kind: string) => Promise<ViewEntry> | ViewEntry;
  patchData: (id: TabId, patch: unknown) => void;
  /** Document for a tab, when its view kind uses one. */
  getDocument: (tab: TabInstance) => DocumentStore<any> | undefined;
  /** Names a tab anew: after the file its view was saved as. */
  renameTab: (id: TabId, label: string) => void;
};

export default function Deck({
  order,
  tabs,
  activeId,
  resolveView,
  patchData,
  getDocument,
  renameTab,
}: Props) {
  // the tab just left, kept in view beneath the chosen one while it fades in -
  // put there as the choice is drawn: put there by an effect after it, it was
  // hidden for the frame between, the page blank under the tab coming in
  const [shown, setShown] = useState<Shown>({ active: activeId, beneath: null });
  const now = chosen(shown, activeId);
  if (now !== shown) setShown(now);
  useEffect(() => {
    if (now.beneath == null) return;
    const t = window.setTimeout(() => setShown((s) => ({ ...s, beneath: null })), DURATION.quick * 1000 + 40);
    return () => window.clearTimeout(t);
  }, [now.active, now.beneath]);
  return (
    <div className="flex-1 w-full h-full relative">
      {order.map((id) => {
        const t = tabs[id];
        const active = activeId === id;
        const layer = layerOf(id, now);
        const entry = resolveView(t.content.kind) as ViewEntry;
        return (
          // (each tab opaque, the window's own white: a view see-through in
          // part - Settings' tint - showed the tab beneath through it, a
          // structure among the settings, and that tab then went at once)
          <div
            key={id}
            className={
              layer === "active"
                ? "absolute inset-0 flex z-10 bg-white meno-fade-in"
                : layer === "beneath"
                  ? "absolute inset-0 flex z-0 bg-white"
                  : "absolute inset-0 hidden"
            }
          >
            {entry ? (
              // (each tab its own part: should what it shows fail, a card
              // takes its place, the other tabs going on, and Reload makes
              // it again from its document - ui/layouts/ErrorBoundary)
              <ErrorBoundary
                part={`tab "${t.meta.label}"`}
                fallback={({ error, reload }) => (
                  <div className="w-full h-full relative bg-white">
                    <StoppedCard
                      said="This tab stopped working. What it holds is kept."
                      error={error}
                      actions={[{ label: "Reload", run: reload }]}
                      className="absolute top-3 left-1/2 -translate-x-1/2"
                    />
                  </div>
                )}
              >
                {/* (keyed by what the tab shows: a view taking its place - or made again - fades in) */}
                <div key={t.content.kind} className="w-full h-full flex meno-fade-in">
                  {/* (and whether it is in front, for what is drawn deep in it that hears keys on the window: ui/layouts/inFront) */}
                  <InFront.Provider value={active}>
                    <entry.Component
                      tabId={id}
                      content={t.content}
                      active={active}
                      document={getDocument(t)}
                      dispatchPatchData={(patch) => patchData(id, patch)}
                      renameTab={(label) => renameTab(id, label)}
                    />
                  </InFront.Provider>
                </div>
              </ErrorBoundary>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
