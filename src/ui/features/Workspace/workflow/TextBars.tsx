import clsx from "clsx";
import { useLayoutEffect, useRef, useState, type HTMLAttributes } from "react";
import { textBars, type Bar } from "./linesAsBars";

/**
 * A box of words that, `on`, shows each line of them as a grey bar (the
 * lines' grey, `gh-line`) where
 * it lies - as a text on the page does where its words are too small to
 * read - its words unseen and nothing in it to be pressed; faded over as
 * it goes either way. Measured again as it changes size.
 */
export default function TextBars({ on, className, children, ...rest }: { on: boolean } & HTMLAttributes<HTMLDivElement>) {
  const box = useRef<HTMLDivElement>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!on || !el) return;
    const measure = () => setBars(textBars(el));
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [on]);
  return (
    <div ref={box} className={clsx("relative", on && "meno-barred", className)} {...rest}>
      {children}
      {on && (
        <div aria-hidden className="meno-fade-in pointer-events-none absolute inset-0">
          {bars.map((b, i) => (
            <div key={i} className="absolute rounded-full bg-gh-line" style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />
          ))}
        </div>
      )}
    </div>
  );
}
