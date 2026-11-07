import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import type * as THREE from "three";
import { useEditor, useEditorStore } from "../store";
import { MOV_PX } from "../constants";
import { PX } from "../workflow/look";
import { pageAt } from "../utils/page";
import { ChatBubbleLeftRightIcon, CloudArrowUpIcon, ComputerDesktopIcon } from "@heroicons/react/24/outline";
import { DURATION } from "../../../theme/motion";
import FrameTabs from "../pageGl/FrameTabs";
import { addPageIcon } from "../pageGl/icons";
import type { FrameTab } from "../pageGl/frameParts";
import { fading, presenceAt, presentAt, type Present } from "../pageGl/presence";
import type { PagePointer } from "../pageGl/PageHits";
import type { Side } from "../pageGl/hits";
import { conversationTabs } from "./tabs";

addPageIcon("chat", (size) => <ChatBubbleLeftRightIcon width={size} height={size} strokeWidth={1.5} />);
// (where what is in a conversation's frame may go: away from this computer, or staying on it)
addPageIcon("sent-away", (size) => <CloudArrowUpIcon width={size} height={size} strokeWidth={1.5} />);
addPageIcon("this-computer", (size) => <ComputerDesktopIcon width={size} height={size} strokeWidth={1.5} />);

/** A tone's level: 0 at rest, 1 pointed at, 2 chosen - an outward frame's line weighs more as it rises (pageGl/frameParts `frameLine`). */
const LEVEL = { rest: 0, hover: 1, chosen: 2 } as const;

/** How small a frame may be sized, each way: as a set's (components/Workflow2D). */
const LEAST = 48 * PX;

/**
 * The page's conversations (docs/CONVERSATIONS.md, *The Conversation
 * object*), drawn by WebGL (pageGl/FrameTabs): a frame of its own, dashed in
 * Meno's colour, never a set's hairline - what lies inside it is what it
 * sees, and may be sent away (the maintainer, 2026-11-07) - its tab along
 * its top, saying where to,
 * which drags the frame alone and, clicked, reads it in the column; its
 * edges and corners size it. One of the whole page: its tab alone, saying
 * so in Meno's warning colour.
 */
export default function ConversationFrames() {
  const store = useEditorStore();
  const conversations = useEditor((s) => s.conversations);
  const hovered = useEditor((s) => s.hoveredConversation);
  const shown = useEditor((s) => s.conversationShown);
  const talking = useEditor((s) => s.talking);
  const { gl, camera } = useThree();
  const live = useMemo(() => conversationTabs(conversations, { hovered, shown, talking }), [conversations, hovered, shown, talking]);
  // (each coming in and going out over Meno's base time - one gone drawn as it last was till it has: pageGl/presence)
  const present = useRef<Map<string, Present<FrameTab>> | null>(null);
  const [, redraw] = useState(0);
  const now = performance.now();
  present.current = presentAt(present.current ?? new Map(), live, now, present.current == null);
  // (each frame's tone eased to where it goes - a level a quick time - as a colour is: its line never jumps)
  const levels = useRef(new Map<string, number>());
  const last = useRef(now);
  const dt = Math.min(now - last.current, 1000 / 30);
  last.current = now;
  let easing = false;
  for (const t of live) {
    const to = LEVEL[t.tone];
    const at = levels.current.get(t.key) ?? to;
    const step = dt / (DURATION.quick * 1000);
    const next = at < to ? Math.min(to, at + step) : Math.max(to, at - step);
    if (next !== to) easing = true;
    levels.current.set(t.key, next);
  }
  useFrame(() => {
    if (easing || (present.current && fading(present.current, performance.now()))) redraw((n) => n + 1);
  });
  const items = [...present.current.values()].map((p) => ({
    ...p.item,
    opacity: presenceAt(p, now),
    level: levels.current.get(p.item.key) ?? LEVEL[p.item.tone],
    ...(p.gone != null ? { noHits: true as const } : {}),
  }));
  const byKey = (key: string) => conversations.find((c) => `conversation:${c.id}` === key);

  /** Where a pointer is on the page. */
  const pageOf = (e: PointerEvent) => {
    const r = gl.domElement.getBoundingClientRect();
    const p = pageAt(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, camera as THREE.Camera);
    return { x: p.x, y: p.y };
  };
  /** A press followed till its button comes up: each move told where the pointer is on the page; at the end, whether it moved past a click's reach. */
  const follow = (start: PagePointer, move: (at: { x: number; y: number }) => void, end: (moved: boolean) => void) => {
    const from = start.screen;
    let moved = false;
    const onMove = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - from.x, e.clientY - from.y) < MOV_PX) return;
      moved = true;
      move(pageOf(e));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      end(moved);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <FrameTabs
      items={items}
      on={{
        // (its tab: the frame dragged alone - what lies inside it is what then lies there - or, clicked, read in the column)
        tabDown: (key, e) => {
          const c = byKey(key);
          if (!c) return;
          let last = e.page;
          const gesture = `${performance.now()}`;
          follow(
            e,
            (p) => {
              store.getState().moveConversation(c.id, p.x - last.x, p.y - last.y, gesture);
              last = p;
            },
            (moved) => !moved && store.getState().readConversation(c.id),
          );
        },
        // (an edge or a corner: its frame sized - what it sees is what then lies inside it)
        edgeDown: (key, side: Side, e) => {
          const c = byKey(key);
          if (!c) return;
          const was = { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 };
          const gesture = `${performance.now()}`;
          follow(
            e,
            (p) => {
              const dx = p.x - e.page.x;
              const dy = p.y - e.page.y;
              const f = { ...was };
              if (side.includes("e")) f.x1 = Math.max(was.x1 + dx, was.x0 + LEAST);
              if (side.includes("w")) f.x0 = Math.min(was.x0 + dx, was.x1 - LEAST);
              if (side.includes("n")) f.y1 = Math.max(was.y1 + dy, was.y0 + LEAST);
              if (side.includes("s")) f.y0 = Math.min(was.y0 + dy, was.y1 - LEAST);
              store.getState().resizeConversation(c.id, f, gesture);
            },
            () => {},
          );
        },
        hover: (key, on) => {
          const c = byKey(key);
          const st = store.getState();
          if (c && on) st.setHoveredConversation(c.id);
          else if (c && st.hoveredConversation === c.id) st.setHoveredConversation(null);
        },
      }}
    />
  );
}
