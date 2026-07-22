// Logical scene canvas per PRD: 16:9, 640x360.
export const SCENE_WIDTH = 640;
export const SCENE_HEIGHT = 360;

export type ActorId = "bookseller" | "night_regular" | "traveler" | "cat";

export interface CanonicalStill {
  path: string;
  width: number;
  height: number;
}

export interface ActorPlacement {
  id: ActorId;
  label: string;
  // Anchor position in logical scene coordinates (bottom-center of the sprite).
  x: number;
  y: number;
  // Rendering scale multiplier (pixel art integer scaling preferred).
  scale: number;
  // Which manifest animation key to play by default (falls back to canonical still).
  defaultAnimation: string;
  // Static base sprite, shown until the animation sprite sheet exists.
  canonical: CanonicalStill;
}

// Fixed theatrical placement. Left: letter board. Center: writing desk.
// Right: counter (bookseller). Rear window: night regular. Warm corner: cat.
export const ACTORS: ActorPlacement[] = [
  {
    id: "bookseller",
    label: "The Bookseller",
    x: 540,
    y: 236,
    scale: 1,
    defaultAnimation: "bookseller_idle_breathing",
    canonical: { path: "/assets/pixel/characters/bookseller/canonical.png", width: 92, height: 92 },
  },
  {
    id: "night_regular",
    label: "The Night Regular",
    x: 470,
    y: 236,
    scale: 1,
    defaultAnimation: "night_regular_seated_idle",
    canonical: { path: "/assets/pixel/characters/night_regular/canonical.png", width: 92, height: 92 },
  },
  {
    id: "traveler",
    label: "The Traveler",
    x: 205,
    y: 268,
    scale: 1,
    defaultAnimation: "traveler_seated_idle",
    canonical: { path: "/assets/pixel/characters/traveler/canonical.png", width: 92, height: 92 },
  },
  {
    id: "cat",
    label: "The Cat",
    x: 120,
    y: 318,
    scale: 1,
    defaultAnimation: "cat_tail_flick_idle",
    canonical: { path: "/assets/pixel/cat/canonical.png", width: 68, height: 68 },
  },
];

export interface ManifestAsset {
  path: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps?: number;
  loop?: boolean;
}

export interface PixelManifest {
  version: number;
  assets: Record<string, ManifestAsset>;
}
