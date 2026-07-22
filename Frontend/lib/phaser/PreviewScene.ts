import * as Phaser from "phaser";
import {
  ACTORS,
  SCENE_WIDTH,
  SCENE_HEIGHT,
  type PixelManifest,
  type ActorPlacement,
} from "@/lib/scene-layout";

const PALETTE = {
  night: 0x17182b,
  shadowBlue: 0x252a48,
  wood: 0x624536,
  woodDark: 0x4a3329,
  lamp: 0xe6a85c,
  paper: 0xe8d9ba,
  accentRed: 0x8c4f4b,
  plant: 0x526b59,
};

interface SceneInitData {
  manifest: PixelManifest;
}

export class PreviewScene extends Phaser.Scene {
  private manifest!: PixelManifest;

  constructor() {
    super("preview");
  }

  init(data: SceneInitData) {
    this.manifest = data.manifest ?? { version: 1, assets: {} };
  }

  preload() {
    const assets = this.manifest.assets ?? {};
    for (const actor of ACTORS) {
      const asset = assets[actor.defaultAnimation];
      if (asset) {
        this.load.spritesheet(actor.defaultAnimation, asset.path, {
          frameWidth: asset.frameWidth,
          frameHeight: asset.frameHeight,
        });
      }
      // Always load the canonical still as a fallback / base sprite.
      this.load.image(`${actor.id}_canonical`, actor.canonical.path);
    }
  }

  create() {
    this.drawPlaceholderBackground();

    for (const actor of ACTORS) {
      this.placeActor(actor);
    }

    this.add
      .text(8, 6, "PLACEHOLDER SCENE — art assets in progress", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#e8d9ba",
      })
      .setAlpha(0.6);
  }

  private drawPlaceholderBackground() {
    const g = this.add.graphics();

    // Exterior night sky (behind window).
    g.fillStyle(PALETTE.night, 1);
    g.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

    // Interior back wall.
    g.fillStyle(PALETTE.shadowBlue, 1);
    g.fillRect(0, 40, SCENE_WIDTH, SCENE_HEIGHT - 40);

    // Floor.
    g.fillStyle(PALETTE.woodDark, 1);
    g.fillRect(0, 300, SCENE_WIDTH, 60);

    // Red rug (center).
    g.fillStyle(PALETTE.accentRed, 1);
    g.fillRect(230, 312, 210, 30);

    // Left: public letter board frame.
    g.fillStyle(PALETTE.wood, 1);
    g.fillRect(40, 90, 120, 150);
    g.fillStyle(PALETTE.shadowBlue, 1);
    g.fillRect(48, 98, 104, 134);
    for (let i = 0; i < 6; i++) {
      g.fillStyle(PALETTE.paper, 0.9);
      g.fillRect(58 + (i % 3) * 32, 108 + Math.floor(i / 3) * 60, 22, 30);
    }

    // Rear window with cool exterior + a few amber points.
    g.fillStyle(PALETTE.woodDark, 1);
    g.fillRect(400, 60, 150, 120);
    g.fillStyle(0x0d0f1d, 1);
    g.fillRect(408, 68, 134, 104);
    g.lineStyle(2, PALETTE.wood, 1);
    g.strokeLineShape(new Phaser.Geom.Line(475, 68, 475, 172));
    g.strokeLineShape(new Phaser.Geom.Line(408, 120, 542, 120));
    g.fillStyle(PALETTE.lamp, 0.7);
    g.fillCircle(430, 150, 1.5);
    g.fillCircle(500, 140, 1.5);
    g.fillCircle(520, 158, 1.5);

    // Bookshelves (right + left of window).
    this.drawShelf(g, 180, 70, 200, 120);

    // Writing desk (center) + lamp glow.
    g.fillStyle(PALETTE.wood, 1);
    g.fillRect(288, 258, 96, 50);
    g.fillStyle(PALETTE.paper, 1);
    g.fillRect(306, 250, 30, 20);
    this.lampGlow(322, 235, 60);

    // Counter (right).
    g.fillStyle(PALETTE.wood, 1);
    g.fillRect(500, 236, 110, 70);
    this.lampGlow(560, 210, 50);

    // Warm corner / radiator for the cat (left).
    g.fillStyle(PALETTE.wood, 1);
    g.fillRect(90, 300, 70, 14);
    this.lampGlow(120, 300, 40);

    // Plant accents.
    g.fillStyle(PALETTE.plant, 1);
    g.fillRect(620, 250, 16, 56);
    g.fillRect(10, 250, 16, 56);
  }

  private drawShelf(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    g.fillStyle(PALETTE.woodDark, 1);
    g.fillRect(x, y, w, h);
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const ry = y + 6 + r * (h / rows);
      for (let bx = x + 6; bx < x + w - 8; bx += 10) {
        const colors = [PALETTE.accentRed, PALETTE.plant, PALETTE.lamp, PALETTE.paper];
        g.fillStyle(colors[(bx + r) % colors.length], 0.85);
        g.fillRect(bx, ry, 7, h / rows - 10);
      }
    }
  }

  private lampGlow(x: number, y: number, radius: number) {
    const glow = this.add.graphics();
    glow.fillStyle(PALETTE.lamp, 0.12);
    glow.fillCircle(x, y, radius);
    glow.fillStyle(PALETTE.lamp, 0.18);
    glow.fillCircle(x, y, radius * 0.6);
  }

  private placeActor(actor: ActorPlacement) {
    const asset = this.manifest.assets?.[actor.defaultAnimation];

    if (asset && this.textures.exists(actor.defaultAnimation)) {
      const anim = this.anims.create({
        key: `${actor.defaultAnimation}_play`,
        frames: this.anims.generateFrameNumbers(actor.defaultAnimation, {
          start: 0,
          end: asset.frameCount - 1,
        }),
        frameRate: asset.fps ?? 4,
        repeat: asset.loop === false ? 0 : -1,
      });
      const sprite = this.add.sprite(actor.x, actor.y, actor.defaultAnimation, 0);
      sprite.setOrigin(0.5, 1);
      sprite.setScale(actor.scale);
      if (anim) sprite.play(`${actor.defaultAnimation}_play`);
      this.labelActor(actor, true);
    } else if (this.textures.exists(`${actor.id}_canonical`)) {
      // Static canonical sprite until its animation sheet is generated.
      const sprite = this.add.image(actor.x, actor.y, `${actor.id}_canonical`);
      sprite.setOrigin(0.5, 1);
      sprite.setScale(actor.scale);
      this.labelActor(actor, false);
    } else {
      // Placeholder marker until the sprite is generated.
      const box = this.add.graphics();
      box.lineStyle(1, PALETTE.lamp, 0.8);
      box.strokeRect(actor.x - 24, actor.y - 56, 48, 56);
      box.fillStyle(PALETTE.lamp, 0.06);
      box.fillRect(actor.x - 24, actor.y - 56, 48, 56);
      this.labelActor(actor, false);
    }
  }

  private labelActor(actor: ActorPlacement, hasAsset: boolean) {
    this.add
      .text(actor.x, actor.y + 4, actor.label + (hasAsset ? "" : " (…)"), {
        fontFamily: "monospace",
        fontSize: "8px",
        color: hasAsset ? "#e6a85c" : "#8a8aa0",
      })
      .setOrigin(0.5, 0);
  }
}
