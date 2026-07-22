"use client";

import { useEffect, useRef, useState } from "react";
import { SCENE_WIDTH, SCENE_HEIGHT, type PixelManifest } from "@/lib/scene-layout";

const DISPLAY_SCALE = 2; // integer scale for crisp pixels

export default function BookstorePreview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("loading…");

  useEffect(() => {
    let game: import("phaser").Game | undefined;
    let cancelled = false;

    async function boot() {
      const [Phaser, { PreviewScene }] = await Promise.all([
        import("phaser"),
        import("@/lib/phaser/PreviewScene"),
      ]);

      let manifest: PixelManifest = { version: 1, assets: {} };
      try {
        const res = await fetch("/assets/pixel/manifest.json", { cache: "no-store" });
        manifest = await res.json();
      } catch {
        // keep empty manifest → placeholder scene
      }

      if (cancelled || !containerRef.current) return;

      const assetCount = Object.keys(manifest.assets ?? {}).length;
      setStatus(assetCount > 0 ? `${assetCount} 个素材已加载` : "占位场景（尚无素材）");

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: SCENE_WIDTH,
        height: SCENE_HEIGHT,
        zoom: DISPLAY_SCALE,
        pixelArt: true,
        backgroundColor: "#17182b",
        callbacks: {
          preBoot: (g) => {
            g.scene.add("preview", PreviewScene, true, { manifest });
          },
        },
      });
    }

    boot();

    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);

  return (
    <div>
      <div
        ref={containerRef}
        style={{
          width: SCENE_WIDTH * DISPLAY_SCALE,
          height: SCENE_HEIGHT * DISPLAY_SCALE,
          margin: "0 auto",
          border: "1px solid #624536",
          boxShadow: "0 0 40px rgba(230,168,92,0.15)",
        }}
      />
      <p style={{ textAlign: "center", opacity: 0.6, fontSize: 13 }}>{status}</p>
    </div>
  );
}
