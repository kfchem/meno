/**
 * What a set around a drawn reaction says of each structure in it
 * (docs/WORKFLOWS.md, *An input: a set from the selection*): its `role` -
 * reactant, product or reagent - and its `reaction`, the number of the arrow
 * it is of, from 1, in the order the set holds its arrows. Worked out from
 * the drawing as it stands, each time it is asked: never kept, so that moving
 * a structure across an arrow changes its role. Which structures are an
 * arrow's is the page's own Atom map rule (chem/atomMap `reactionOf`), only
 * of the structures in the set; what an arrow means, the one rule
 * (lib/chem/reactionScheme `reactionMeant`).
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { arrowEnds, reactionMeant, reactionRoles, wordsLine } from "../../../../lib/chem/reactionScheme";
import type { Property } from "../../../../lib/entry";
import { reactionOf } from "../chem/atomMap";
import type { Arrow, DrawnRecord, Model, Plus, WorkflowSet } from "../store/types";
import { inside, readingOrder, setMembers, type Frame } from "./entries";

/** The role a structure has in a drawn reaction. */
export type SchemeRole = { role: "reactant" | "product" | "reagent"; reaction: number };

/** What a set's drawn reaction says: each structure's role - none where it has none - and what is said of the rest, in words, for the set's count line. */
export type SchemeRead = { roles: (SchemeRole | null)[]; said: string[] };

type SchemePage = { model: Model; arrows?: readonly Arrow[]; pluses?: readonly Plus[] };

/** How near an arrow's words a reagent must stand: in bonds - as near as a reactant must be to the tail (the RXN-file reading rule, `chem/atomMap` `NEAR_BONDS`). */
const REAGENT_BONDS = 5;

type Box = { x0: number; y0: number; x1: number; y1: number };

/** How far a box is from the straight line between `p` and `q`: 0 where the line crosses it. */
function boxFromLine(b: Box, p: { x: number; y: number }, q: { x: number; y: number }): number {
  // (Liang-Barsky: the part of the line inside the box, where there is one)
  let t0 = 0;
  let t1 = 1;
  const clip = (d: number, to: number) => {
    if (d === 0) return to >= 0;
    const t = to / d;
    if (d < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    return t0 <= t1;
  };
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  if (clip(-dx, p.x - b.x0) && clip(dx, b.x1 - p.x) && clip(-dy, p.y - b.y0) && clip(dy, b.y1 - p.y)) return 0;
  const toBox = (r: { x: number; y: number }) => Math.hypot(Math.max(0, b.x0 - r.x, r.x - b.x1), Math.max(0, b.y0 - r.y, r.y - b.y1));
  const len2 = dx * dx + dy * dy;
  const toLine = (r: { x: number; y: number }) => {
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((r.x - p.x) * dx + (r.y - p.y) * dy) / len2)) : 0;
    return Math.hypot(r.x - (p.x + t * dx), r.y - (p.y + t * dy));
  };
  const corners = [
    { x: b.x0, y: b.y0 },
    { x: b.x1, y: b.y0 },
    { x: b.x1, y: b.y1 },
    { x: b.x0, y: b.y1 },
  ];
  return Math.min(toBox(p), toBox(q), ...corners.map(toLine));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How an arrow that means no reaction is said, by how many: "1 arrow crossed out: no reaction". */
function refusedSaid(arrow: Pick<Arrow, "kind" | "heads">, n: number): string {
  if (arrow.kind === "noReaction") return `${plural(n, "arrow", "arrows")} crossed out: no reaction`;
  if (arrow.kind === "retrosynthetic") return `${plural(n, "retrosynthetic arrow")}: draw the reaction forward`;
  if (arrow.heads === 0) return `${plural(n, "line")} with no head: no reaction`;
  return `${plural(n, "two-headed arrow")}: resonance forms, no reaction`;
}

/**
 * What a set's drawn reaction gives each of its `structures` (each its atoms'
 * ids, in the set's order), where `frame` holds an arrow: none where it holds
 * none - the set as it always was, nothing added, nothing said.
 * - an arrow that means a reaction (`reactionMeant`; an equilibrium as drawn)
 *   has its reactants and products as the page's Atom map takes them
 *   (`reactionOf`, only of the set's structures), and the reagents alongside
 *   its words (within `REAGENT_BONDS`);
 * - arrows are numbered from 1 in the order they lie: top to bottom, left to
 *   right;
 * - a structure of two arrows has no role, nor one of none: said;
 * - a salt drawn as its ions is one molecule: each ion has its role, and the
 *   count line counts one.
 */
export function schemeRoles(page: SchemePage, frame: Frame, structures: readonly (readonly number[])[]): SchemeRead | null {
  const arrows = (page.arrows ?? []).filter((a) => inside(frame, a)).sort(readingOrder);
  if (!arrows.length) return null;
  const mine = new Set(structures.flat());
  // (the set's structures alone: a structure outside the frame is no part of its reaction)
  const model = { ...page.model, atoms: page.model.atoms.filter((a) => mine.has(a.id)), bonds: page.model.bonds.filter((b) => mine.has(b.a) && mine.has(b.b)) } as Model;
  const pluses = (page.pluses ?? []).filter((p) => inside(frame, p));
  type Claim = { arrow: number; role: SchemeRole["role"]; group: string };
  const claims = structures.map(() => [] as Claim[]);
  const near = (arrow: Arrow, ids: readonly number[]) => {
    const atoms = model.atoms.filter((a) => ids.includes(a.id));
    const box = { x0: Math.min(...atoms.map((a) => a.x)), x1: Math.max(...atoms.map((a) => a.x)), y0: Math.min(...atoms.map((a) => a.y)), y1: Math.max(...atoms.map((a) => a.y)) };
    const { from, to } = arrowEnds(wordsLine(arrow));
    return boxFromLine(box, from, to) < REAGENT_BONDS * NOMINAL_BOND_LENGTH;
  };
  const refused = new Map<string, { arrow: Arrow; n: number }>();
  let equilibria = 0;
  let reactions = 0;
  // (a structure near an arrow that means no reaction has said so: it is not also "on no arrow")
  const onRefused = new Set<number>();
  const reactionOfArrow = new Map<number, number>();
  arrows.forEach((arrow, k) => {
    const meant = reactionMeant(arrow);
    const { reactants, products } = reactionOf(model, arrow, pluses);
    const group = (ids: readonly number[]) => structures.findIndex((s) => s.some((id) => ids.includes(id)));
    if (meant !== true) {
      for (const ids of [...reactants, ...products]) {
        const i = group(ids);
        if (i >= 0) onRefused.add(i);
      }
      const kind = arrow.kind === "noReaction" ? "noReaction" : arrow.kind === "retrosynthetic" ? "retrosynthetic" : arrow.heads === 0 ? "headless" : "twoHeaded";
      refused.set(kind, { arrow, n: (refused.get(kind)?.n ?? 0) + 1 });
      return;
    }
    const number = ++reactions;
    reactionOfArrow.set(k, number);
    if (arrow.kind === "equilibrium") equilibria++;
    const reagents = reactionRoles(model, arrow, pluses, NOMINAL_BOND_LENGTH).reagents.filter((ids) => near(arrow, ids));
    const taken: [number[][], SchemeRole["role"]][] = [
      [reactants, "reactant"],
      [products, "product"],
      [reagents, "reagent"],
    ];
    for (const [groups, role] of taken)
      groups.forEach((ids, g) => {
        // (each structure of the molecule, an ion each)
        structures.forEach((s, i) => {
          if (s.some((id) => ids.includes(id))) claims[i].push({ arrow: k, role, group: `${k}|${role}|${g}` });
        });
      });
  });
  const said: string[] = [];
  const roles = claims.map((c): SchemeRole | null => {
    if (c.length !== 1) return null;
    return { role: c[0].role, reaction: reactionOfArrow.get(c[0].arrow)! };
  });
  const twice = claims.filter((c) => new Set(c.map((x) => x.arrow)).size > 1).length;
  const none = claims.filter((c, i) => !c.length && !onRefused.has(i)).length;
  // (the molecules by role: a salt's ions one)
  const molecules: Record<SchemeRole["role"], Set<string>> = { reactant: new Set(), product: new Set(), reagent: new Set() };
  const ions: Record<SchemeRole["role"], number> = { reactant: 0, product: 0, reagent: 0 };
  const seen = new Map<string, number>();
  claims.forEach((c, i) => {
    if (!roles[i]) return;
    molecules[c[0].role].add(c[0].group);
    seen.set(c[0].group, (seen.get(c[0].group) ?? 0) + 1);
  });
  for (const [group, n] of seen) if (n > 1) ions[group.split("|")[1] as SchemeRole["role"]] += n;
  const word = (role: SchemeRole["role"], many: string) => {
    const n = molecules[role].size;
    return n ? `${plural(n, role, many)}${ions[role] ? ` (${ions[role]} ions)` : ""}` : null;
  };
  const parts = [word("reactant", "reactants"), word("product", "products"), word("reagent", "reagents")].filter((p): p is string => !!p);
  if (reactions) said.push(`${plural(reactions, "reaction")}${parts.length ? `: ${parts.join(", ")}` : ""}`);
  if (equilibria) said.push(equilibria === 1 ? "an equilibrium, read as drawn" : `${equilibria} equilibria, read as drawn`);
  for (const { arrow, n } of refused.values()) said.push(refusedSaid(arrow, n));
  if (twice) said.push(`${plural(twice, "structure")} on two arrows: draw ${twice === 1 ? "it" : "each"} once for each`);
  if (none) said.push(`${plural(none, "structure")} on no arrow`);
  return { roles, said };
}

/** A role and a reaction as a record's properties (`numberedRecord`'s way): text and number, no unit, worked out. */
const propertiesOf = (r: SchemeRole): Record<string, Property> => ({
  role: { value: r.role, unit: "none", status: "computed" },
  reaction: { value: r.reaction, unit: "none", status: "computed" },
});

/** A set's structures' records, each with its role and reaction where it has them (`schemeRoles`): as they are, where the set holds no arrow. */
export function recordsWithRoles(page: SchemePage, frame: Frame, structures: readonly (readonly number[])[], records: readonly (DrawnRecord | undefined)[]): (DrawnRecord | undefined)[] {
  const read = schemeRoles(page, frame, structures);
  if (!read) return [...records];
  return records.map((r, i) => {
    const role = read.roles[i];
    return role ? { ...r, properties: { ...r?.properties, ...propertiesOf(role) } } : r;
  });
}

/** What a set's drawn reaction adds to its count line: none where it holds no arrow. */
export function schemeSaid(page: SchemePage, set: WorkflowSet): string[] {
  const { structures } = setMembers(page, set);
  return schemeRoles(page, set, structures)?.said ?? [];
}
