/**
 * Which stereoisomer each entry is (docs/WORKFLOWS-FOUNDATION.md, *The
 * entry*, its stereo): asked of the plugin that fills the role
 * `configurations`, from each entry's own geometry - every conformer its
 * own, so that a set that holds two configurations is seen to, not named
 * for its first. Kept here for the session by what the entry is and where
 * its atoms are, so that a conformer is asked once; derived from the page,
 * never saved with it.
 */
import { geometryKey, type EntryStereo } from "../../../../lib/entry";
import { writeMolfile3d } from "../../../../lib/chem/molWriter";
import type { Configured } from "../../../../lib/roles/client";
import type { SetEntry } from "./entries";

type Geometry = Pick<SetEntry, "atoms" | "bonds" | "xyz">;

/** Who answers: the plugin (its id and version), and its answers for MOL blocks in order - or nothing to ask, and why. */
export type Asker = { plugin: string; version: string; ask: (molblocks: string[]) => Promise<Configured[]> } | { none: string };

const known = new Map<string, EntryStereo>();
/** Those known only as not asked - nothing added to ask, or the plugin failed altogether: asked again next time. */
const again = new Set<string>();

/** An entry's place in what is known: its atoms (element, charge, isotope, radical), its bonds, and where its atoms are. */
const keyOf = (e: Geometry) =>
  `${e.atoms.map((a) => `${a.el}${a.charge ?? ""}${a.isotope ? `@${a.isotope}` : ""}${a.radical ?? ""}`).join(",")}|${e.bonds.map((b) => `${b.a1}-${b.a2}:${b.order}`).join(",")}|${geometryKey(e.xyz)}`;

/** Which stereoisomer an entry is, where it has been asked: absent where it has not. */
export const stereoKnown = (e: Geometry): EntryStereo | undefined => known.get(keyOf(e));

/** An entry as a MOL block in 3D, for the plugin. */
const molblockOf = (e: Geometry) =>
  writeMolfile3d(
    e.atoms.map((a, i) => ({ el: a.el, x: e.xyz[3 * i], y: e.xyz[3 * i + 1], z: e.xyz[3 * i + 2], ...(a.charge ? { charge: a.charge } : {}), ...(a.radical ? { radical: a.radical } : {}), ...(a.isotope ? { isotope: a.isotope } : {}) })),
    e.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order })),
  );

/**
 * Those of `entries` not yet known asked, all at once, and what each is
 * kept: the plugin's elements and key, with the plugin and its version; or
 * not perceived, and why - nothing added to ask, or the plugin could not
 * read that molecule, or failed altogether.
 */
export async function perceiveStereo(entries: readonly Geometry[], asker: Asker): Promise<void> {
  const fresh = [...new Map(entries.filter((e) => !known.has(keyOf(e)) || again.has(keyOf(e))).map((e) => [keyOf(e), e])).values()];
  if (!fresh.length) return;
  const unasked = (why: string) => {
    for (const e of fresh) {
      known.set(keyOf(e), { perceived: false, why });
      again.add(keyOf(e));
    }
  };
  if ("none" in asker) return unasked(asker.none);
  let answers: Configured[];
  try {
    answers = await asker.ask(fresh.map(molblockOf));
  } catch (err) {
    // (asked again next time, once the plugin can answer)
    return unasked(`It could not be asked: ${err instanceof Error ? err.message : String(err)}`);
  }
  const by = { plugin: asker.plugin, version: asker.version };
  fresh.forEach((e, i) => {
    const a = answers[i];
    again.delete(keyOf(e));
    known.set(
      keyOf(e),
      !a ? { perceived: false, why: "It gave no answer for this molecule" } : "error" in a ? { perceived: false, why: a.error } : { perceived: true, elements: a.elements, key: a.key, by },
    );
  });
}

/** Everything known forgotten (tests). */
export const forgetStereo = () => {
  known.clear();
  again.clear();
};
