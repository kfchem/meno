/**
 * What is under the pointer, found again as the view moves under it while
 * it rests - fitted, eased to what was put on the page, zoomed: else what
 * was under it stays lit, and Delete or a right-click acts on that,
 * wherever it has gone (utils/hoverFollows).
 */
import { useEffect, useRef } from "react";
import { addAfterEffect, useThree } from "@react-three/fiber";
import { hoverFollows } from "../utils/hoverFollows";

export default function HoverFollowsView({ again, held }: { again: (raycast: () => void) => void; held: () => boolean }) {
  const camera = useThree((s) => s.camera);
  const events = useThree((s) => s.events);
  const asked = useRef({ again, held });
  asked.current = { again, held };
  // (after each frame is drawn: the view as all that moves it left it)
  useEffect(
    () =>
      addAfterEffect(
        hoverFollows(
          () => ({ x: camera.position.x, y: camera.position.y, zoom: camera.zoom }),
          () => asked.current.held(),
          (raycast) => asked.current.again(raycast),
          () => events.update?.(),
        ),
      ),
    [camera, events],
  );
  return null;
}
