import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import type * as THREE from "three";
import { useEditor, useEditorStore } from "../store";
import { MOV_PX } from "../constants";
import { PX } from "../workflow/look";
import { pageAt } from "../utils/page";
import FrameTabs, { type FrameTab } from "../pageGl/FrameTabs";
import type { PagePointer } from "../pageGl/PageHits";
import type { Side } from "../pageGl/hits";
import { connectionFor } from "./connections";
import type { Conversation } from "./types";

/** How small a frame may be sized, each way: as a set's (components/Workflow2D). */
const LEAST = 48 * PX;

/** What a conversation's tab says beside its name: that it talks, what it talks through, or that it sends nothing. */
export function statusOf(c: Conversation, talking: boolean): string {
  if (talking) return "Talking…";
  const via = connectionFor(c);
  return via ? `through ${via.id}` : "Sends nothing: no model plugin";
}

/** The frames of the page's conversations, as FrameTabs draws them (pageGl/FrameTabs): a set's look, a conversation's words. */
export function conversationTabs(conversations: readonly Conversation[], o: { hovered: number | null; shown: number | null; talking: Record<number, { running: boolean } | undefined> }): FrameTab[] {
  return conversations.map((c) => ({
    key: `conversation:${c.id}`,
    box: { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 },
    ...(c.wholePage ? { tabOnly: true as const } : { edges: true as const }),
    tone: o.shown === c.id ? "chosen" : o.hovered === c.id ? "hover" : "rest",
    tab: { icon: "chat", name: c.name ?? "Conversation", status: statusOf(c, !!o.talking[c.id]?.running), ...(c.wholePage ? { warn: "Sees the whole page" } : {}) },
  }));
}

/**
 * The page's conversations (docs/CONVERSATIONS.md, *The Conversation
 * object*), drawn by WebGL as a set is (pageGl/FrameTabs): a frame a hair
 * thick - what lies inside it is what it sees - its tab along its top,
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
  const items = useMemo(() => conversationTabs(conversations, { hovered, shown, talking }), [conversations, hovered, shown, talking]);
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
