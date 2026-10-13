/**
 * Files held one by one - PDFs dropped or pasted together: each held where
 * it can be, and each refused named, with why, so that one refused keeps
 * none of the rest off the page.
 */
export async function heldEach<F extends { name: string }, T>(files: readonly F[], hold: (file: F) => Promise<T>): Promise<{ held: T[]; refused: string }> {
  const results = await Promise.allSettled(files.map(hold));
  const held: T[] = [];
  const refused: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") held.push(r.value);
    else refused.push(`${files[i].name} could not be opened: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  });
  return { held, refused: refused.join("\n") };
}
