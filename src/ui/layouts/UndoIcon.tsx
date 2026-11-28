import type { SVGProps } from "react";

/**
 * Undo, as an arrow curving back to the left - drawn as Heroicons' outline
 * set is, beside which it stands in the title bar (as SaveIcon): a 24-unit
 * square, lines 1.5 wide, ends and corners rounded.
 */
export default function UndoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M8.25 13.5 3.75 9l4.5-4.5" />
      <path d="M3.75 9h10.5a6 6 0 0 1 0 12H12" />
    </svg>
  );
}
