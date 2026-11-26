/**
 * Every card the canvas shows, by the name the Workspace keeps it under, and
 * whether it holds the view a menu moved for (menuRoom): one a menu's row
 * opens where the menu was holds it, so that the view goes back only once
 * the last of them has shut. Each is decided here: a card the Workspace
 * shows that is missing from this list fails its test (menuCards.test.ts),
 * and the Workspace reads every one of them by its type.
 */
export const cardsHoldView = {
  ask3d: true,
  colourCard: true,
  coords: true,
  cornersCard: true,
  exporting: true,
  givingOrders: true,
  naming: true,
  pdfCard: true,
  protonating: true,
  rendering: true,
  // (the pen's mode: not a card where a menu was - it is the chemist's for as long as they write)
  inkMode: false,
  // (a menu holds the view itself, as it stands: useMenuAt)
  menu: false,
} as const satisfies Record<string, boolean>;

export type CardKind = keyof typeof cardsHoldView;

/** Whether any card that holds the view is open, `cards` being what the Workspace keeps under each name. */
export function holdingCardOpen(cards: Record<CardKind, unknown>): boolean {
  return (Object.keys(cardsHoldView) as CardKind[]).some((k) => cardsHoldView[k] && !!cards[k]);
}
