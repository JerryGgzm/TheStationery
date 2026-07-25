"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SCENE_WIDTH, SCENE_HEIGHT, type PixelManifest } from "@/lib/scene-layout";
import LetterWriter from "@/components/LetterWriter";
import LetterWall from "@/components/LetterWall";
import Correspondence from "@/components/Correspondence";
import ProfilePanel from "@/components/ProfilePanel";

export type TimeOfDay = "day" | "night";

const BG_VIDEOS: Record<TimeOfDay, string> = {
  night: "/assets/video/nighttime.mp4",
  day: "/assets/video/daytime.mp4",
};

const BGM: Record<TimeOfDay, string> = {
  night: "/assets/audio/background_music_night.mp3",
  day: "/assets/audio/background_music_day.mp3",
};
const BGM_VOLUME = 0.22;
const FADE_MS = 3000;

// Clicking the desk plays this unfold animation, then opens the letter-writing
// screen. CJK filenames are percent-encoded for the URL.
const DESK_VIDEO = encodeURI("/assets/video/展开信纸.mp4");
const LETTER_BG = encodeURI("/assets/pixel/scene/展开信纸.png");
// Plays after the user posts a letter, then returns to the bookstore.
const MAIL_SENT_VIDEO = encodeURI("/assets/video/mail_sent.mp4");
// Safety net if a desk video never fires `ended` (throttled tab / missing file).
const DESK_VIDEO_MAX_MS = 8000;
const MAIL_SENT_MAX_MS = 12000;

// Clicking the letter wall plays a sound and fades (through black) to the wall
// of letters. The wall board becomes a dimmed, pixelated-blurred backdrop
// (same treatment as the writing desk) behind the pinned notes.
const WALL_SFX = encodeURI("/assets/audio/sound_effect/展开信件墙.MP3");
const WALL_SFX_VOLUME = 0.85;
const LETTERWALL: Record<TimeOfDay, string> = {
  day: encodeURI("/assets/video/letterwall_day.mp4"),
  night: encodeURI("/assets/video/letterwall_night.mp4"),
};
const WALL_FADE_MS = 420;

// Clicking the bookshelf (behind the desk) fades to a pile of letters, then the
// correspondence sorted by sender. The pile image is both the entry splash and
// (blurred) the backdrop.
const LETTERPILE = encodeURI("/assets/pixel/scene/letterpile.png");

// Diegetic interaction hints: instead of floating tooltips, each hint reads as a
// real object in the room — a note pinned to the letter wall, a brass plaque on
// the desk rail. Hidden by default; they surface only while the cursor is over
// the object (`hover` rect, in logical 640x360 scene coords), plus a one-time
// guide flash on first entry. `x`/`y` place the hint's center; the icon uses a
// text-presentation glyph (\uFE0E) so it renders monochrome, not as emoji.
type LabelVariant = "note" | "plaque";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SceneLabel {
  id: string;
  variant: LabelVariant;
  x: number;
  y: number;
  icon: string;
  text: string;
  hover: Rect; // object region that reveals this hint
}

const SCENE_LABELS: SceneLabel[] = [
  {
    id: "wall",
    variant: "note",
    x: 96,
    y: 190,
    icon: "\u2709\uFE0E", // ✉
    text: "Read letters",
    hover: { x: 8, y: 74, w: 130, h: 136 },
  },
  {
    id: "desk",
    variant: "plaque",
    x: 300,
    y: 246,
    icon: "\u2712\uFE0E", // ✒
    text: "Write a letter",
    hover: { x: 214, y: 188, w: 165, h: 112 },
  },
  {
    // Central bookshelf behind/above the desk (calibrated from the night scene:
    // the book-filled shelves sit above the desk, left of the right-hand window).
    id: "shelf",
    variant: "plaque",
    x: 330,
    y: 96,
    icon: "\u2263", // ≣ stacked lines → a shelf of letters
    text: "Past letters",
    hover: { x: 234, y: 58, w: 190, h: 128 },
  },
];

// A soft warm glow that blooms over the desk lamp when its plaque is hovered.
const DESK_LAMP = { x: 252, y: 160 };

// Wait for the door-open → enter transition to settle before revealing labels.
const LABEL_DELAY_MS = 800;
// How long the one-time first-entry guide flash stays visible before hiding.
const INTRO_HINT_MS = 2600;

export default function BookstorePreview({
  initialTimeOfDay = "night",
}: {
  initialTimeOfDay?: TimeOfDay;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(initialTimeOfDay);
  const [audioOn, setAudioOn] = useState(true);
  const [introHint, setIntroHint] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [deskPhase, setDeskPhase] = useState<
    "closed" | "opening" | "open"
  >("closed");
  // Shared "mail sent" animation, triggered by posting a new letter (desk) or a
  // reply (wall). Whatever is on screen unmounts and this plays over the top.
  const [sending, setSending] = useState(false);
  const [wallOpen, setWallOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [veil, setVeil] = useState(0); // black transition veil for the wall view
  const stageRef = useRef<HTMLDivElement>(null);
  const deskVideoRef = useRef<HTMLVideoElement>(null);
  const sentVideoRef = useRef<HTMLVideoElement>(null);
  const wallSfxRef = useRef<HTMLAudioElement>(null);
  const wallTimers = useRef<number[]>([]);
  const fadeRaf = useRef<number | null>(null);
  const audioOnRef = useRef(audioOn);
  audioOnRef.current = audioOn;

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
        // keep empty manifest → actors fall back to placeholder markers
      }

      if (cancelled || !containerRef.current) return;

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: SCENE_WIDTH,
        height: SCENE_HEIGHT,
        pixelArt: true,
        transparent: true, // let the HTML <video> background show through
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        callbacks: {
          preBoot: (g) => {
            g.scene.add("preview", PreviewScene, true, { manifest });
          },
        },
      });

      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __previewGame?: unknown }).__previewGame = game;
      }
    }

    boot();

    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);

  // One-time guide flash: once the scene settles, briefly surface both hints so
  // the player learns the objects are interactive, then hide them again.
  useEffect(() => {
    const on = window.setTimeout(() => setIntroHint(true), LABEL_DELAY_MS);
    const off = window.setTimeout(
      () => setIntroHint(false),
      LABEL_DELAY_MS + INTRO_HINT_MS,
    );
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, []);

  // Hover detection via stage-level pointer tracking (converted to scene coords)
  // so the hint boxes stay pointer-transparent and never block canvas clicks
  // (e.g. clicking the cat that's sitting on the desk).
  const onStageMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const sx = ((e.clientX - rect.left) / rect.width) * SCENE_WIDTH;
    const sy = ((e.clientY - rect.top) / rect.height) * SCENE_HEIGHT;
    const hit = SCENE_LABELS.find(
      (l) =>
        sx >= l.hover.x &&
        sx <= l.hover.x + l.hover.w &&
        sy >= l.hover.y &&
        sy <= l.hover.y + l.hover.h,
    );
    setHovered(hit ? hit.id : null);
  }, []);

  // Fade to black, flip an overlay's open state, then fade back in. Reused for
  // entering/leaving both the letter wall and the correspondence shelf.
  const fadeToggle = useCallback(
    (setOpen: (v: boolean) => void, open: boolean) => {
      setVeil(1);
      wallTimers.current.push(
        window.setTimeout(() => {
          setOpen(open);
          wallTimers.current.push(window.setTimeout(() => setVeil(0), 40));
        }, WALL_FADE_MS),
      );
    },
    [],
  );

  const openWall = useCallback(() => {
    const a = wallSfxRef.current;
    if (a) {
      a.currentTime = 0;
      a.volume = WALL_SFX_VOLUME;
      a.play().catch(() => {});
    }
    fadeToggle(setWallOpen, true);
  }, [fadeToggle]);

  const openShelf = useCallback(() => {
    fadeToggle(setShelfOpen, true);
  }, [fadeToggle]);

  useEffect(() => {
    const timers = wallTimers.current;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  // Clicking the desk opens the letter-writing screen; clicking the letter wall
  // opens the wall of letters. Ignore clicks that land on the cat (it meows) so
  // it can still be petted, and ignore clicks while a transition is running.
  const onStageDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Ignore stage clicks while any overlay/transition is active — including
      // the "mail sent" animation — so tapping to skip it can't fall through to
      // a hotspot (which would wrongly open the desk-writing screen).
      if (deskPhase !== "closed" || wallOpen || shelfOpen || veil > 0 || sending)
        return;
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const sx = ((e.clientX - rect.left) / rect.width) * SCENE_WIDTH;
      const sy = ((e.clientY - rect.top) / rect.height) * SCENE_HEIGHT;
      const cb = typeof window !== "undefined" ? window.__catBounds : undefined;
      if (cb && sx >= cb.x && sx <= cb.x + cb.w && sy >= cb.y && sy <= cb.y + cb.h) {
        return;
      }
      const hit = SCENE_LABELS.find(
        (l) =>
          sx >= l.hover.x &&
          sx <= l.hover.x + l.hover.w &&
          sy >= l.hover.y &&
          sy <= l.hover.y + l.hover.h,
      );
      if (hit?.id === "desk") setDeskPhase("opening");
      else if (hit?.id === "wall") openWall();
      else if (hit?.id === "shelf") openShelf();
    },
    [deskPhase, wallOpen, shelfOpen, veil, sending, openWall, openShelf],
  );

  // Play the unfold video from the start; force the screen open if it stalls.
  useEffect(() => {
    if (deskPhase !== "opening") return;
    const v = deskVideoRef.current;
    if (v) {
      v.currentTime = 0;
      v.muted = false;
      v.volume = 1;
      const p = v.play();
      if (p) p.catch(() => {});
    }
    const t = window.setTimeout(() => setDeskPhase("open"), DESK_VIDEO_MAX_MS);
    return () => window.clearTimeout(t);
  }, [deskPhase]);

  // Play the "mail sent" video (with sound, following the Post click gesture);
  // return to the bookstore when it ends or if it stalls.
  useEffect(() => {
    if (!sending) return;
    const v = sentVideoRef.current;
    if (v) {
      v.currentTime = 0;
      v.muted = false;
      v.volume = 1;
      const p = v.play();
      if (p) p.catch(() => {});
    }
    const t = window.setTimeout(() => setSending(false), MAIL_SENT_MAX_MS);
    return () => window.clearTimeout(t);
  }, [sending]);

  // Posting a reply from the wall: drop the wall view and play the shared send
  // animation, then land back in the bookstore (same flow as posting a letter).
  const handleReplyPosted = useCallback(() => {
    setWallOpen(false);
    setShelfOpen(false);
    setVeil(0);
    setSending(true);
  }, []);

  // Reload + play the video whenever the time of day changes (muted autoplay).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.load();
    const p = v.play();
    if (p) p.catch(() => {});
  }, [timeOfDay]);

  const stopFade = useCallback(() => {
    if (fadeRaf.current != null) {
      clearInterval(fadeRaf.current);
      fadeRaf.current = null;
    }
  }, []);

  // Start (or restart) the current track from silence and ramp up over FADE_MS.
  // Uses a time-based interval (not requestAnimationFrame) so the ramp still
  // completes even if the tab is backgrounded and rAF is throttled.
  const fadeInPlay = useCallback(() => {
    const a = audioRef.current;
    if (!a || !audioOnRef.current) return;
    stopFade();
    a.volume = 0;
    const p = a.play();
    if (p) p.catch(() => {});
    const start = performance.now();
    fadeRaf.current = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / FADE_MS);
      if (audioRef.current) audioRef.current.volume = BGM_VOLUME * t;
      if (t >= 1) stopFade();
    }, 50);
  }, [stopFade]);

  // Switch track on day/night change and honor the mute toggle. The <audio> src
  // is driven by React, so by the time this effect runs the element already
  // points at the right file; we just (re)start it with a 3s fade-in.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (audioOn) {
      fadeInPlay();
    } else {
      stopFade();
      a.pause();
    }
  }, [timeOfDay, audioOn, fadeInPlay, stopFade]);

  // Browsers block audible autoplay until a user gesture, so kick playback off
  // on the first interaction (usually the click that wakes the cat).
  useEffect(() => {
    const onGesture = () => {
      fadeInPlay();
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [fadeInPlay]);

  const layerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
      }}
    >
      {/* Largest 16:9 stage that fits the viewport, centered. */}
      <div
        ref={stageRef}
        onPointerMove={onStageMove}
        onPointerLeave={() => setHovered(null)}
        onPointerDown={onStageDown}
        style={{
          position: "relative",
          width: "min(100vw, calc(100vh * 16 / 9))",
          height: "min(100vh, calc(100vw * 9 / 16))",
          overflow: "hidden",
        }}
      >
        <video
          ref={videoRef}
          style={{ ...layerStyle, objectFit: "cover", zIndex: 0 }}
          src={BG_VIDEOS[timeOfDay]}
          muted
          loop
          autoPlay
          playsInline
        />
        <div ref={containerRef} style={{ ...layerStyle, zIndex: 1 }} />

        {/* Warm bloom over the desk lamp when its plaque is hovered. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: `${(DESK_LAMP.x / SCENE_WIDTH) * 100}%`,
            top: `${(DESK_LAMP.y / SCENE_HEIGHT) * 100}%`,
            width: "16%",
            aspectRatio: "1 / 1",
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,196,120,0.55) 0%, rgba(255,196,120,0) 70%)",
            mixBlendMode: "screen",
            pointerEvents: "none",
            opacity: hovered === "desk" ? 1 : 0,
            transition: "opacity 300ms ease",
            zIndex: 2,
          }}
        />

        {SCENE_LABELS.map((l) => {
          const isHover = hovered === l.id;
          const visible = isHover || introHint;
          const lift = l.variant === "note" && isHover ? " - 2px" : "";
          return (
            <div
              key={l.id}
              style={{
                position: "absolute",
                left: `${(l.x / SCENE_WIDTH) * 100}%`,
                top: `${(l.y / SCENE_HEIGHT) * 100}%`,
                transform: `translate(-50%, calc(-50%${lift}))`,
                zIndex: 3,
                pointerEvents: "none",
                opacity: visible ? 1 : 0,
                transition:
                  "opacity 350ms ease, transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease, color 150ms ease",
                ...(l.variant === "note" ? noteStyle : plaqueStyle),
                ...(isHover && l.variant === "note" ? noteHoverStyle : null),
                ...(isHover && l.variant === "plaque" ? plaqueHoverStyle : null),
              }}
            >
              <span style={{ marginRight: 5, opacity: 0.85 }}>{l.icon}</span>
              {l.text}
            </div>
          );
        })}

        <audio ref={audioRef} src={BGM[timeOfDay]} loop preload="auto" />
        <button
          type="button"
          aria-label={audioOn ? "静音" : "开启音乐"}
          onClick={() => setAudioOn((on) => !on)}
          style={{ ...cornerButtonStyle, right: 54 }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
        >
          {audioOn ? "🔊" : "🔇"}
        </button>
        <button
          type="button"
          aria-label={timeOfDay === "night" ? "切到白天" : "切到夜晚"}
          onClick={() => setTimeOfDay((t) => (t === "night" ? "day" : "night"))}
          style={{ ...cornerButtonStyle, right: 12 }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
        >
          {timeOfDay === "night" ? "🌙" : "☀"}
        </button>

        {/* Pixel profile chip (top-left) → profile settings modal. Sits below the
            full-screen overlays (letter writer / wall / shelf), so it's only
            reachable from the base bookstore view. */}
        <ProfilePanel />

        {/* Desk → letter-writing screen: unfold video, then the letter surface.
            The still image is mounted under the video so there's no black flash
            when the clip ends and unmounts. */}
        {deskPhase === "opening" && (
          <>
            {/* Sharp still under the video for a seamless hand-off when it ends. */}
            <img
              src={LETTER_BG}
              alt="Write a letter"
              style={{ ...layerStyle, objectFit: "cover", background: "#000", zIndex: 20 }}
            />
            <video
              ref={deskVideoRef}
              src={DESK_VIDEO}
              autoPlay
              playsInline
              onEnded={() => setDeskPhase("open")}
              onError={() => setDeskPhase("open")}
              style={{ ...layerStyle, objectFit: "cover", background: "#000", zIndex: 21 }}
            />
          </>
        )}
        {deskPhase === "open" && (
          <LetterWriter
            bgSrc={LETTER_BG}
            onClose={() => setDeskPhase("closed")}
            onPost={() => {
              setDeskPhase("closed");
              setSending(true);
            }}
          />
        )}
        {sending && (
          <video
            ref={sentVideoRef}
            src={MAIL_SENT_VIDEO}
            autoPlay
            playsInline
            onEnded={() => setSending(false)}
            onError={() => setSending(false)}
            style={{ ...layerStyle, objectFit: "cover", background: "#000", zIndex: 22 }}
          />
        )}

        {/* Letter wall → wall-of-letters screen (fades through black). */}
        <audio ref={wallSfxRef} src={WALL_SFX} preload="auto" />
        {wallOpen && (
          <LetterWall
            bgSrc={LETTERWALL[timeOfDay]}
            onClose={() => fadeToggle(setWallOpen, false)}
            onReplyPosted={handleReplyPosted}
          />
        )}

        {/* Bookshelf → correspondence by sender (pile splash → blurred bundles). */}
        {shelfOpen && (
          <Correspondence
            pileSrc={LETTERPILE}
            onClose={() => fadeToggle(setShelfOpen, false)}
            onReplyPosted={handleReplyPosted}
          />
        )}

        {/* Black transition veil for the wall/shelf fade in/out. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "#000",
            opacity: veil,
            transition: `opacity ${WALL_FADE_MS}ms ease`,
            pointerEvents: veil > 0 ? "auto" : "none",
            zIndex: 30,
          }}
        />
      </div>
    </div>
  );
}

// A slip of cream paper pinned to the letter wall — hard offset shadow, no radius.
const noteStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 7px",
  background: "#D1C1A1",
  color: "#3a2c22",
  border: "1.5px solid #624536",
  borderRadius: 0,
  boxShadow: "2px 2px 0 0 rgba(0,0,0,0.45)",
  fontFamily: '"Courier New", ui-monospace, monospace',
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.3,
  whiteSpace: "nowrap",
  lineHeight: 1.2,
};

const noteHoverStyle: React.CSSProperties = {
  boxShadow: "3px 4px 0 0 rgba(0,0,0,0.5)",
};

// A small brass plaque on the desk's front rail — dark walnut, thin brass edge.
const plaqueStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 9px",
  background: "linear-gradient(180deg, #3c2b1d 0%, #2a1d13 100%)",
  color: "#e8dcc0",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#9c7b3a",
  borderRadius: 2,
  boxShadow: "0 1px 3px rgba(0,0,0,0.55)",
  fontFamily: '"Courier New", ui-monospace, monospace',
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.5,
  whiteSpace: "nowrap",
  lineHeight: 1.2,
};

const plaqueHoverStyle: React.CSSProperties = {
  borderColor: "#d8b26a",
  color: "#fff3d8",
  boxShadow: "0 0 7px rgba(216,178,106,0.55), 0 1px 3px rgba(0,0,0,0.55)",
};

const cornerButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  zIndex: 2,
  width: 34,
  height: 34,
  fontSize: 16,
  lineHeight: "34px",
  textAlign: "center",
  color: "#e8d9ba",
  background: "rgba(0,0,0,0.35)",
  border: "none",
  borderRadius: 999,
  cursor: "pointer",
  opacity: 0.5,
  transition: "opacity 0.2s",
};
