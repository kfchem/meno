import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cardsHoldView, holdingCardOpen, type CardKind } from "./menuCards";

describe("cardsHoldView", () => {
  it("decides every card the Workspace shows over the canvas", () => {
    const source = readFileSync(join(process.cwd(), "src/ui/features/Workspace/Workspace.tsx"), "utf8");
    const start = source.indexOf("function WorkspaceContent(");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("\nfunction ", start + 1);
    const body = source.slice(start, end < 0 ? undefined : end);
    // (a card: something the Workspace keeps in a state of its own, and shows only while it is there)
    const kept = new Set([...body.matchAll(/const \[(\w+), set\w+\] = useState/g)].map((m) => m[1]));
    const shown = new Set([...body.matchAll(/\{(\w+) &&/g)].map((m) => m[1]));
    const cards = [...kept].filter((k) => shown.has(k));
    expect(cards.length).toBeGreaterThan(5);
    const missing = cards.filter((k) => !(k in cardsHoldView));
    expect(missing).toEqual([]);
  });

  it("holds the view while a card that holds it is open, and not for one that does not", () => {
    const none = Object.fromEntries(Object.keys(cardsHoldView).map((k) => [k, null])) as Record<CardKind, unknown>;
    expect(holdingCardOpen(none)).toBe(false);
    expect(holdingCardOpen({ ...none, colourCard: { x: 1 } })).toBe(true);
    expect(holdingCardOpen({ ...none, inkMode: "pen" })).toBe(false);
    expect(holdingCardOpen({ ...none, menu: { kind: "atom" } })).toBe(false);
  });
});
