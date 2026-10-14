// The part of troika-three-text Meno uses directly; drei, which draws the
// text, brings the rest. The package has no types of its own.
declare module "troika-three-text" {
  import type { Material, Mesh } from "three";
  /** A text, its letters set off the page's thread (`sync`) and drawn as one mesh. */
  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    color: string | number | null;
    fillOpacity: number;
    anchorX: number | string;
    anchorY: number | string;
    outlineWidth: number | string;
    outlineColor: string | number;
    outlineOpacity: number;
    strokeOpacity: number;
    material: Material;
    sync(callback?: () => void): void;
    dispose(): void;
    _needsSync?: boolean;
    _isSyncing?: boolean;
  }
  export function configureTextBuilder(config: {
    defaultFontURL?: string | null;
    unicodeFontsURL?: string | null;
    sdfGlyphSize?: number;
    useWorker?: boolean;
  }): void;
}
