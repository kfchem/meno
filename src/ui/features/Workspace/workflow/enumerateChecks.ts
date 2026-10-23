/**
 * Enumerate's valence, checked before it runs (docs/WORKFLOWS-FOUNDATION.md,
 * *Valence, and stereocentres left open*): its rule cannot break a valence -
 * no template atom's bonds change, and each group is attached by the one
 * bond its definition marks - so a product is over-valent only where its
 * template or one of its options is. Those are asked of the checks that
 * mark valence on the canvas (a plugin's role, the one definition the
 * canvas uses), and any they flag stops the step, in their words.
 */
import type { Analysis } from "../../../../lib/roles/client";
import { chemMolblock } from "../../../../lib/roles/molblock";
import { forFlatReaders } from "../chem/drawing";
import { marksOf, valenceMessage } from "../chem/marks";
import type { Model } from "../store/types";
import { joined, readLists, templateRs, type OptionRead } from "./enumerate";

/** A group on its own as the checks are asked about it: bonded to an R, as it is in a product, its bond out counted. */
function onAnR(option: OptionRead): Model {
  const stub: Model = {
    atoms: [
      { id: 1, el: "R#", rgroups: [1], x: 0, y: 0, r: 0.9 },
      { id: 2, el: "R#", rgroups: [2], x: 1.5, y: 0, r: 0.9 },
    ],
    bonds: [{ id: 3, a: 1, b: 2, order: 1 }],
  };
  return joined(stub, [[2, [2], option]]);
}

/** What the checks flag in `model`, its R atoms aside, each as "N: Too many bonds…". */
async function flagged(model: Model, analyse: (molblock: string) => Promise<Analysis>): Promise<string[]> {
  const marks = marksOf(model, await analyse(chemMolblock(forFlatReaders(model))));
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  return [...marks.valence].filter(([id]) => byId.get(id)!.el !== "R#").map(([id, p]) => valenceMessage(byId.get(id)!.el, p));
}

/**
 * What the checks flag in Enumerate's template and in each of its options
 * (`analyse`, the role's question of a molblock): each said, naming the
 * template or the option. None where nothing is flagged. Lists that do not
 * read are not asked about: the step says why they do not, before this.
 */
export async function valenceFlagged(template: Model, text: string, analyse: (molblock: string) => Promise<Analysis>): Promise<string[]> {
  const out: string[] = [];
  if (templateRs(template).problems.length) return out;
  for (const said of await flagged(template, analyse)) out.push(`The template: ${said}`);
  const { lists, problems } = readLists(text);
  if (problems.length) return out;
  for (const [n, options] of [...lists].sort(([p], [q]) => p - q)) {
    for (const [k, o] of (options as OptionRead[]).entries()) {
      for (const said of await flagged(onAnR(o), analyse)) out.push(`R${n}, option ${k + 1} ("${o.typed.trim()}"): ${said}`);
    }
  }
  return out;
}
