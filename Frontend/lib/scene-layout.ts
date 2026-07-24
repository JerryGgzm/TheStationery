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

// Cat display scale (bigger than 1:1 so the cat reads clearly in the scene).
export const CAT_SCALE = 1.4;
// Floor line (feet anchor y) the cat walks along.
export const CAT_FLOOR_Y = 322;

// MVP scope: the bookstore scene renders ONLY the cat. The three AI characters
// (bookseller / night_regular / traveler) exist as letter personas but are not
// drawn in the scene, so no character sprites or static stills are placed here.
export const ACTORS: ActorPlacement[] = [
  {
    id: "cat",
    label: "The Cat",
    x: 120,
    y: CAT_FLOOR_Y,
    scale: CAT_SCALE,
    defaultAnimation: "cat_tail_flick_idle",
    canonical: { path: "/assets/pixel/cat/canonical.png", width: 68, height: 68 },
  },
];

export type CatFacing = "east" | "west" | "south";

// A place the cat likes to visit. `dwell` is a manifest animation key played
// while resting there. `elevated` stations sit above the floor and are reached
// with a jump (e.g. up onto the writing desk).
export interface CatStation {
  id: string;
  label: string;
  x: number;
  y: number;
  facing: CatFacing;
  dwell: string;
  elevated?: boolean;
}

// Logical 640x360 coordinates, calibrated against the bookstore background video.
export const CAT_STATIONS: CatStation[] = [
  {
    id: "radiator",
    label: "暖气旁",
    x: 78,
    y: CAT_FLOOR_Y,
    facing: "south",
    dwell: "cat_sleeping",
  },
  {
    id: "mailbox",
    label: "邮箱下",
    x: 135,
    y: CAT_FLOOR_Y,
    facing: "south",
    dwell: "cat_stretching",
  },
  {
    id: "window",
    label: "窗边",
    x: 190,
    y: CAT_FLOOR_Y,
    facing: "south",
    dwell: "cat_tail_flick_idle",
  },
  {
    id: "desk",
    label: "书桌上",
    x: 270,
    y: 250,
    facing: "west",
    dwell: "cat_paw_letter",
    elevated: true,
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
