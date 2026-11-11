import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { learnPrinting, printingKnown, type Printing } from "../../../../lib/pdf/print";

/** What the author of the PDF known by `sha256` allows of printing it - none given until the reader has said (and none outside the app, where there is no reader). */
export function usePrinting(sha256: string | undefined): Printing | undefined {
  const [, said] = useState(0);
  useEffect(() => {
    if (!sha256 || !isTauri() || printingKnown(sha256)) return;
    let live = true;
    learnPrinting(sha256).then(
      () => live && said((n) => n + 1),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [sha256]);
  return sha256 ? printingKnown(sha256) : undefined;
}
