/**
 * What a path's frames are, in the words any plugin that works out a path
 * gives them and Meno reads (docs/PLUGINS.md, *Path search* and *Follow the
 * reaction path*): a frames result, `PATH_FRAME`, saying what each frame
 * is - the plugin's own words for each, but for the one frame the step
 * takes as the molecule's entry, which it names in Meno's words: the point
 * a path search refined (`REFINED_SAID`), or the point a reaction path
 * started from (`STARTED_SAID`). That frame is also the one its output
 * marks `converged`. Meno judges none of the frames.
 */

/** The id of the frames result that says what each of a path's frames is. */
export const PATH_FRAME = "path.frame";
/** What a path search's output says of the point on its path it refined: its entry frame. */
export const REFINED_SAID = "highest point refined";
/** What a reaction path's output says of the point it started from: its entry frame. */
export const STARTED_SAID = "the point it started from";
