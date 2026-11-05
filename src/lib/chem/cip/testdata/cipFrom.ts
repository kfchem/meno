import type { IdentityInput } from "../../identity";
import { kekuleOrders } from "../../kekulize";
import { implicitHydrogens } from "../../molecule";
import { readSmiles } from "../../smiles";
import { cipLabels } from "../index";

/** A structure as its SMILES gives it, for the CIP: its bonds Kekulé as written, each atom's H, charge and mass number, each centre's and double bond's configuration. */
export function cipInput(smiles: string): IdentityInput {
  const s = readSmiles(smiles);
  const orders = kekuleOrders(s.atoms, s.bonds);
  const sum = s.atoms.map(() => 0);
  s.bonds.forEach((b, i) => {
    sum[b.a1] += orders[i];
    sum[b.a2] += orders[i];
  });
  return {
    atoms: s.atoms.map((a, i) => ({
      el: a.el,
      hs: a.hs ?? implicitHydrogens(a.el, sum[i], a.charge ?? 0),
      ...(a.charge ? { charge: a.charge } : {}),
      ...(a.isotope ? { isotope: a.isotope } : {}),
      ...(a.tetra ? { tetra: a.tetra } : {}),
    })),
    bonds: s.bonds.map((b, i) => ({
      a: b.a1,
      b: b.a2,
      order: orders[i],
      ...(b.cisTrans ? { stereo: b.cisTrans } : {}),
    })),
  };
}

/** What the CIP says of each configured centre and double bond, as "C3:R", "C3:r", "C1=C2:Z", "C1=C2:Z turns" (seqCis) or "C3:alike": by element and atom index. */
export function cipSaid(input: IdentityInput): string[] {
  const { centres, bonds } = cipLabels(input);
  const said = (x: { label: string; turns?: true } | { why: string }) => ("label" in x ? x.label + (x.turns ? " turns" : "") : x.why);
  const el = (a: number) => `${input.atoms[a].el}${a}`;
  return [...[...centres].map(([a, x]) => `${el(a)}:${said(x)}`), ...[...bonds].map(([i, x]) => `${el(input.bonds[i].a)}=${el(input.bonds[i].b)}:${said(x)}`)];
}

/** `cipSaid` of a SMILES. */
export const cipOf = (smiles: string): string[] => cipSaid(cipInput(smiles));
