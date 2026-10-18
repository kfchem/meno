/**
 * A menu's list with its rules as they are drawn (docs/EDITOR-2D.md,
 * *Menus*): a rule marks where a group of what the menu does begins, so it
 * is drawn only between items shown - never first in the list (under the
 * row of icons, or at the menu's top), never two together, never last - and
 * a group left with nothing to show draws nothing. Each menu's builder says
 * where its groups begin (`divider` on a group's first item, whichever of
 * them is there); this is the one place that says which rules are drawn.
 */
export function withRules<T extends { divider?: boolean }>(items: readonly T[]): T[] {
  return items.map((item, i) => (item.divider && i === 0 ? { ...item, divider: false } : item));
}
