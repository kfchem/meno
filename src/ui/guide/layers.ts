/**
 * Where the first-run guide lies among the window's layers, and what goes
 * above it: the guide's card and ring over every tab, and over them what
 * the chemist opens over a canvas - its menus, cards and questions
 * (ui/layouts/AboveGuide). Decided (2026-10-14): what one opens goes above
 * the guide, and the guide stays where it is, never dimmed or moved. The
 * window's own questions (closing Meno) stand above both, at 100.
 */
export const GUIDE_LAYER = 90;
export const ABOVE_GUIDE_LAYER = 95;

/**
 * A question asked over the whole window - may it use the network
 * (ui/network/ConsentDialog) - in a layer of the window's own, above what
 * is opened over a canvas: Quick Add, open behind a question asked from it,
 * lies under the question's dimming, never over its words.
 */
export const QUESTION_LAYER = 110;
