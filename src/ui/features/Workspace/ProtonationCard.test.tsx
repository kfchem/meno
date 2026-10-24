import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { Molecule3D } from "./store/types";
import { formName, protonationOf } from "./chem/protonate";
import ProtonationCard from "./ProtonationCard";

vi.mock("../../../lib/roles/worker", () => ({ chemWorker: async () => null, chemAtHand: async () => true }));
vi.mock("../../../lib/net/components", () => ({ componentsNamed: async () => null }));

// Vitest runs in Node, with no page to mount on: the card as the server's
// renderer writes it, as it first shows.

/** Glycine without its hydrogens, its orders as given (`bondOrders`) and its charges (`charges`, by atom). */
function glycine(bondOrders: Molecule3D["bondOrders"], charges: Record<number, number> = {}): Molecule3D {
  return {
    id: 1,
    atoms: [
      { el: "N", x: 0, y: 0, z: 0 },
      { el: "C", x: 1.47, y: 0, z: 0 },
      { el: "C", x: 2, y: 1.4, z: 0 },
      { el: "O", x: 1.3, y: 2.4, z: 0 },
      { el: "O", x: 3.3, y: 1.5, z: 0 },
    ].map((a, i) => (charges[i] ? { ...a, charge: charges[i] } : a)),
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 1 },
      { a1: 2, a2: 3, order: 2 },
      { a1: 2, a2: 4, order: 1 },
    ],
    at: { x: 0, y: 0 },
    bondOrders,
  };
}

const card = (m: Molecule3D) => renderToString(<ProtonationCard protonation={protonationOf(m, null)!} onAdd={async () => {}} onCancel={() => {}} onMark={() => {}} />);

describe("the card that asks how a molecule is protonated", () => {
  it("with its orders estimated from distances: every site to choose, and no hydrogens added until each is", () => {
    const html = card(glycine("estimated"));
    expect(html).toContain("How it is protonated");
    expect(html).toContain("Its file does not say how it is protonated: choose each site.");
    expect(html.match(/>Choose…</g)).toHaveLength(2);
    expect(html).toContain("Choose how each site is protonated.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add hydrogens<\/button>/);
    // (each form, to choose from its site's list, by what it is, its charge, and where its hydrogens are)
    const named = protonationOf(glycine("estimated"), null)!.sites.flatMap((s) => s.forms.map(formName));
    expect(named).toContain("Carboxylate (−) - no H");
    expect(named).toContain("Carboxylic acid - H on O4");
    expect(named).toContain("Ammonium (+) - 3 H on N1");
  });

  it("with its orders and charges from a SMILES: started from them, said so, and its charge and spin", () => {
    const html = card(glycine("assigned", { 0: 1, 4: -1 }));
    expect(html).toContain("As the SMILES gives it.");
    expect(html).not.toContain(">Choose…<");
    // (each site showing the form chosen)
    expect(html).toContain("Carboxylate (−) - no H");
    expect(html).toContain("Ammonium (+) - 3 H on N1");
    expect(html).toContain("Charge 0, singlet");
    expect(html).toMatch(/<button[^>]*>Add hydrogens<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Add hydrogens<\/button>/);
  });

  it("with its orders and charges from its own file - a molfile's: started from them, said so", () => {
    expect(card(glycine(undefined, { 0: 1, 4: -1 }))).toContain("As its file gives it.");
  });

  it("with a water on a zinc in its own file - a molfile's single bond: its bond to the metal to choose, and no hydrogens added until it is", () => {
    const aqua: Molecule3D = {
      id: 3,
      atoms: [
        { el: "Zn", x: 0, y: 0, z: 0 },
        { el: "O", x: 2.05, y: 0, z: 0 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 1 }],
      at: { x: 0, y: 0 },
    };
    const html = card(aqua);
    expect(html.match(/>Choose…</g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add hydrogens<\/button>/);
    // (its two forms, each shown on the site's control once chosen - its list, closed, shows only the one)
    const p = protonationOf(aqua, null)!;
    const chosen = (form: number) => renderToString(<ProtonationCard protonation={{ ...p, start: [form] }} onAdd={async () => {}} onCancel={() => {}} onMark={() => {}} />);
    expect(chosen(0)).toContain("Covalent bond to Zn");
    expect(chosen(0)).not.toContain("Dative bond to Zn");
    expect(chosen(1)).toContain("Dative bond to Zn");
  });

  it("with its file's rings aromatic: every site to choose, and said why", () => {
    const imidazole: Molecule3D = {
      id: 2,
      atoms: ["N", "C", "N", "C", "C"].map((el, k) => ({ el, x: Math.cos(1.26 * k), y: Math.sin(1.26 * k), z: 0 })),
      bonds: [0, 1, 2, 3, 4].map((k) => ({ a1: k, a2: (k + 1) % 5, order: 4 })),
      at: { x: 0, y: 0 },
    };
    const html = card(imidazole);
    expect(html).toContain("Its file gives its rings as aromatic, which does not say where their hydrogens are: choose each site.");
    expect(html.match(/>Choose…</g)).toHaveLength(1);
  });
});
