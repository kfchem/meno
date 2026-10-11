/**
 * What a file opened or dropped is (lib/io/kinds), told once, by what it
 * holds: among the kinds registered - Meno's, and those of the plugins
 * added, looked at afresh - and those the catalogues of the plugins added
 * name (lib/plugins/guide), so that a file only a plugin not added would
 * read is told as that, and Meno says which plugin the catalogue suggests
 * (lib/calc/read `whoReads`). A plugin not added is never looked at. Where
 * nothing it holds tells, a plugin added is asked (`probe`): last, only the
 * plugins added that read such a kind, only where the file's name is one
 * such a kind's files go by - asking starts the plugin, as opening the file
 * would.
 */
import { cataloguedKinds, headOf, kindById, kindOf, kinds, probeCandidates, type Kind } from "../io/kinds";
import { readersOf } from "./catalog";
import { addedReaders, readerClient } from "./workers";

/** What a file is: told by what it holds, or by a plugin added, asked; or what a catalogue names it, for a plugin not added. None, where nothing says. */
export async function kindOfFile(name: string, text: string): Promise<Kind | null> {
  // (the plugins added, looked at afresh: their kinds registered)
  await addedReaders().catch(() => null);
  // told among every kind there is to be had - a banner of a kind only a
  // catalogue names is still stronger evidence than a molfile's markers -
  // and where that kind is not registered, it is what a plugin not added reads
  const all = [...kinds(), ...cataloguedKinds().filter((k) => !kindById(k.id))];
  const told = kindOf(name, text, all);
  if (told && !kindById(told.id)) return told;
  return told ?? (await probeKind(name, text));
}

/** The kind a plugin added says a file is, asked; none, where none says so. */
export async function probeKind(name: string, text: string): Promise<Kind | null> {
  const candidates = probeCandidates(name);
  if (!candidates.length) return null;
  const added = await addedReaders();
  const head = headOf(text);
  for (const kind of candidates) {
    for (const p of readersOf(kind.id).filter((r) => !r.builtin && added.has(r.id))) {
      const yes = await readerClient(p)
        .then((c) => c.probe(kind.id, name, head))
        .catch(() => false);
      if (yes) return kind;
    }
  }
  return null;
}
