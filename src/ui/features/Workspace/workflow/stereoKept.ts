/**
 * Configurations kept through Enumerate (docs/WORKFLOWS-FOUNDATION.md,
 * *Substituent swap*, *Configurations kept*): a product says every
 * configuration its template says - each stereocentre and each double
 * bond's side, mapped - and none the template does not, at the template's
 * atoms. Read back from the product's drawing as the canvas reads it
 * (lib/layout/drawn `readStereo`), so whatever the join did to the wedges
 * is checked, not assumed.
 */
import type { Bond, Model } from "../store/types";
import { degrees, narrowEnd } from "../chem/drawing";
import { symmetryClasses } from "../../../../lib/layout/canonical";
import { stereoOf } from "../chem/engineLayout";
import { compared, type Alike, type ConfigurationUnit, type Difference, type Said } from "../../../../lib/chem/perception/stereo/compare";
import { identityInputOf } from "../chem/identityOf";
import { isElementSymbol } from "../../../../lib/roles/molblock";

/** What `model`'s drawing says of configurations, by atom id, as the canvas reads it (chem/engineLayout `stereoOf`). */
export function saidOf(model: Model): Said {
  return stereoOf(model);
}

/**
 * Where two of an atom's groups in `model` are alike, by their classes (lib/layout/canonical `symmetryClasses`, the configurations read
 * with them), its carried H a group too. `said` is what `model` says (`saidOf`): its H's, carried and drawn plain.
 */
function alikeIn(model: Model, said: Said): Alike {
  // (worked out only where it is asked past the first test below: the classes are the whole structure's)
  let full: Alike | null = null;
  const fully = (): Alike => {
    if (full) return full;
    const { input } = identityInputOf(model);
    const classes = symmetryClasses(input);
    const index = new Map(model.atoms.map((a, i) => [a.id, i]));
    const around: number[][] = input.atoms.map(() => []);
    for (const b of input.bonds) {
      around[b.a].push(b.b);
      around[b.b].push(b.a);
    }
    return (full = (at, besides) => {
      const i = index.get(at);
      if (i == null) return false;
      const not = besides == null ? -1 : (index.get(besides) ?? -1);
      const groups = around[i].filter((j) => j !== not).map((j) => classes[j]);
      for (let h = 0; h < (input.atoms[i].hs ?? 0); h++) groups.push(-1);
      return new Set(groups).size < groups.length;
    });
  };
  // (two groups whose first atoms are of different elements are never alike: where an atom's neighbours in the structure are each an
  //  atom of an element, none a label, and no two of one element - its H's, carried or drawn plain, counted as one at most - none of
  //  its groups are alike, and the structure's classes are not asked)
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const apart = (at: number, besides?: number) => {
    const hs = said.hydrogens.get(at) ?? 0;
    if (hs > 1) return false;
    const seen = new Set<string>(hs ? ["H"] : []);
    let count = seen.size;
    for (const b of model.bonds) {
      if (b.hydrogen || b.a === b.b || (b.a !== at && b.b !== at)) continue;
      const n = byId.get(b.a === at ? b.b : b.a);
      if (!n || n.id === besides || said.plain.has(n.id)) continue;
      if (!isElementSymbol(n.el) || n.abbrev) return false;
      seen.add(n.el);
      count++;
    }
    return seen.size === count;
  };
  return (at, besides) => !apart(at, besides) && fully()(at, besides);
}

/**
 * How `product` differs in configuration from `template`, at the
 * template's atoms (lib/chem/perception/stereo/compare `compared`): each
 * unit inverted, opened, closed, or no longer one because two of its
 * groups are now alike. `took` maps each template atom whose undrawn
 * hydrogen a group took to that group's attach atom; every other template
 * atom keeps its id. Empty where every configuration is kept.
 */
export function changesFrom(template: Model, product: Model, took: ReadonlyMap<number, number>): Difference[] {
  const t = templateRead(template);
  const ours = (d: Difference) => (d.kind === "centre" ? t.atoms.has(d.at) : t.atoms.has(d.at[0]) && t.atoms.has(d.at[1]));
  // (a unit closed at the template's atoms only: one a group brings, drawn as the group was given, is the group's)
  const now = saidOf(product);
  return compared(t.said, now, took, { was: t.alike, now: alikeIn(product, now) }).filter((d) => d.how !== "closed" || ours(d));
}

/**
 * A template's reading, once for every product a step makes from it - its
 * atoms, what it says and where its groups are alike - kept by the template
 * itself: a step makes up to 10,000 products of one template, and reading
 * it again for each doubled the run.
 */
const read = new WeakMap<Model, { atoms: ReadonlySet<number>; said: Said; alike: Alike }>();
function templateRead(template: Model): { atoms: ReadonlySet<number>; said: Said; alike: Alike } {
  let found = read.get(template);
  if (!found) {
    const said = saidOf(template);
    found = { atoms: new Set(template.atoms.map((a) => a.id)), said, alike: alikeIn(template, said) };
    read.set(template, found);
  }
  return found;
}

/** The units of `differences` (`changesFrom`) whose configuration is changed: every one but a unit no longer one. */
export function changedOf(differences: readonly Difference[]): ConfigurationUnit[] {
  return differences.filter((d) => d.how !== "alike").map((d): ConfigurationUnit => ({ kind: d.kind, at: d.at }) as ConfigurationUnit);
}

/**
 * The units whose configuration `product` changes from `template`'s -
 * turned, lost, or made up at a template atom (`changesFrom`); a unit that
 * is no longer one, two of its groups alike, is not among them: there is
 * no configuration left there to change.
 */
export function changedAt(template: Model, product: Model, took: ReadonlyMap<number, number>): ConfigurationUnit[] {
  return changedOf(changesFrom(template, product, took));
}

/** A unit as a step's card names it, by the template's atoms: a centre "C3", a double bond "C4=C5", an axis "the axis C4-C5". */
export function unitName(template: Model, u: ConfigurationUnit): string {
  const name = (id: number) => {
    const i = template.atoms.findIndex((a) => a.id === id);
    return `${template.atoms[i].el}${i + 1}`;
  };
  if (u.kind === "centre") return name(u.at);
  const [p, q] = [...u.at].sort((x, y) => template.atoms.findIndex((a) => a.id === x) - template.atoms.findIndex((a) => a.id === y));
  return u.kind === "double" ? `${name(p)}=${name(q)}` : `the axis ${name(p)}-${name(q)}`;
}

/**
 * `product` with no wedge at a centre that is no longer one (`changesFrom`
 * `alike`): it states nothing there, and Meno does not draw a mark it knows
 * states nothing. Unchanged where there is none.
 */
export function alikePlain(template: Model, product: Model, took: ReadonlyMap<number, number>): Model {
  return plainWhereAlike(product, changesFrom(template, product, took));
}

/** `product` with no wedge at a centre `differences` (its `changesFrom`) says is no longer one (`alikePlain`). */
export function plainWhereAlike(product: Model, differences: readonly Difference[]): Model {
  const gone = new Set(differences.flatMap((d) => (d.kind === "centre" && d.how === "alike" ? [d.at] : [])));
  if (!gone.size) return product;
  const degree = degrees(product.bonds);
  return {
    ...product,
    bonds: product.bonds.map((b) => {
      if ((b.stereo !== "up" && b.stereo !== "down") || !gone.has(narrowEnd(b, degree))) return b;
      const { stereo: _s, narrow: _n, ...rest } = b;
      void _s;
      void _n;
      return rest as typeof b;
    }),
  };
}

/**
 * `product` with the centre `c` - a template centre whose undrawn hydrogen
 * a group took - wedged anew so that it says the configuration it had: its
 * own wedges taken off, and one put on a bond out of it, the group's first,
 * then the others in turn, up and then down, until the drawing reads back
 * as the template's (`changedAt` none at `c`). Null where none does.
 */
export function rewedged(template: Model, product: Model, c: number, took: ReadonlyMap<number, number>): Model | null {
  const bonds = product.bonds.filter((b) => b.a === c || b.b === c);
  const group = took.get(c);
  const order = [...bonds.filter((b) => b.a === group || b.b === group), ...bonds.filter((b) => b.a !== group && b.b !== group)];
  const degree = degrees(product.bonds);
  const plain = product.bonds.map((b) => {
    if (!(b.a === c || b.b === c) || (b.stereo !== "up" && b.stereo !== "down")) return b;
    // (a wedge narrow at the other end is that atom's: kept)
    if (narrowEnd(b, degree) !== c) return b;
    const { stereo: _s, narrow: _o, ...rest } = b;
    void _s;
    void _o;
    return rest as Bond;
  });
  for (const b of order) {
    const other = b.a === c ? b.b : b.a;
    // (not on a bond whose other end is a centre: the wedge would say something of it too)
    if (templateRead(template).said.centres.has(other)) continue;
    for (const stereo of ["up", "down"] as const) {
      const tried: Model = { ...product, bonds: plain.map((x) => (x.id === b.id ? { ...x, stereo, narrow: c } : x)) };
      if (!changedAt(template, tried, took).some((u) => u.kind === "centre" && u.at === c)) return tried;
    }
  }
  return null;
}
