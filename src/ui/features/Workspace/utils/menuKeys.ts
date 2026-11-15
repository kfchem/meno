/** Whether an arrow key pressed at `target` moves through a menu's items: not from inside a field of it, where the key is the field's. */
export function arrowMovesMenu(target: EventTarget | null): boolean {
  return (target as { tagName?: string } | null)?.tagName !== "INPUT";
}

/** Whether a wheel turned at `target` closes the menu `menu`: only outside it - a list scrolled inside it (the typefaces') does not. */
export function wheelClosesMenu(target: EventTarget | null, menu: { contains: (other: Node | null) => boolean } | null): boolean {
  return !menu?.contains(target as Node | null);
}
