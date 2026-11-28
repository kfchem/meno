// Whose a touch is - the page's, or the part of the window it began in - is
// decided by a listener that must be on the window before any other, so that
// what it keeps from the page no other listener hears (pageTouches). It is
// put on here, by the module main.tsx imports first: modules are run in the
// order they are imported, each after what it imports, and pageTouches
// imports nothing, so no other module's code has run yet (touchesFirst.test).
import { ownTouches } from "./ui/features/Workspace/components/pageTouches";

if (typeof window !== "undefined") ownTouches(window, document);
