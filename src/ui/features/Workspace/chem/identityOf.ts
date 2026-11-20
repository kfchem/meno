/**
 * A structure drawn, as identity reads it (lib/chem/identity): every atom
 * drawn - its element, charge, mass number, unpaired electrons, mapping to
 * a reaction's atom, and its hydrogens not drawn - every bond of the structure (a hydrogen bond is none), and the
 * configurations the drawing shows, read as Clean-up reads them
 * (lib/layout/drawn `readStereo`). No hydrogen is folded in here: identity
 * does that, by its own rule (`hydrogensFolded`).
 */
import { identity, identityText, type IdentityGroup, type IdentityInput } from "../../../../lib/chem/identity";
import { earlierPicture, pairingDrawn, pairsDrawnAcross, pairsOf } from "../../../../lib/chem/arrangement";
import { isMetal, squarePlanarMetal, type Arranged } from "../../../../lib/layout/perceive";
import { valencesAt } from "../../../../lib/chem/molecule";
import { ARRANGED, arrangementAs } from "../utils/arrangement";
import { readStereo } from "../../../../lib/layout/drawn";
import { saidOf } from "../../../../lib/chem/perception/stereo/compare";
import { keepsAny, keptAsDrawn, keptReading } from "../configuration/kept";
import { recognisedSaid } from "../../../../lib/chem/perception/projection/depth";
import { cageViews } from "../../../../lib/layout/recognised";
import type { Model } from "../store/types";
import { drawingOf, readAs } from "./drawing";
import { ofTheStructure } from "../../../../lib/chem/perception/graph";
import { piSystems, unreadWedges } from "./engineLayout";
import { placedAbbreviation } from "../../../../lib/chem/abbreviationPlace";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { isElementSymbol } from "../../../../lib/roles/molblock";

/**
 * `part` as identity's input, its atoms in `part`'s order - and the atoms,
 * by id, whose wedges say nothing that can be read (drawn crossed, or at an
 * atom of three bonds that keeps no configuration of its own,
 * lib/chem/lonePairCentres), so whose configuration the input does not
 * hold - and, for each of the drawing's bonds by its place, its place among
 * the input's bonds: -1 for a hydrogen bond, which the input leaves out -
 * and, by the atom's place, what the reading of a ring drawn in
 * perspective with no depth says of it (lib/chem/perception/projection/depth
 * `recognisedSaid`): read from the ring, read as a Haworth ring, or why not.
 */
export function identityInputOf(part: Model): { input: IdentityInput; unread: number[]; bondAt: number[]; perspective: ReadonlyMap<number, string> } {
  const drawing = drawingOf(part);
  // (what the drawing keeps, where it keeps any - part 15, phase 3: the configuration as kept, not read again from its marks - else what
  //  its marks say: configuration/kept)
  const read = readStereo(drawing.atoms, drawing.bonds);
  const stereo = keepsAny(part) ? keptAsDrawn(part, drawing, keptReading(part, saidOf(drawing.atoms, drawing.bonds, part.atoms.map((a) => a.id), () => false, read)).said) : read;
  const pi = piSystems(part, drawing);
  const input: IdentityInput = {
    atoms: part.atoms.map((a, i) => {
      const t = stereo.tetra.get(i);
      return {
        el: readAs(a),
        ...(a.charge ? { charge: a.charge } : {}),
        ...(a.isotope ? { isotope: a.isotope } : {}),
        ...(a.radical ? { radical: a.radical } : {}),
        ...(a.map ? { mapped: true as const } : {}),
        hs: drawing.atoms[i].hs,
        ...(t ? { tetra: t } : {}),
        ...(pi.has(i) ? { pi: pi.get(i)! } : {}),
      };
    }),
    // (the structure's bonds: a hydrogen bond is none, so two molecules it joins are two parts - each bond's cis or trans taken by its
    //  place in the drawing, before those are left out)
    bonds: drawing.bonds.flatMap((b, k) => {
      if (!ofTheStructure(b)) return [];
      const ct = stereo.cisTrans.get(k);
      return [{ a: b.a, b: b.b, order: b.order, ...(ct ? { stereo: { refs: ct.refs, cis: ct.cis } } : {}) }];
    }),
    ...(stereo.axes.length ? { axes: stereo.axes.map((x) => ({ atoms: x.atoms, refs: x.refs, sense: x.sense })) } : {}),
    ...(stereo.cumulated.length ? { cumulated: stereo.cumulated.map((x) => ({ atoms: x.atoms, refs: x.refs, cis: x.cis })) } : {}),
  };
  let kept = 0;
  const bondAt = drawing.bonds.map((b) => (ofTheStructure(b) ? kept++ : -1));
  // (a metal drawn in the earlier picture - two lines and two side by side: read where every way of reading it is one structure)
  const oneOf = (metal: number, ways: readonly Arranged["pairs"][]): Arranged["pairs"] | null => {
    const others = arrangementsDrawn(drawing, part).filter((x) => x.metal !== metal);
    const texts = new Set(ways.map((pairs) => identityText({ ...input, arrangements: [...others, { metal, pairs }] })));
    return texts.size === 1 ? ways[0] : null;
  };
  const arrangements = arrangementsDrawn(drawing, part, oneOf);
  return { input: arrangements.length ? { ...input, arrangements } : input, unread: unreadWedges(drawing, read).map((i) => part.atoms[i].id), bondAt, perspective: recognisedSaid(drawing.atoms, drawing.bonds, cageViews) };
}

/** A structure drawn's identity (lib/chem `identity`), its AND and OR groups with it (`withGroups`), and the atoms whose wedges it could not read (`identityInputOf`). */
export function identityOfDrawn(part: Model): { text: string; complete: boolean; unread: number[] } {
  const { input, unread } = identityInputOf(part);
  return { ...identity(withGroups(input, part)), unread };
}

/**
 * `input`, identity's input of `part` (`identityInputOf`, its atoms in `part`'s order), with the AND and OR groups `part`'s
 * centres are drawn in (lib/chem/identity `IdentityGroup`): for what says whether two structures drawn are the same structure
 * (*Same as* in Enumerate and Substituents, a record's key, a search for the same compound). Not for what gives a structure one
 * configuration - a stereoisomer made, its mirror image - whose configuration is the whole of it. `input` itself where none is.
 */
export function withGroups(input: IdentityInput, part: Model): IdentityInput {
  const groups = new Map<string, IdentityGroup & { atoms: number[] }>();
  part.atoms.forEach((a, i) => {
    const g = a.stereoGroup;
    if (!g || g.kind === "abs") return;
    const name = `${g.kind}${g.n ?? 1}`;
    const into = groups.get(name) ?? { kind: g.kind, atoms: [] };
    into.atoms.push(i);
    groups.set(name, into);
  });
  return groups.size ? { ...input, groups: [...groups.values()] } : input;
}

/**
 * `part` with each label that stands for atoms drawn out as those atoms -
 * those it holds (`abbrev`, as Clean-up writes a group by its label), else
 * the dictionary's - the labelled atom become the one it is attached by,
 * where the label is: so the structure as identity reads it whether a group
 * is written by its label or drawn out. Not laid out among the drawing, as
 * *Expand abbreviation* lays it out: only what each configuration says is
 * read from where atoms are, and turned whole a group's say the same. A
 * label Meno does not know stays as it is.
 */
export function labelsDrawnOut(part: Model): Model {
  if (!part.atoms.some((a) => a.abbrev || !isElementSymbol(a.el))) return part;
  let next = -1;
  const atoms: Model["atoms"] = [];
  const bonds: Model["bonds"] = [...part.bonds];
  for (const a of part.atoms) {
    const bond = a.abbrev ? undefined : part.bonds.find((b) => b.a === a.id || b.b === a.id);
    const other = bond && part.atoms.find((x) => x.id === (bond.a === a.id ? bond.b : bond.a));
    const s = a.abbrev ?? (isElementSymbol(a.el) ? null : placedAbbreviation(a.el, other ? { x: other.x - a.x, y: other.y - a.y } : null, NOMINAL_BOND_LENGTH));
    if (!s?.atoms.length) {
      atoms.push(a);
      continue;
    }
    const head = s.attach[0] ?? 0;
    const ids = s.atoms.map((_, k) => (k === head ? a.id : next--));
    s.atoms.forEach(({ x, y, ...chem }, k) => atoms.push({ ...chem, id: ids[k], x: a.x + x, y: a.y + y, r: a.r }));
    for (const b of s.bonds) {
      const { a1, a2, endpoints, narrow, ...rest } = b;
      bonds.push({ ...rest, id: next--, a: ids[a1], b: ids[a2], stereo: b.stereo ?? "none", ...(narrow != null ? { narrow: ids[narrow] } : {}), ...(endpoints ? { endpoints: endpoints.map((e) => ids[e]) } : {}) } as Model["bonds"][number]);
    }
  }
  return { atoms, bonds };
}

/**
 * How far, in degrees, each of a four-donor metal's bonds may lie from a diagonal of the page for the X to be read, and from
 * the page's axes for the upright cross (`arrangementsDrawn`): half of the 45 between them, so that every drawing nearer the
 * diagonals is the X and every one nearer the axes the cross - none falls between.
 */
const X_SLACK = 22.5;

/**
 * Which of each metal's donors the drawing has across from each other
 * (lib/chem/arrangement `pairingDrawn`): a metal of six, however drawn
 * (Brecher 2006, ST-2.11: three lines, plain or with wedges); a metal of
 * four only where the drawing states it square planar - as the X, each
 * bond within `X_SLACK` degrees of a diagonal of the page, or in ST-2.6's
 * wedge form, two bonds wedged and two hashed, each narrow at the metal -
 * or where it is surely square planar (lib/layout/perceive
 * `squarePlanarMetal`: Pt(II), Pd(II), Au(III), Rh(I), Ir(I)) and drawn as
 * the upright cross (ST-2.6's acceptable form) by the chemist: not still
 * marked "Which donors are next to each other is not given", as Meno lays
 * one out where nothing gave its arrangement. Any other upright cross
 * states no geometry, and is read as none; so is any metal still carrying
 * that mark, of four donors or six. None where the drawing does not say
 * which pairing.
 */
export function arrangementsDrawn(
  drawing: ReturnType<typeof drawingOf>,
  part?: Model,
  oneOf?: (metal: number, ways: readonly Arranged["pairs"][]) => Arranged["pairs"] | null,
): Arranged[] {
  const around: number[][] = drawing.atoms.map(() => []);
  // (a hydrogen bond drawn to the metal is no donor: it takes no place round an atom)
  for (const b of drawing.bonds) {
    if (!ofTheStructure(b)) continue;
    around[b.a].push(b.b);
    around[b.b].push(b.a);
  }
  const out: Arranged[] = [];
  drawing.atoms.forEach((a, m) => {
    const donors = around[m];
    if (!isMetal(a.el ?? "") || (donors.length !== 4 && donors.length !== 6) || a.hs) return;
    if (donors.some((d) => Math.hypot(drawing.atoms[d].x - a.x, drawing.atoms[d].y - a.y) < 1e-6)) return;
    const angle = donors.map((d) => Math.atan2(drawing.atoms[d].y - a.y, drawing.atoms[d].x - a.x));
    // (one Meno laid out with nothing given, still marked so: none, however drawn - four donors or six)
    if (part && marked(part, m)) return;
    if (donors.length === 4 && !squarePlanarDrawn(drawing, m, angle) && !(part && crossDrawn(angle) && surelySquare(drawing, m, around)) && !(part && bridgedSquare(drawing, m, around))) return;
    // (a pairing whose every pair is drawn across - none of six side by side - as Clean-up reads it)
    const partner = pairingDrawn(angle);
    if (partner && pairsDrawnAcross(angle, partner)) return void out.push({ metal: m, pairs: pairsOf(donors, partner) });
    // (six donors in the earlier picture: one structure however it is read, or none - `oneOf`, where the whole structure is at hand)
    const ways = donors.length === 6 && oneOf ? earlierPicture(angle) : null;
    const chosen = ways && oneOf!(m, ways.map((w) => pairsOf(donors, w)));
    if (chosen) out.push({ metal: m, pairs: chosen });
  });
  return out;
}

/** Whether a four-donor metal `m`, its bonds at `angle`, is drawn as ST-2.6 draws a square-planar centre: the X, or two wedges and two hashes narrow at it. */
function squarePlanarDrawn(drawing: ReturnType<typeof drawingOf>, m: number, angle: readonly number[]): boolean {
  const offDiagonal = (t: number) => {
    const q = (((t % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)) - Math.PI / 4;
    return (Math.abs(q) * 180) / Math.PI;
  };
  if (angle.every((t) => offDiagonal(t) < X_SLACK)) return true;
  const wedges = drawing.bonds.filter((b) => (b.a === m || b.b === m) && b.wedge?.narrow === m).map((b) => b.wedge!.stereo);
  return wedges.length === 4 && wedges.filter((w) => w === "up").length === 2;
}

/** Whether a four-donor metal's bonds, at `angle`, are the upright cross: each within `X_SLACK` degrees of the page's axes. */
function crossDrawn(angle: readonly number[]): boolean {
  return angle.every((t) => {
    const q = (((t % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2));
    return (Math.min(q, Math.PI / 2 - q) * 180) / Math.PI <= X_SLACK;
  });
}

/**
 * Whether four-donor metal `m` is held to another metal by bridges - its donors joined only through that other metal, none a
 * chelate's - and is surely square planar: [Pt2Cl4(NH3)2]'s Pt. The layout sets such a pair out as a diamond whose bonds lie
 * neither on the X nor on the upright cross; its pairs are read as drawn all the same (`pairingDrawn` - none where tied), so that
 * Clean-up leaves cis and trans what they were (found in the chemistry check).
 */
function bridgedSquare(drawing: ReturnType<typeof drawingOf>, m: number, around: readonly number[][]): boolean {
  const donors = around[m];
  const isM = (j: number) => isMetal(drawing.atoms[j].el ?? "");
  // (from each donor, through any atom but this metal: reaching another donor only by way of another metal is a bridge; otherwise a chelate)
  const joined = (through: boolean) => {
    const reached = new Set([donors[0]]);
    for (const todo = [donors[0]]; todo.length; ) {
      for (const w of around[todo.pop()!]) {
        if (w === m || reached.has(w) || (!through && isM(w))) continue;
        reached.add(w);
        todo.push(w);
      }
    }
    return donors.slice(1).some((d) => reached.has(d));
  };
  return joined(true) && !joined(false) && surelySquare(drawing, m, around, true);
}

/** Whether metal `m` is surely square planar as the drawing makes it (lib/layout/perceive `squarePlanarMetal`); `bridged`, asked of a metal whose donors are joined through another. */
function surelySquare(drawing: ReturnType<typeof drawingOf>, m: number, around: readonly number[][], bridged = false): boolean {
  const order = new Map(drawing.bonds.map((b) => [b.a < b.b ? `${b.a},${b.b}` : `${b.b},${b.a}`, b.order]));
  const sq = squarePlanarMetal(
    {
      el: (j) => drawing.atoms[j].el ?? "",
      charge: (j) => drawing.atoms[j].charge ?? 0,
      hs: (j) => drawing.atoms[j].hs ?? 0,
      neighbours: (j) => around[j],
      order: (p, q) => order.get(p < q ? `${p},${q}` : `${q},${p}`) ?? 1,
    },
    m,
    (el, charge) => valencesAt(el, charge)[0],
    bridged,
  );
  return !!sq?.sure;
}

/** Whether atom `m` of `part` still carries the mark Meno puts on an arrangement nobody gave (utils/arrangement): moved round since, it is the chemist's. */
function marked(part: Model, m: number): boolean {
  const a = part.atoms[m];
  return !!a?.unsure && a.unsure.as.startsWith(ARRANGED) && a.unsure.as === arrangementAs(a, part.atoms, part.bonds);
}

