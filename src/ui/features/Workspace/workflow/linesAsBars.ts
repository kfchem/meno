/** A bar standing for a line of words, in the box's own pixels: where it starts, its top, how wide and how tall. */
export type Bar = { x: number; y: number; w: number; h: number };

/**
 * Each line of words in `el` - and each field's value - as a bar where it
 * lies, in `el`'s own pixels however it is scaled on the screen: a line's
 * bar as tall as two fifths of the line, about its middle; a field's, its
 * left three fifths.
 */
export function textBars(el: HTMLElement): Bar[] {
  const box = el.getBoundingClientRect();
  const k = el.offsetWidth ? box.width / el.offsetWidth : 1;
  if (!(k > 0)) return [];
  const local = (r: DOMRect) => ({ x: (r.left - box.left) / k, y: (r.top - box.top) / k, w: r.width / k, h: r.height / k });
  const out: Bar[] = [];
  const range = document.createRange();
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.textContent?.trim()) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      const l = local(r);
      out.push({ x: l.x, y: l.y + l.h * 0.3, w: l.w, h: l.h * 0.4 });
    }
  }
  for (const f of el.querySelectorAll("input, select, textarea")) {
    const l = local(f.getBoundingClientRect());
    if (l.w < 1 || l.h < 1) continue;
    out.push({ x: l.x + Math.min(6, l.w * 0.1), y: l.y + l.h * 0.3, w: l.w * 0.6, h: l.h * 0.4 });
  }
  return out;
}
