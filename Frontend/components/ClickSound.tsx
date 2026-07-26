"use client";

import { useEffect, useRef } from "react";

import { SCENE_HEIGHT, SCENE_WIDTH } from "@/lib/scene-layout";

// Global click SFX: plays on every pointer press anywhere on the page.
// Uses the Web Audio API (decode once, fire a fresh buffer source per click) so
// rapid clicks overlap cleanly with no latency.
const CLICK_SRC = "/assets/audio/sound_effect/点击声.MP3";
const CLICK_VOLUME = 0.5;

// The cat has its own meow SFX (see BookshopCatScene), so clicking it should
// not also fire the global click sound. BookshopCatScene publishes its bounds in
// scene coordinates; map the pointer into scene space via the Phaser canvas.
function isCatClick(e: PointerEvent): boolean {
  const b = typeof window !== "undefined" ? window.__catBounds : undefined;
  if (!b) return false;
  const canvas = document.querySelector("canvas");
  if (!canvas) return false;
  const r = canvas.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const sx = ((e.clientX - r.left) / r.width) * SCENE_WIDTH;
  const sy = ((e.clientY - r.top) / r.height) * SCENE_HEIGHT;
  return sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h;
}

export default function ClickSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;

    const ctx = new AC();
    ctxRef.current = ctx;

    let cancelled = false;
    fetch(encodeURI(CLICK_SRC))
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        if (!cancelled) bufferRef.current = decoded;
      })
      .catch(() => {});

    const onPointerDown = (e: PointerEvent) => {
      const c = ctxRef.current;
      // Audio contexts start suspended until a user gesture unlocks them.
      if (c && c.state === "suspended") c.resume().catch(() => {});
      // Clicking the cat plays a meow instead of the generic click sound.
      if (isCatClick(e)) return;
      const b = bufferRef.current;
      if (!c || !b) return;
      const src = c.createBufferSource();
      src.buffer = b;
      const gain = c.createGain();
      gain.gain.value = CLICK_VOLUME;
      src.connect(gain).connect(c.destination);
      src.start();
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", onPointerDown);
      ctx.close().catch(() => {});
    };
  }, []);

  return null;
}
