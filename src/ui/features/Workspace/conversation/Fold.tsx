import { useState, type ReactNode } from "react";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { EASED } from "../../../theme/motion";
import { useOpening } from "../../../theme/opening";

/**
 * A line of the conversation's column, folded over what is below it: its
 * chevron turning as it opens, what is below growing in and then fading in
 * - fading out and then shrinking as it shuts - as a group on a card opens
 * (theme/opening). Shut, what is below takes no room.
 */
export default function Fold({ head, children, className }: { head: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const { grown, shown } = useOpening(open);
  return (
    <div className={className}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-1 text-left cursor-default">
        <ChevronRightIcon className={`mt-[3px] h-2.5 w-2.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} style={EASED} strokeWidth={2.5} aria-hidden />
        <span className="min-w-0">{head}</span>
      </button>
      <div className="grid" style={{ gridTemplateRows: `${grown}fr`, opacity: shown }}>
        <div className="min-h-0 overflow-hidden">{open || grown > 0 ? children : null}</div>
      </div>
    </div>
  );
}
