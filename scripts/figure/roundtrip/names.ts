/** A molecule's name as the round trip's files are named for it. */
export function fileName(name: string): string {
  return name.replace(/[^A-Za-z0-9+-]+/g, "_");
}
