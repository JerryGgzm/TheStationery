"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BookshopScene, { type TimeOfDay } from "@/components/BookshopScene";
import LoginWindow from "@/components/LoginWindow";
import { LocaleProvider } from "@/lib/i18n";
import { getSupabase } from "@/lib/supabase";

// Full entry flow:
//   intro   → outdoor video (outside_*.mp4) + pixel login/register window
//   opening → door-opening video (door_open_*.mp4) plays once after login
//   (fade to white) → inside bookstore scene (nighttime/daytime.mp4)
type Phase = "intro" | "opening" | "inside";

const OUTSIDE_VIDEOS: Record<TimeOfDay, string> = {
  night: "/assets/video/login/outside_night.mp4",
  day: "/assets/video/login/outside_day.mp4",
};

const DOOR_VIDEOS: Record<TimeOfDay, string> = {
  night: "/assets/video/login/door_open_night.mp4",
  day: "/assets/video/login/door_open_day.mp4",
};

// Fade-to-black transition timing.
const WHITE_IN_MS = 450; // door video → full black
const HOLD_MS = 550; // keep black while inside scene boots
const WHITE_OUT_MS = 900; // black → inside scene revealed
// Safety net if the door video never fires `ended` (throttled tab, missing file).
const DOOR_MAX_MS = 9000;

// Day vs night from the user's local clock:
//   06:00–17:59 → day, 18:00–05:59 → night
// (covers "6am–6pm day" / "7pm–5am night"; the dusk/dawn boundary hours
// 18:00 and 05:00 fall on the night side.)
function detectTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  return h >= 6 && h < 18 ? "day" : "night";
}

export default function BookshopApp() {
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("night");
  const [phase, setPhase] = useState<Phase>("intro");
  const [flash, setFlash] = useState(0);
  const [flashMs, setFlashMs] = useState(WHITE_IN_MS);
  // Keep the intro hidden on the very first frame so the initial "night"
  // guess never flashes; reveal (fade in) only after the clock is read.
  const [ready, setReady] = useState(false);
  // Intro/door videos start muted so they can autoplay; we unmute on the first
  // user interaction (typing in the form or clicking) per browser policy.
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const revealStarted = useRef(false);
  const timers = useRef<number[]>([]);

  // Decide day vs night once, on the client (avoids SSR hydration mismatch),
  // and resume an existing Supabase session: if the user is already signed in
  // (session persisted in localStorage by supabase-js), skip the login/door
  // sequence and drop straight into the bookstore. We hold the reveal (`ready`)
  // until this check finishes so the login window never flashes for a returning
  // visitor.
  useEffect(() => {
    setTimeOfDay(detectTimeOfDay());
    let alive = true;
    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!alive) return;
        if (data.session) setPhase("inside");
      })
      .catch(() => {
        /* no session / storage blocked — fall through to the login window */
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Unmute the intro/door audio once the user has interacted with the page.
  useEffect(() => {
    const onGesture = () => setMuted(false);
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, []);

  // React's `muted` prop doesn't reliably reflect onto the element, so drive it
  // (and playback) imperatively whenever the mute state, phase, or src changes.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (!muted) {
      v.volume = 1;
      const p = v.play();
      if (p) p.catch(() => {});
    }
  }, [muted, phase, timeOfDay, ready]);

  useEffect(() => {
    return () => timers.current.forEach((t) => window.clearTimeout(t));
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const startReveal = useCallback(() => {
    if (revealStarted.current) return;
    revealStarted.current = true;

    setFlashMs(WHITE_IN_MS);
    setFlash(1); // fade the whole page to black
    after(WHITE_IN_MS + HOLD_MS, () => {
      setPhase("inside"); // mount the bookstore behind the black veil
      setFlashMs(WHITE_OUT_MS);
      // next tick so the longer transition duration is applied before opacity drops
      after(60, () => setFlash(0));
    });
  }, [after]);

  const handleEnter = useCallback(() => {
    setPhase("opening");
    // Fallback in case the door video's `ended` event never arrives.
    after(DOOR_MAX_MS, startReveal);
  }, [after, startReveal]);

  const showVideo = phase === "intro" || phase === "opening";
  const videoSrc =
    phase === "intro" ? OUTSIDE_VIDEOS[timeOfDay] : DOOR_VIDEOS[timeOfDay];

  return (
    <LocaleProvider>
      <div style={rootStyle}>
        {phase === "inside" && <BookshopScene initialTimeOfDay={timeOfDay} />}

        {showVideo && (
          <video
            key={phase}
            ref={videoRef}
            src={videoSrc}
            autoPlay
            muted={muted}
            playsInline
            loop={phase === "intro"}
            onEnded={phase === "opening" ? startReveal : undefined}
            onError={phase === "opening" ? startReveal : undefined}
            style={{
              ...videoStyle,
              opacity: ready ? 1 : 0,
              transition: "opacity 500ms ease",
            }}
          />
        )}

        {phase === "intro" && ready && <LoginWindow onEnter={handleEnter} />}

        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            background: "#000000",
            opacity: flash,
            transition: `opacity ${flashMs}ms ease`,
            pointerEvents: "none",
            zIndex: 20,
          }}
        />
      </div>
    </LocaleProvider>
  );
}

const rootStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#000",
  overflow: "hidden",
};

const videoStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  zIndex: 0,
};
