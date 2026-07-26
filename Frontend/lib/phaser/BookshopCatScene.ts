import * as Phaser from "phaser";
import {
  ACTORS,
  CAT_FLOOR_Y,
  CAT_STATIONS,
  type CatFacing,
  type PixelManifest,
  type ActorPlacement,
} from "@/lib/scene-layout";

const PALETTE = {
  lamp: 0xe6a85c,
};

const CAT_SPEED = 30; // logical px per second while walking

// Random meow on cat click. Encode the CJK filenames for the loader/URL.
const MEOWS = ["猫叫1", "猫叫2", "猫叫3"].map((name, i) => ({
  key: `meow${i + 1}`,
  url: encodeURI(`/assets/audio/sound_effect/${name}.MP3`),
}));
const MEOW_VOLUME = 0.7;
const MEOW_COOLDOWN_MS = 200;

// Published so the global click SFX can skip cat clicks (which meow instead).
declare global {
  interface Window {
    __catBounds?: { x: number; y: number; w: number; h: number };
  }
}

interface SceneInitData {
  manifest: PixelManifest;
}

// The bookstore background is a looping HTML <video> rendered behind this
// scene's transparent canvas (see BookshopScene). This scene draws the cat
// on top of that video.
//
// Cat behaviour: the cat starts asleep at a random station (floor or desk).
// Clicking it wakes it up; it then wanders between stations (radiator, mailbox,
// window, desk) for a while, resting with a per-station dwell animation, and
// finally curls up to sleep again at a new spot until clicked once more.
export class BookshopCatScene extends Phaser.Scene {
  private manifest!: PixelManifest;

  private cat?: Phaser.GameObjects.Sprite;
  private zzz?: Phaser.GameObjects.Text;
  private stationIndex = 0;
  private mode: "sleeping" | "active" = "sleeping";
  private activeUntil = 0;
  private busy = false;
  private anims2: Record<string, string | undefined> = {};
  private lastMeow = -1;
  private meowReadyAt = 0;
  private currentMeow?: Phaser.Sound.BaseSound;

  constructor() {
    super("bookshop");
  }

  init(data: SceneInitData) {
    this.manifest = data.manifest ?? { version: 1, assets: {} };
  }

  preload() {
    const assets = this.manifest.assets ?? {};
    for (const actor of ACTORS) {
      for (const [key, asset] of Object.entries(assets)) {
        if (!key.startsWith(`${actor.id}_`)) continue;
        this.load.spritesheet(key, asset.path, {
          frameWidth: asset.frameWidth,
          frameHeight: asset.frameHeight,
        });
      }
      this.load.image(`${actor.id}_canonical`, actor.canonical.path);
    }
    for (const meow of MEOWS) {
      this.load.audio(meow.key, meow.url);
    }
  }

  create() {
    for (const actor of ACTORS) {
      if (actor.id === "cat") {
        this.setupCat(actor);
      } else {
        this.placeActor(actor);
      }
    }
  }

  update() {
    // Publish the cat's scene-space bounds so the global click SFX can skip
    // clicks that land on the cat (those play a meow instead).
    if (typeof window === "undefined") return;
    const cat = this.cat;
    if (cat && cat.visible) {
      const b = cat.getBounds();
      window.__catBounds = { x: b.x, y: b.y, w: b.width, h: b.height };
    } else {
      delete window.__catBounds;
    }
  }

  // Play a random meow on cat click: never repeat the previous clip, ignore
  // clicks inside a short cooldown, and only ever play one meow at a time.
  private meow() {
    const now = this.time.now;
    if (now < this.meowReadyAt) return;
    this.meowReadyAt = now + MEOW_COOLDOWN_MS;

    const loaded = MEOWS.map((m, i) => i).filter((i) => this.cache.audio.exists(MEOWS[i].key));
    if (loaded.length === 0) return;
    // Avoid repeating the previous clip when there's more than one to choose from.
    let pool = loaded.filter((i) => i !== this.lastMeow);
    if (pool.length === 0) pool = loaded;
    const idx = pool[Phaser.Math.Between(0, pool.length - 1)];
    this.lastMeow = idx;

    if (this.currentMeow) {
      this.currentMeow.stop();
      this.currentMeow.destroy();
      this.currentMeow = undefined;
    }
    const snd = this.sound.add(MEOWS[idx].key, { volume: MEOW_VOLUME });
    snd.once(Phaser.Sound.Events.COMPLETE, () => {
      snd.destroy();
      if (this.currentMeow === snd) this.currentMeow = undefined;
    });
    this.currentMeow = snd;
    snd.play();
  }

  private ensureAnim(manifestKey: string): string | undefined {
    const asset = this.manifest.assets?.[manifestKey];
    if (!asset || !this.textures.exists(manifestKey)) return undefined;
    const playKey = `${manifestKey}_play`;
    if (!this.anims.exists(playKey)) {
      this.anims.create({
        key: playKey,
        frames: this.anims.generateFrameNumbers(manifestKey, {
          start: 0,
          end: asset.frameCount - 1,
        }),
        frameRate: asset.fps ?? 4,
        repeat: asset.loop === false ? 0 : -1,
      });
    }
    return playKey;
  }

  private idleKey(): string | undefined {
    return this.anims2["cat_tail_flick_idle"] ?? (this as unknown as { _idleFallback?: string })._idleFallback;
  }

  private setupCat(actor: ActorPlacement) {
    for (const key of [
      "cat_walking_east",
      "cat_walking_west",
      "cat_tail_flick_idle",
      "cat_sleeping",
      "cat_sleep_belly",
      "cat_sleep_belly_east",
      "cat_stretching",
      "cat_paw_letter",
      "cat_jump_up_east",
      "cat_jump_up_west",
    ]) {
      this.anims2[key] = this.ensureAnim(key);
    }
    (this as unknown as { _idleFallback?: string })._idleFallback =
      this.anims2["cat_tail_flick_idle"] ?? this.ensureAnim(actor.defaultAnimation);

    const startTexture = this.textures.exists("cat_tail_flick_idle")
      ? "cat_tail_flick_idle"
      : this.textures.exists("cat_canonical")
        ? "cat_canonical"
        : undefined;
    if (!startTexture) {
      this.placeActor(actor);
      return;
    }

    // Start asleep at a random station (may be the desk).
    const start = Phaser.Math.Between(0, CAT_STATIONS.length - 1);
    const s = CAT_STATIONS[start];
    const cat = this.add.sprite(s.x, s.y, startTexture, 0);
    cat.setOrigin(0.5, 1);
    cat.setScale(actor.scale);
    cat.setInteractive({ useHandCursor: true });
    cat.on("pointerdown", () => {
      this.meow();
      this.wake();
    });
    this.cat = cat;

    const clearBounds = () => {
      if (typeof window !== "undefined") delete window.__catBounds;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, clearBounds);
    this.events.once(Phaser.Scenes.Events.DESTROY, clearBounds);

    this.zzz = this.add
      .text(s.x, s.y, "z z z", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#8a93ac",
      })
      .setOrigin(0, 1)
      .setDepth(60)
      .setAlpha(0.45);

    this.goSleep(start);
  }

  private hasWalk(): boolean {
    return Boolean(this.anims2["cat_walking_east"] || this.anims2["cat_walking_west"]);
  }

  // ---- Sleeping / waking ---------------------------------------------------

  // Pick a random real sleeping pose (curled ball / lying flat), falling back
  // to the older dozing pose if the new sheets aren't available.
  // The cat's base art is an upright sitting pose, so only the side view reads
  // as genuinely lying down. Prefer the side-lying pose (randomly faced left or
  // right in goSleep); fall back to older poses only if it's unavailable.
  private pickSleepAnim(): string | undefined {
    return (
      this.anims2["cat_sleep_belly_east"] ??
      this.anims2["cat_sleep_belly"] ??
      this.anims2["cat_sleeping"] ??
      this.idleKey()
    );
  }

  private goSleep(i: number) {
    const cat = this.cat;
    if (!cat) return;
    const station = CAT_STATIONS[i];
    this.stationIndex = i;
    this.mode = "sleeping";
    this.busy = false;
    const sleep = this.pickSleepAnim();
    // The side-lying pose can face either way; the front loaf stays un-flipped.
    cat.setFlipX(sleep === this.anims2["cat_sleep_belly_east"] ? Math.random() < 0.5 : false);
    if (sleep) cat.play(sleep, true);
    this.showZzz(cat.x, cat.y - Math.abs(cat.displayHeight) * 0.72);
  }

  private wake() {
    if (this.mode !== "sleeping" || !this.cat || !this.hasWalk()) return;
    this.hideZzz();
    this.mode = "active";
    this.activeUntil = this.time.now + Phaser.Math.Between(16000, 26000);
    this.goNext();
  }

  private showZzz(x: number, y: number) {
    if (!this.zzz) return;
    this.zzz.setPosition(x + 8, y).setVisible(true);
  }

  private hideZzz() {
    this.zzz?.setVisible(false);
  }

  // ---- Wandering -----------------------------------------------------------

  private goNext() {
    if (this.mode !== "active" || !this.cat || this.busy) return;

    // Time to settle down: walk to a fresh spot and fall asleep there.
    if (this.time.now >= this.activeUntil) {
      const j = this.pickOtherStation();
      this.navigate(j, () => this.goSleep(j));
      return;
    }

    const j = this.pickOtherStation();
    this.navigate(j, () => this.activeDwell(j));
  }

  private pickOtherStation(): number {
    let j = this.stationIndex;
    while (CAT_STATIONS.length > 1 && j === this.stationIndex) {
      j = Phaser.Math.Between(0, CAT_STATIONS.length - 1);
    }
    return j;
  }

  private activeDwell(i: number) {
    const cat = this.cat;
    if (!cat) return;
    const station = CAT_STATIONS[i];
    this.stationIndex = i;
    this.busy = false;
    cat.setFlipX(false);

    const dwell = this.anims2[station.dwell] ?? this.idleKey();
    if (dwell) {
      cat.play(dwell, true);
      const asset = this.manifest.assets?.[station.dwell];
      const idle = this.idleKey();
      if (asset && asset.loop === false && idle) {
        cat.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          if (this.cat && this.stationIndex === i && !this.busy && this.mode === "active") {
            this.cat.play(idle, true);
          }
        });
      }
    }

    this.time.delayedCall(Phaser.Math.Between(2500, 5000), () => this.goNext());
  }

  private navigate(j: number, onArrive: () => void) {
    const cat = this.cat;
    if (!cat) return;
    this.busy = true;
    const from = CAT_STATIONS[this.stationIndex];
    const to = CAT_STATIONS[j];

    const walkThenArrive = () => {
      this.walkToX(to.x, () => {
        if (to.elevated) {
          this.jumpTo(to.x, to.y, to.facing, onArrive);
        } else {
          onArrive();
        }
      });
    };

    if (from.elevated) {
      this.jumpTo(from.x, CAT_FLOOR_Y, from.facing, walkThenArrive);
    } else {
      walkThenArrive();
    }
  }

  private faceSide(facing: Exclude<CatFacing, "south">) {
    const cat = this.cat!;
    const east = this.anims2["cat_walking_east"];
    const west = this.anims2["cat_walking_west"];
    if (facing === "east") {
      if (east) {
        cat.setFlipX(false);
        cat.play(east, true);
      } else if (west) {
        cat.setFlipX(true);
        cat.play(west, true);
      }
    } else {
      if (west) {
        cat.setFlipX(false);
        cat.play(west, true);
      } else if (east) {
        cat.setFlipX(true);
        cat.play(east, true);
      }
    }
  }

  private jumpAnimFor(facing: CatFacing): string | undefined {
    const east = this.anims2["cat_jump_up_east"];
    const west = this.anims2["cat_jump_up_west"];
    if (facing === "west") return west ?? east;
    return east ?? west;
  }

  private walkToX(x: number, done: () => void) {
    const cat = this.cat!;
    const dir: Exclude<CatFacing, "south"> = x >= cat.x ? "east" : "west";
    this.faceSide(dir);
    const dist = Math.abs(x - cat.x);
    const duration = Math.max(150, (dist / CAT_SPEED) * 1000);
    this.tweens.add({ targets: cat, x, duration, ease: "Linear", onComplete: done });
  }

  private jumpTo(x: number, y: number, facing: CatFacing, done: () => void) {
    const cat = this.cat!;
    const jump = this.jumpAnimFor(facing);
    if (jump) {
      const east = this.anims2["cat_jump_up_east"];
      cat.setFlipX(facing === "west" && jump === east);
      cat.play(jump, true);
    }
    const goingUp = y < cat.y;
    this.tweens.add({
      targets: cat,
      x,
      y,
      duration: 620,
      ease: goingUp ? "Sine.easeOut" : "Sine.easeIn",
      onComplete: done,
    });
  }

  private placeActor(actor: ActorPlacement) {
    const playKey = this.ensureAnim(actor.defaultAnimation);
    if (playKey) {
      const sprite = this.add.sprite(actor.x, actor.y, actor.defaultAnimation, 0);
      sprite.setOrigin(0.5, 1);
      sprite.setScale(actor.scale);
      sprite.play(playKey);
    } else if (this.textures.exists(`${actor.id}_canonical`)) {
      const sprite = this.add.image(actor.x, actor.y, `${actor.id}_canonical`);
      sprite.setOrigin(0.5, 1);
      sprite.setScale(actor.scale);
    } else {
      const box = this.add.graphics();
      box.lineStyle(1, PALETTE.lamp, 0.8);
      box.strokeRect(actor.x - 24, actor.y - 56, 48, 56);
      box.fillStyle(PALETTE.lamp, 0.06);
      box.fillRect(actor.x - 24, actor.y - 56, 48, 56);
    }
  }
}
