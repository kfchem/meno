import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { useEditorStore } from "../store";
import PageHtml from "../components/PageHtml";
import { setViewGoal } from "../components/viewGoal";
import { pageAt } from "../utils/page";
import { HTML_DISTANCE, PX } from "../workflow/look";
import { carryFrame } from "./carry";
import { frameWords } from "./frameWords";
import { moveRender, rendersOf, stopRender, withWords, type Rendering } from "./renders";

/**
 * Renders under way on the page (docs/RENDER.md): each where what it makes
 * will lie, as large - a dashed frame, and in it how far it is, what its
 * job said last and a way to stop it - or, where it failed, why, and a way
 * to put it away. In the page's layer of HTML, so that it zooms with the
 * page as all on it does. Dragged, the frame moves, as anything on the page
 * does, and what the render makes lands where it stands then (the
 * maintainer, 2026-10-28).
 */
export default function Renders2D() {
  const store = useEditorStore();
  const list = rendersOf(store)((s) => s.list);
  const { camera, size, invalidate } = useThree();
  // a render begun is brought into view with what it renders, the view easing to them where they are not all in view
  const seen = useRef(0);
  useEffect(() => {
    const added = list.filter((r) => r.key > seen.current);
    if (!added.length) return;
    seen.current = Math.max(...added.map((r) => r.key));
    // (where what it makes will lie, with its words where they are below it, and what it renders)
    const boxes = added.flatMap((r) => [withWords(r.at, !!r.note), r.around]);
    const x0 = Math.min(...boxes.map((b) => b.x0));
    const x1 = Math.max(...boxes.map((b) => b.x1));
    const y0 = Math.min(...boxes.map((b) => b.y0));
    const y1 = Math.max(...boxes.map((b) => b.y1));
    const cam = camera as THREE.OrthographicCamera;
    const a = pageAt(-1, -1, cam);
    const c = pageAt(1, 1, cam);
    const cover = store.getState().cover;
    const right = Math.max(a.x, c.x) - cover / cam.zoom;
    if (x0 >= Math.min(a.x, c.x) && x1 <= right && y0 >= Math.min(a.y, c.y) && y1 <= Math.max(a.y, c.y)) return;
    const zoom = Math.min((size.width - cover) / ((x1 - x0) * 1.12), size.height / ((y1 - y0) * 1.12), cam.zoom);
    setViewGoal(cam, { zoom, x: (x0 + x1) / 2 + cover / 2 / zoom, y: (y0 + y1) / 2 });
    invalidate();
  }, [list, camera, size, invalidate, store]);
  if (!list.length) return null;
  return (
    <PageHtml transform distanceFactor={HTML_DISTANCE} position={[0, 0, 0]} zIndexRange={[17, 17]} pointerEvents="none">
      <div style={{ position: "relative", width: 0, height: 0 }}>
        {list.map((r) => (
          <Placeholder
            key={r.key}
            r={r}
            onStop={() => stopRender(store, r.key)}
            onMove={(x, y) => moveRender(store, r.key, x, y)}
            perPx={() => 1 / Math.max((camera as THREE.OrthographicCamera).zoom || 1, 1e-6)}
          />
        ))}
      </div>
    </PageHtml>
  );
}

/** What a render says it is doing, in a line. Its progress is hundredths of the whole (`done` of `total`, a job's own: not frames), so a film says how far it is in hundredths of its length. */
export function said(r: Rendering): string {
  if (r.state === "failed") return r.why ?? "It failed";
  if (r.stopping) return "Stopping…";
  if (r.state === "preparing") return "Getting ready…";
  if (r.state === "waiting") return "Waiting for other jobs to finish…";
  if (r.state === "finishing") return "Putting it on the page…";
  if (r.total && r.done != null) return r.kind === "film" && r.total > 1 ? `Rendering ${Math.round((100 * Math.min(r.done, r.total)) / r.total)}%…` : "Rendering…";
  return "Rendering…";
}

function Placeholder({ r, onStop, onMove, perPx }: { r: Rendering; onStop: () => void; onMove: (x: number, y: number) => void; perPx: () => number }) {
  // a drag on it moves it (carry): not one on its button
  const press = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.stopPropagation();
    carryFrame(e.currentTarget, e, r.at, perPx(), onMove);
  };
  const w = r.at.w / PX;
  const h = r.at.h / PX;
  const failed = r.state === "failed";
  const share = r.total ? Math.min(1, (r.done ?? 0) / r.total) : null;
  // (where its words go and how large, set by all it may say as it runs, or by why it failed: frameWords)
  const fw = failed ? frameWords(w, h, [said(r)], true) : frameWords(w, h, undefined, false, !!r.note);
  const inside = fw.place === "inside";
  const words = (
    <span
      className={`${inside ? "line-clamp-2 max-w-full" : "min-w-0 flex-1"} ${failed ? "text-accel-accent" : "text-gh-black"}`}
      style={{ fontSize: fw.px, lineHeight: `${(fw.px * 20) / 13}px` }}
      role={failed ? "alert" : "status"}
      title={failed ? said(r) : undefined}
    >
      {said(r)}
    </span>
  );
  const stop = (
    <button
      onClick={onStop}
      aria-label={failed ? "Put away" : "Stop rendering"}
      title={failed ? "Put away" : "Stop rendering"}
      className={`${inside ? "absolute right-1.5 top-1.5" : "shrink-0"} flex h-6 w-6 items-center justify-center rounded-md text-gh-gray transition-colors duration-150 ease-meno hover:bg-gh-base hover:text-gh-black`}
      style={{ pointerEvents: "auto" }}
    >
      <XMarkIcon className="h-4 w-4" aria-hidden />
    </button>
  );
  return (
    <div
      className={`meno-fade-in absolute flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-white/80 text-center transition-colors duration-200 ease-meno ${inside ? "px-8 py-3" : "p-1"} ${failed ? "border-accel-accent" : "border-gh-line"}`}
      style={{ left: (r.at.x - r.at.w / 2) / PX, top: -(r.at.y + r.at.h / 2) / PX, width: w, height: h, pointerEvents: "auto", cursor: "grab" }}
      onPointerDown={press}
    >
      {inside && words}
      {!failed && (
        <span
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={share == null ? undefined : Math.round(share * 100)}
          className="block h-[3px] w-1/2 max-w-[240px] overflow-hidden rounded-full bg-gh-line"
        >
          <span className="block h-full rounded-full bg-accel-base transition-[width] duration-300 ease-meno" style={{ width: `${(share ?? 0) * 100}%` }} />
        </span>
      )}
      {inside && !failed && r.line && (
        <span className="max-w-full truncate font-mono text-[10px] leading-4 text-gh-gray" title={r.line}>
          {r.line}
        </span>
      )}
      {/* (what is worth saying of what it makes: its ribbons moving only every so many frames) */}
      {inside && !failed && r.note && <span className="max-w-full truncate text-[11px] leading-4 text-gh-gray">{r.note}</span>}
      {inside && stop}
      {/* (a small frame's words, just below it, with its button: as wide as two lines of them need, or as the frame) */}
      {fw.place === "below" && (
        <div
          className="absolute left-1/2 top-full mt-1.5 flex -translate-x-1/2 items-center gap-1 rounded-md bg-white/80 pl-2 text-center"
          style={{ width: fw.width }}
          title={failed ? undefined : [r.note, r.line].filter(Boolean).join("\n") || undefined}
        >
          {words}
          {stop}
        </div>
      )}
    </div>
  );
}
