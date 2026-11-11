import { unlockPdf, type HeldPdf } from "./reader";

/**
 * A PDF locked with a password opened with the one typed: nothing comes back
 * of it but what went wrong, in words, or `null` where it opened - and then
 * `opened` is given its pages, as any PDF held has them. The password is sent
 * to the reader (`unlock`) and goes no further: not into `opened`, not into
 * the words said, not anywhere kept.
 */
export async function openLocked(
  sha256: string,
  password: string,
  opened: (sha256: string, pages: HeldPdf["pages"]) => void,
  unlock: (sha256: string, password: string) => Promise<HeldPdf> = unlockPdf,
): Promise<string | null> {
  try {
    const held = await unlock(sha256, password);
    opened(sha256, held.pages);
    return null;
  } catch (e) {
    const said = e instanceof Error ? e.message : String(e);
    // (never the word typed, whatever said it)
    return said.split(password).join("").trim() || "Meno could not open it";
  }
}
