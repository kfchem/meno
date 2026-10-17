/**
 * A workspace's styles in 3D (docs/WORKSPACE.md, *Styles in 3D*): what its
 * molecules are drawn in, carried by the workspace as its drawing style is.
 * Fixed as the workspace is made - Settings' primary and secondary then,
 * each whole: a built-in style with what was changed of it, or one of the
 * user's own - and the light they are seen in; changed from its canvas
 * only. So a workspace opens the same on any computer, whatever styles
 * that computer has. How a drag turns a molecule, and how very large
 * drawings are drawn lighter, are the viewer's: they stay in Settings.
 */
import { ELEMENTS } from "./elements";
import { isOwnStyleId } from "./style";
import {
  acceptFields,
  acceptLook3d,
  atomColour,
  LOOK_3D_PRESETS,
  lookOfStyle,
  SCENE_3D,
  SCENE_3D_FIELDS,
  STYLE_NAME_MOST,
  style3dOf,
  styleName3d,
  type MoleculeLook,
  type Own3D,
  type Role3D,
  type Scene3D,
  type Style3D,
  type Style3DChoice,
} from "./style3d";

/** A style as a workspace keeps it: its id (a built-in one's, or one of the user's own, `own-` and a UUID), its name, and the whole of its look. */
export type Kept3D = { id: string; name: string; look: MoleculeLook };

/** What of the scene a workspace carries: what changes the picture - its light, a surface's colours, a ribbon's. */
export const CARRIED_SCENE = ["ambientLight", "keyLight", "shadows", "surfacePlus", "surfaceMinus", "ribbonColours"] as const;
export type CarriedScene = Pick<Scene3D, (typeof CARRIED_SCENE)[number]>;

/** A workspace's styles in 3D: its primary and its secondary, each whole, and its light. */
export type Workspace3D = Record<Role3D, Kept3D> & { scene: CarriedScene };

/** The scene's settings a workspace carries, from a whole scene. */
const carriedOf = (scene: Scene3D): CarriedScene => Object.fromEntries(CARRIED_SCENE.map((k) => [k, scene[k]])) as CarriedScene;

/** A style of `choice` (Settings') as a workspace keeps it: its look as it is set now, whole. */
export function keptOf(choice: Style3DChoice, id: string): Kept3D {
  return { id, name: styleName3d(choice, id), look: lookOfStyle(choice, id) };
}

/** The styles a new workspace is made in: Settings' (`choice`) primary and secondary, and its light, as they are now. */
export function workspace3dOf(choice: Style3DChoice): Workspace3D {
  return { primary: keptOf(choice, choice.primary), secondary: keptOf(choice, choice.secondary), scene: carriedOf(style3dOf(choice)) };
}

/** Meno's own, where nothing else is known: a document only worked on, never shown. */
export const DEFAULT_WORKSPACE_3D: Workspace3D = workspace3dOf({ primary: "balls", secondary: "space", looks: {}, shared: {}, own: [] });

// (one style for one workspace's and one viewer's, so that what is worked out for a look is kept)
const made = new WeakMap<Workspace3D, { viewer: Style3DChoice; style: Style3D }>();

/**
 * The 3D style a workspace's molecules are drawn in: its looks and its
 * light; how they turn, and how a very large drawing is drawn, the
 * viewer's (`viewer`, Settings').
 */
export function style3dIn(ws: Workspace3D, viewer: Style3DChoice): Style3D {
  const was = made.get(ws);
  if (was?.viewer === viewer) return was.style;
  const style: Style3D = { ...SCENE_3D, ...viewer.shared, ...ws.scene, primary: ws.primary.look, secondary: ws.secondary.look };
  made.set(ws, { viewer, style });
  return style;
}

/** The workspace with `role` in `kept` - the other role's style coming to this one's, where it was `kept` (the two swap), as Settings' do. */
export function withRoleIn(ws: Workspace3D, role: Role3D, kept: Kept3D): Workspace3D {
  const other: Role3D = role === "primary" ? "secondary" : "primary";
  if (sameKept(ws[role], kept)) return ws;
  return sameKept(ws[other], kept) ? { ...ws, [role]: ws[other], [other]: ws[role] } : { ...ws, [role]: kept };
}

/** The workspace with one of the light's settings - or a surface's colour, or a ribbon's - set. */
export function withSceneIn<K extends keyof CarriedScene>(ws: Workspace3D, key: K, value: CarriedScene[K]): Workspace3D {
  return ws.scene[key] === value ? ws : { ...ws, scene: { ...ws.scene, [key]: value } };
}

/** Whether two looks are the same, setting by setting - their atoms' colours as they draw them. */
export function sameLook3d(a: MoleculeLook, b: MoleculeLook): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof MoleculeLook>;
  keys.delete("colours");
  if (![...keys].every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))) return false;
  return ELEMENTS.every((e) => atomColour(e.symbol, a).toLowerCase() === atomColour(e.symbol, b).toLowerCase());
}

/** Whether two kept styles are the same: the same id, and the same look. */
const sameKept = (a: Kept3D, b: Kept3D) => a.id === b.id && sameLook3d(a.look, b.look);

/** The id of the card a workspace's style is carried on, where Settings has none like it: its own, set apart from the user's. */
export const carriedId = (role: Role3D) => `workspace-${role}`;

/**
 * The styles a workspace's panel offers (StylePicker3D), as a choice of
 * styles: Settings' (`viewer`) - built in, and the user's own - and,
 * where the workspace carries a style Settings has none like (made on
 * another computer, or changed in Settings since), that one, as the
 * workspace carries it, a card of its own (`carried`). The primary and the
 * secondary are the cards of the workspace's two.
 */
export function workspaceCards(ws: Workspace3D, viewer: Style3DChoice): { choice: Style3DChoice; carried: Set<string> } {
  const carried = new Set<string>();
  const extra: Own3D[] = [];
  const known = (k: Kept3D) => (LOOK_3D_PRESETS.some((p) => p.id === k.id) || viewer.own.some((o) => o.id === k.id)) && sameLook3d(lookOfStyle(viewer, k.id), k.look);
  const cardOf = (role: Role3D): string => {
    const k = ws[role];
    if (known(k)) return k.id;
    // (the two the same style, carried: one card)
    const other: Role3D = role === "primary" ? "secondary" : "primary";
    if (role === "secondary" && sameKept(ws[other], k) && !known(ws[other])) return carriedId(other);
    const id = carriedId(role);
    carried.add(id);
    extra.push({ id, name: k.name, look: k.look });
    return id;
  };
  const primary = cardOf("primary");
  const secondary = cardOf("secondary");
  return { choice: { ...viewer, primary, secondary, own: [...viewer.own, ...extra] }, carried };
}

/** The style a card of `workspaceCards` stands for, as the workspace would keep it: a carried one's id its own again. */
export function keptOfCard(ws: Workspace3D, cards: Style3DChoice, card: string): Kept3D {
  if (card === carriedId("primary")) return ws.primary;
  if (card === carriedId("secondary")) return ws.secondary;
  return keptOf(cards, card);
}

/**
 * What a change made on a workspace's cards (`workspaceCards`) comes to:
 * a style given a role, or the two swapped - the workspace's, as that
 * style is now, whole; one duplicated or renamed - Settings' own styles,
 * never the workspace's carried ones. Each as it was where nothing changed.
 */
export function fromCards(ws: Workspace3D, viewer: Style3DChoice, next: Style3DChoice): { ws: Workspace3D; viewer: Style3DChoice } {
  const { choice: cards, carried } = workspaceCards(ws, viewer);
  let w = ws;
  if (next.primary !== cards.primary) w = withRoleIn(w, "primary", keptOfCard(ws, next, next.primary));
  if (next.secondary !== cards.secondary) w = withRoleIn(w, "secondary", keptOfCard(ws, next, next.secondary));
  const own = next.own.filter((o) => !carried.has(o.id));
  const same = own.length === viewer.own.length && own.every((o, i) => o === viewer.own[i]);
  return { ws: w, viewer: same ? viewer : { ...viewer, own } };
}

/** A workspace's styles in 3D as its file holds them; none, where they do not read - the file opens in Settings'. */
export function acceptWorkspace3d(raw: unknown): Workspace3D | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const kept = (v: unknown): Kept3D | null => {
    if (typeof v !== "object" || v === null) return null;
    const { id, name, look } = v as Record<string, unknown>;
    if (typeof id !== "string" || !(isOwnStyleId(id) || LOOK_3D_PRESETS.some((p) => p.id === id))) return null;
    const n = typeof name === "string" ? name.trim() : "";
    if (!n || n.length > STYLE_NAME_MOST) return null;
    return { id, name: n, look: acceptLook3d(look) };
  };
  const primary = kept(r.primary);
  const secondary = kept(r.secondary);
  if (!primary || !secondary) return null;
  const read = acceptFields(r.scene, SCENE_3D_FIELDS.filter((f) => (CARRIED_SCENE as readonly string[]).includes(f.key)));
  return { primary, secondary, scene: { ...carriedOf(SCENE_3D), ...(read as Partial<CarriedScene>) } };
}

/** A colour `t` of the way from `a` to `b`, #rrggbb. */
function mixHex(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((x >> s) & 255) + (((y >> s) & 255) - ((x >> s) & 255)) * t);
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, "0")}`;
}

/** A look `t` of the way from `a` to `b`: each number and colour between the two - its atoms' too - and the rest `b`'s at once. */
export function mixLook3d(a: MoleculeLook, b: MoleculeLook, t: number): MoleculeLook {
  if (t >= 1 || a === b) return b;
  const out: Record<string, unknown> = { ...b };
  for (const [key, to] of Object.entries(b)) {
    const from = (a as Record<string, unknown>)[key];
    if (typeof to === "number" && typeof from === "number") out[key] = from + (to - from) * t;
    else if (typeof to === "string" && typeof from === "string" && /^#[0-9a-f]{6}$/i.test(to) && /^#[0-9a-f]{6}$/i.test(from)) out[key] = mixHex(from, to, t);
  }
  const colours: Record<string, string> = {};
  for (const e of ELEMENTS) {
    const from = atomColour(e.symbol, a);
    const to = atomColour(e.symbol, b);
    colours[e.symbol] = from.toLowerCase() === to.toLowerCase() ? to : mixHex(from, to, t);
  }
  out.colours = colours;
  return out as MoleculeLook;
}

/** A 3D style `t` of the way from `a` to `b`: its looks and its light's numbers and colours between, the rest `b`'s. */
export function mixStyle3d(a: Style3D, b: Style3D, t: number): Style3D {
  if (t >= 1) return b;
  const out: Record<string, unknown> = { ...b, primary: mixLook3d(a.primary, b.primary, t), secondary: mixLook3d(a.secondary, b.secondary, t) };
  for (const key of CARRIED_SCENE) {
    const from = a[key];
    const to = b[key];
    if (typeof to === "number" && typeof from === "number") out[key] = from + (to - from) * t;
    else if (typeof to === "string" && typeof from === "string" && /^#[0-9a-f]{6}$/i.test(to) && /^#[0-9a-f]{6}$/i.test(from)) out[key] = mixHex(from, to, t);
  }
  return out as Style3D;
}
