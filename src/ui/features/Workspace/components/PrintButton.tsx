import { PrinterIcon } from "@heroicons/react/24/outline";
import { printTip, type Printing } from "../../../../lib/pdf/print";

/**
 * The printer button in the column's header. Where the PDF's author does not
 * allow printing it is greyed and does nothing, and its tip says why; it is
 * marked disabled for the reader of the screen, not `disabled`, as the tip of a
 * disabled button is not shown in the app's webview.
 */
export default function PrintButton({ printing, shortcut, onPrint }: { printing: Printing | undefined; shortcut: string; onPrint: () => void }) {
  const off = printing === "no";
  return (
    <button
      onClick={() => !off && onPrint()}
      aria-disabled={off || undefined}
      aria-label="Print…"
      title={printTip(printing, shortcut)}
      className={`h-7 w-7 shrink-0 rounded-md flex items-center justify-center ${off ? "text-gh-line cursor-default" : "hover:bg-gh-base"}`}
    >
      <PrinterIcon className="h-4 w-4" />
    </button>
  );
}
