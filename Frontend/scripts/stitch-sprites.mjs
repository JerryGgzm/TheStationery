// Stitches PixelLab per-frame PNGs (extracted character download zips) into
// horizontal sprite sheets and writes/updates the pixel asset manifest.
//
// Usage:
//   node scripts/stitch-sprites.mjs <buildDir>
// where <buildDir> contains the extracted character folders, e.g.
//   <buildDir>/The_Bookseller/animations/<anim>/south/frame_000.png
//
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";

const buildDir = process.argv[2] || ".assetbuild";
const publicPixel = path.resolve("public/assets/pixel");

// Folder name (from download zip) -> actor id + output subdir.
const ACTOR_MAP = {
  The_Bookseller: { id: "bookseller", outDir: "characters/bookseller" },
  The_Night_Regular: { id: "night_regular", outDir: "characters/night_regular" },
  The_Traveler: { id: "traveler", outDir: "characters/traveler" },
  The_Bookstore_Cat: { id: "cat", outDir: "cat" },
};

// Per-animation playback hints (fps / loop). Falls back to default.
const ANIM_HINTS = {
  idle_breathing: { fps: 2, loop: true },
  reading_letter: { fps: 3, loop: true },
  sorting_books: { fps: 4, loop: true },
  wiping_counter: { fps: 4, loop: true },
  small_reaction: { fps: 5, loop: false },
  seated_idle: { fps: 2, loop: true },
  look_out_window: { fps: 3, loop: true },
  writing_reply: { fps: 5, loop: true },
  sip_coffee: { fps: 4, loop: false },
  adjust_bag: { fps: 4, loop: true },
  preparing_to_leave: { fps: 4, loop: false },
  sleeping: { fps: 3, loop: true },
  tail_flick_idle: { fps: 4, loop: true },
  walking: { fps: 8, loop: true },
  stretching: { fps: 6, loop: false },
  jump_up: { fps: 10, loop: false },
  paw_letter: { fps: 5, loop: true },
  sleep_curled: { fps: 3, loop: true },
  sleep_flat: { fps: 3, loop: true },
  sleep_belly: { fps: 3, loop: true },
};

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function listFrames(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ""), 10);
      const nb = parseInt(b.replace(/\D/g, ""), 10);
      return na - nb;
    })
    .map((f) => path.join(dir, f));
}

function stitch(frameFiles) {
  const pngs = frameFiles.map(readPng);
  const { width, height } = pngs[0];
  for (const p of pngs) {
    if (p.width !== width || p.height !== height) {
      throw new Error(
        `Frame size mismatch: expected ${width}x${height}, got ${p.width}x${p.height}`,
      );
    }
  }
  const sheet = new PNG({ width: width * pngs.length, height });
  pngs.forEach((p, i) => {
    PNG.bitblt(p, sheet, 0, 0, width, height, i * width, 0);
  });
  return { buffer: PNG.sync.write(sheet), width, height, count: pngs.length };
}

function main() {
  if (!fs.existsSync(buildDir)) {
    console.error(`Build dir not found: ${buildDir}`);
    process.exit(1);
  }

  const manifestPath = path.join(publicPixel, "manifest.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { version: 1, assets: {} };
  manifest.assets = manifest.assets || {};

  let produced = 0;

  for (const [folder, actor] of Object.entries(ACTOR_MAP)) {
    const animsRoot = path.join(buildDir, folder, "animations");
    if (!fs.existsSync(animsRoot)) continue;

    for (const animName of fs.readdirSync(animsRoot)) {
      const animDir = path.join(animsRoot, animName);
      if (!fs.statSync(animDir).isDirectory()) continue;

      // Each animation may hold one or more direction subfolders (south, east,
      // west, ...). "south" keeps the plain key; other directions get a suffix.
      const dirs = fs
        .readdirSync(animDir)
        .filter((d) => fs.statSync(path.join(animDir, d)).isDirectory());

      for (const dir of dirs) {
        const frames = listFrames(path.join(animDir, dir));
        if (frames.length === 0) continue;

        const { buffer, width, height, count } = stitch(frames);
        const suffix = dir === "south" ? "" : `_${dir}`;
        const outName = `${animName}${suffix}`;
        const outDirAbs = path.join(publicPixel, actor.outDir);
        fs.mkdirSync(outDirAbs, { recursive: true });
        const outFile = path.join(outDirAbs, `${outName}.png`);
        fs.writeFileSync(outFile, buffer);

        const key = `${actor.id}_${outName}`;
        const hint = ANIM_HINTS[animName] || { fps: 4, loop: true };
        manifest.assets[key] = {
          path: `/assets/pixel/${actor.outDir}/${outName}.png`,
          frameWidth: width,
          frameHeight: height,
          frameCount: count,
          fps: hint.fps,
          loop: hint.loop,
          version: 1,
        };
        produced++;
        console.log(`✓ ${key}: ${count} frames @ ${width}x${height}`);
      }
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nStitched ${produced} animations. Manifest updated: ${manifestPath}`);
}

main();
