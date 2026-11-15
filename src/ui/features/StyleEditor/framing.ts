/** The preview's field of view, in degrees, and how gently its camera goes to another look's distance, in seconds. */
export const FOV = 30;
export const FRAMING_TAU = 0.12;

/**
 * How far off the preview's camera stands for a sample that reaches `reach`
 * from its middle, to fit however it is turned: as high as it reaches, seen
 * from that far again, and as much once more.
 */
export function framedAt(reach: number): number {
  return reach + (reach * 1.15) / Math.tan(((FOV / 2) * Math.PI) / 180);
}
