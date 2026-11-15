import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * What scrolls within a part of a card, with a thin rail of Meno's own beside it: its thumb shown for as long as what it
 * holds goes past its bottom - not only while it scrolls - so the eye sees that more follows; none where all of it shows.
 * The system's own bar is not drawn. The wheel, a trackpad and the keys scroll it as ever.
 */
export default function ScrollRail({ maxHeight, children }: { maxHeight: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { scrollHeight: all, clientHeight: seen, scrollTop: at } = el;
      if (all <= seen + 1) return setThumb((t) => (t ? null : t));
      // (as long as what shows is of what it holds, never under 18 px; as far down as it has scrolled)
      const height = Math.max(18, (seen * seen) / all);
      const top = (at / (all - seen)) * (seen - height);
      setThumb((t) => (t && Math.abs(t.top - top) < 0.5 && Math.abs(t.height - height) < 0.5 ? t : { top, height }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, []);
  return (
    <div className="relative">
      <div ref={ref} className="overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ maxHeight }}>
        <div>{children}</div>
      </div>
      <div aria-hidden className="pointer-events-none absolute right-0.5 top-0.5 bottom-0.5 w-[3px] transition-opacity duration-150 ease-meno" style={{ opacity: thumb ? 1 : 0 }}>
        {thumb && <div className="absolute inset-x-0 rounded-full bg-gh-gray/45" style={{ top: thumb.top, height: thumb.height }} />}
      </div>
    </div>
  );
}
