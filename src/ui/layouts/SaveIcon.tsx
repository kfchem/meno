import type { SVGProps } from "react";

/**
 * Save, as a floppy disk - the sign for saving people read at a glance -
 * drawn as Heroicons' outline set is, beside which it stands in the title
 * bar: a 24-unit square, lines 1.5 wide, ends and corners rounded. (The set
 * has none of its own: its arrow into a tray reads as a download.)
 */
export default function SaveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M5.25 3.75h10.94a1.5 1.5 0 0 1 1.06.44l2.56 2.56a1.5 1.5 0 0 1 .44 1.06v10.94a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V5.25a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M8.25 3.75v3.75a.75.75 0 0 0 .75.75h5.25a.75.75 0 0 0 .75-.75V3.75" />
      <path d="M7.5 20.25V15a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 .75.75v5.25" />
    </svg>
  );
}
