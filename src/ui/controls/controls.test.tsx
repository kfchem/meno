import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Checkbox from "./Checkbox";
import { answersEnter, checkboxKey, escapeLeft, listKey, nextChoice, nextLit, opensList, type Pressed } from "./keys";
import { EDGE, GAP, LIST_MOST_HEIGHT, placeList, pressedAway, rowsShown } from "./place";
import RadioGroup from "./Radio";
import Select from "./Select";

// Vitest runs in Node, with no page to mount on: the controls as the server's
// renderer writes them, as they first show, and what they do with a key or a
// press - by the same functions their handlers call - on their own.

/** A key pressed, and what was done with it: kept from the browser, kept from those behind. */
function pressed(key: string, target: unknown = null) {
  const e = {
    key,
    target,
    defaultPrevented: false,
    stopped: false,
    preventDefault() {
      e.defaultPrevented = true;
    },
    stopPropagation() {
      e.stopped = true;
    },
  };
  return e satisfies Pressed;
}

/** A key pressed on the first of these handlers, going on to each after it, as the page passes it out, until one keeps it. */
function bubbled<E extends ReturnType<typeof pressed>>(e: E, ...handlers: ((e: E) => void)[]): E {
  for (const h of handlers) {
    h(e);
    if (e.stopped) break;
  }
  return e;
}

/** An open list's keys (listKey), each thing it does written down. */
function inList(lit = 1) {
  const did: string[] = [];
  const does = { close: (back: boolean) => did.push(`close${back ? ", focus back" : ""}`), choose: (i: number) => did.push(`choose ${i}`), light: (i: number) => did.push(`light ${i}`) };
  return { did, handler: (e: Pressed) => listKey(e, lit, LOOKS.map((o) => o.label), does) };
}

const LOOKS = [
  { value: "sticks", label: "Sticks" },
  { value: "balls", label: "Balls and sticks" },
  { value: "space", label: "Space-filling" },
  { value: "studio", label: "Studio" },
];

describe("the keys in an open list (Select)", () => {
  it("go a row up or down, held at the ends, and to the first or last", () => {
    const labels = LOOKS.map((o) => o.label);
    expect(nextLit("ArrowDown", 0, labels)).toBe(1);
    expect(nextLit("ArrowDown", 3, labels)).toBe(3);
    expect(nextLit("ArrowUp", 0, labels)).toBe(0);
    expect(nextLit("End", 1, labels)).toBe(3);
    expect(nextLit("Home", 2, labels)).toBe(0);
  });

  it("go by a letter to the next name it begins, round from the start, and nowhere for another key", () => {
    const labels = LOOKS.map((o) => o.label);
    expect(nextLit("s", 0, labels)).toBe(2);
    expect(nextLit("S", 2, labels)).toBe(3);
    expect(nextLit("s", 3, labels)).toBe(0);
    expect(nextLit("x", 1, labels)).toBe(null);
    expect(nextLit("Shift", 1, labels)).toBe(null);
    expect(nextLit("ArrowDown", 0, [])).toBe(null);
  });
});

describe("a key in an open list (Select), and on its button", () => {
  it("Escape closes it, focus back on its button, and goes no further", () => {
    const list = inList();
    const e = bubbled(pressed("Escape"), list.handler);
    expect(list.did).toEqual(["close, focus back"]);
    expect(e.defaultPrevented).toBe(true);
    expect(e.stopped).toBe(true);
  });

  it("Escape closing a list in the protonation card does not let the card go with what was chosen in it; an Escape elsewhere does", () => {
    // (the card's own Escape, on the window, as ProtonationCard has it)
    let cancelled = 0;
    const card = (e: Pressed) => {
      if (escapeLeft(e)) cancelled++;
    };
    const list = inList();
    bubbled(pressed("Escape"), list.handler, card);
    expect(list.did).toEqual(["close, focus back"]);
    expect(cancelled).toBe(0);
    // (and were it to come to the card all the same - a handler on the way catching it first - the card leaves one a list has had)
    const had = pressed("Escape");
    list.handler(had);
    card({ ...had, stopPropagation: () => {} });
    expect(cancelled).toBe(0);
    bubbled(pressed("Escape"), card);
    expect(cancelled).toBe(1);
  });

  it("Enter or Space chooses the lit row; an arrow, End or a letter lights another; each goes no further", () => {
    for (const [key, done] of [
      ["Enter", "choose 1"],
      [" ", "choose 1"],
      ["ArrowDown", "light 2"],
      ["End", "light 3"],
      ["s", "light 2"],
    ] as const) {
      const list = inList();
      const e = bubbled(pressed(key), list.handler);
      expect([key, list.did, e.defaultPrevented, e.stopped]).toEqual([key, [done], true, true]);
    }
  });

  it("Tab closes it, focus back on its button, and is left to go on from there", () => {
    const list = inList();
    const e = bubbled(pressed("Tab"), list.handler);
    expect(list.did).toEqual(["close, focus back"]);
    expect(e.defaultPrevented).toBe(false);
    expect(e.stopped).toBe(false);
  });

  it("a key it does not answer does nothing and goes on", () => {
    const list = inList();
    const e = bubbled(pressed("x"), list.handler);
    expect(list.did).toEqual([]);
    expect([e.defaultPrevented, e.stopped]).toEqual([false, false]);
  });

  it("its button opens it by Enter, Space or an arrow, and by no other key", () => {
    expect(["Enter", " ", "ArrowDown", "ArrowUp"].map(opensList)).toEqual([true, true, true, true]);
    expect(["Escape", "Tab", "a", "ArrowLeft"].some(opensList)).toBe(false);
  });

  it("a press closes it away from both the list and its button, not in either", () => {
    const node = (inside: unknown[]) => ({ contains: (n: unknown) => inside.includes(n) });
    const list = node(["row"]);
    const button = node(["chevron"]);
    expect(pressedAway("row", [list, button])).toBe(false);
    expect(pressedAway("chevron", [list, button])).toBe(false);
    expect(pressedAway("canvas", [list, button])).toBe(true);
    expect(pressedAway("canvas", [null, undefined])).toBe(true);
  });
});

describe("where an open list goes (placeList)", () => {
  const window = { width: 800, height: 600 };
  const button = (left: number, top: number) => ({ left, top, bottom: top + 28, width: 120, height: 28 });

  it("under its button, as wide at least, its left edge with the button's", () => {
    expect(placeList(button(100, 100), { width: 200, height: 160 }, window)).toEqual({ left: 100, top: 128 + GAP, minWidth: 120 });
  });

  it("above it where the window has no room below and has above", () => {
    expect(placeList(button(100, 500), { width: 200, height: 160 }, window).top).toBe(500 - GAP - 160);
  });

  it("under it still where there is room on neither side", () => {
    expect(placeList(button(100, 100), { width: 200, height: 560 }, window).top).toBe(128 + GAP);
  });

  it("never past the window's sides", () => {
    expect(placeList(button(700, 100), { width: 200, height: 160 }, window).left).toBe(800 - 200 - EDGE);
    expect(placeList(button(-20, 100), { width: 200, height: 160 }, window).left).toBe(EDGE);
  });
});

describe("how tall an open list is (Select)", () => {
  it("shows nine rows whole - one of nine never cut and scrolled by its padding - and past nine, half the tenth", () => {
    expect(rowsShown(9)).toBe(9);
    expect(rowsShown(10)).toBe(9.5);
    expect(rowsShown(30)).toBe(9.5);
    expect(rowsShown(3)).toBe(3);
    // (its rows 2rem each, its padding and the line round it, at nine and a half rows)
    expect(LIST_MOST_HEIGHT).toBe("calc(9.5 * 2rem + 0.5rem + 2px)");
  });

  it("is held to that, and to no fixed height that cuts a row of nine", () => {
    const select = readFileSync(join(__dirname, "Select.tsx"), "utf8");
    expect(select).toMatch(/maxHeight: LIST_MOST_HEIGHT/);
    expect(select).not.toMatch(/max-h-/);
  });
});

describe("Enter on a checkbox", () => {
  const box = { tagName: "BUTTON", getAttribute: (n: string) => (n === "role" ? "checkbox" : null) };

  it("does not turn it, as the browser's own does not; Space does", () => {
    const enter = pressed("Enter", box);
    checkboxKey(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(enter.stopped).toBe(false);
    const space = pressed(" ", box);
    checkboxKey(space);
    expect(space.defaultPrevented).toBe(false);
  });

  it("on hiding hydrogens' 'I know' box, keeps the hydrogens and leaves the box unticked; on a button, is that button's", () => {
    // (the question's own Enter, on its box, as HideHydrogensAsk has it)
    let kept = 0;
    const question = (e: Pressed & { target: unknown }) => {
      if (e.key === "Enter" && !answersEnter(e.target as EventTarget)) kept++;
    };
    const e = bubbled(pressed("Enter", box), checkboxKey, question);
    // (its default - the button's click, which would tick it - not done)
    expect(e.defaultPrevented).toBe(true);
    expect(kept).toBe(1);
    bubbled(pressed("Enter", { tagName: "BUTTON", getAttribute: () => null }), checkboxKey, question);
    expect(kept).toBe(1);
    bubbled(pressed("Enter", { tagName: "P", getAttribute: () => null }), checkboxKey, question);
    expect(kept).toBe(2);
  });
});

describe("the arrows in a radio group", () => {
  it("go to the next or the one before, round from the ends", () => {
    expect(nextChoice("ArrowDown", 2, 3)).toBe(0);
    expect(nextChoice("ArrowRight", 0, 3)).toBe(1);
    expect(nextChoice("ArrowUp", 0, 3)).toBe(2);
    expect(nextChoice("End", 0, 3)).toBe(2);
    expect(nextChoice("Enter", 0, 3)).toBe(null);
  });
});

describe("Meno's own controls, as they first show", () => {
  it("a Select: a button showing the choice, its list not open", () => {
    const html = renderToString(<Select label="Look" value="balls" options={LOOKS} onChange={() => {}} />);
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Look: Balls and sticks"');
    expect(html).toContain("Balls and sticks");
    expect(html).not.toContain("Space-filling");
    expect(html).not.toContain("<select");
  });

  it("a Select in a header, quiet: no frame, as tabs and icon buttons are - a field's has one", () => {
    const quiet = renderToString(<Select label="Job" value="0" options={[{ value: "0", label: "Job 1 of 7 · done" }]} onChange={() => {}} variant="quiet" />);
    const field = renderToString(<Select label="Job" value="0" options={[{ value: "0", label: "Job 1 of 7 · done" }]} onChange={() => {}} />);
    const classOf = (html: string) => /<button[^>]*class="([^"]*)"/.exec(html)![1].split(" ");
    expect(classOf(quiet)).not.toContain("border");
    expect(classOf(quiet)).toContain("hover:bg-gh-base");
    expect(classOf(quiet)).toContain("h-7");
    expect(classOf(field)).toContain("border");
  });

  it("a Select with nothing chosen: what it says instead, quieter", () => {
    const html = renderToString(<Select label="Carboxyl O4, O5" value={null} placeholder="Choose…" options={LOOKS} onChange={() => {}} />);
    expect(html).toMatch(/<span class="[^"]*text-gh-gray[^"]*">Choose…<\/span>/);
    expect(html).toContain('aria-label="Carboxyl O4, O5: Choose…"');
  });

  it("a radio group: the chosen one checked and the group's one stop of Tab, drawn in Meno's colour", () => {
    const html = renderToString(<RadioGroup label="Shape" value="balls" options={LOOKS.slice(0, 3)} onChange={() => {}} />);
    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/<fieldset[^>]*aria-labelledby="([^"]+)"[^>]*>\s*<legend id="\1"[^>]*>Shape<\/legend>/);
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-checked="true" tabindex="0"/);
    expect(html).toContain("stroke-accel-base");
    expect(html).not.toContain('type="radio"');
    // (a long name wrapped hangs under its first line, set left, its circle on that line)
    expect(html.match(/role="radio"[^>]*class="[^"]*\bitems-start\b[^"]*\btext-left\b/g)).toHaveLength(3);
  });

  it("a radio's ring and dot, and a checkbox's box, drawn as shapes - round and square at any scale, not boxes whose sides round apart", () => {
    const radio = renderToString(<RadioGroup label="Shape" value="balls" options={LOOKS.slice(0, 1)} onChange={() => {}} />);
    expect(radio).toMatch(/<svg[^>]*viewBox="0 0 14 14"[^>]*class="h-3\.5 w-3\.5 shrink-0/);
    expect(radio).toMatch(/<circle cx="7" cy="7" r="6\.5"/);
    expect(radio).toMatch(/<circle cx="7" cy="7" r="3"/);
    expect(radio).not.toMatch(/h-1\.5 w-1\.5 rounded-full/);
    const box = renderToString(<Checkbox checked onChange={() => {}} label="Place it" />);
    expect(box).toMatch(/<svg[^>]*viewBox="0 0 14 14"[^>]*class="h-3\.5 w-3\.5 shrink-0/);
    expect(box).toMatch(/<rect x="0\.5" y="0\.5" width="13" height="13" rx="2\.5"/);
  });

  it("a radio group with nothing chosen: its first the stop of Tab", () => {
    const html = renderToString(<RadioGroup label="Shape" value={"none" as string} options={LOOKS.slice(0, 2)} onChange={() => {}} />);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-checked="false" tabindex="0"[^>]*>.*Sticks/);
  });

  it("a checkbox: on in Meno's colour, or in the colour of attention where it accepts a warning; off, white", () => {
    const on = renderToString(<Checkbox checked onChange={() => {}}>Show these atoms as the label here</Checkbox>);
    expect(on).toContain('role="checkbox"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain("fill-accel-base");
    expect(renderToString(<Checkbox checked tone="attention" onChange={() => {}} label="I understand" />)).toContain("fill-accel-accent");
    const off = renderToString(<Checkbox checked={false} onChange={() => {}} label="Place it" />);
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain('aria-label="Place it"');
    expect(off).not.toContain("fill-accel-base");
    expect(off).toContain("fill-white");
    expect(off).not.toContain('type="checkbox"');
  });
});
