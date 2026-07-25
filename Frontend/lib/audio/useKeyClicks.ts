import { useCallback, useEffect, useRef } from "react";

// Plays a single short "key click" per call, sliced out of one longer typing
// recording. The source clip is a ~10s continuous typewriter take, so instead
// of replaying the whole file we detect the individual keystroke onsets once
// and, on each call, play a brief window from a random onset (with slight
// pitch/volume jitter) for a natural per-keypress click.
//
// Web Audio is used so clicks are low-latency and can overlap when typing fast.

interface Options {
  volume?: number;
  /** Max length of each click window, in seconds. */
  maxSlice?: number;
}

export function useKeyClicks(src: string, { volume = 0.32, maxSlice = 0.16 }: Options = {}) {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const onsetsRef = useRef<number[]>([]);

  useEffect(() => {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;

    const ctx = new AC();
    ctxRef.current = ctx;

    let cancelled = false;
    fetch(encodeURI(src))
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buffer) => {
        if (cancelled) return;
        bufferRef.current = buffer;
        onsetsRef.current = detectOnsets(buffer);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      ctx.close().catch(() => {});
    };
  }, [src]);

  return useCallback(() => {
    const ctx = ctxRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !buffer) return;
    // Contexts start suspended until a gesture; typing is that gesture.
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const onsets = onsetsRef.current;
    let offset = 0;
    let slice = maxSlice;
    if (onsets.length > 1) {
      const i = Math.floor(Math.random() * onsets.length);
      offset = onsets[i];
      const next = onsets[i + 1] ?? buffer.duration;
      slice = Math.min(maxSlice, Math.max(0.05, next - offset));
    } else {
      offset = Math.random() * Math.max(0, buffer.duration - maxSlice);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.96 + Math.random() * 0.12;

    // Short attack + release so slice boundaries don't add their own clicks.
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const peak = volume * (0.85 + Math.random() * 0.3);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.004);
    gain.gain.setValueAtTime(peak, now + Math.max(0.02, slice * 0.55));
    gain.gain.linearRampToValueAtTime(0, now + slice);

    source.connect(gain).connect(ctx.destination);
    source.start(now, offset, slice + 0.02);
    source.stop(now + slice + 0.03);
  }, [volume, maxSlice]);
}

// Find keystroke onsets by walking the waveform for amplitude spikes that are
// separated by a minimum gap. Runs once per decoded clip.
function detectOnsets(buffer: AudioBuffer): number[] {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const minGap = Math.floor(sampleRate * 0.06); // ≥60ms between clicks
  const attackPad = Math.floor(sampleRate * 0.003); // include ~3ms of attack

  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const a = data[i] < 0 ? -data[i] : data[i];
    if (a > peak) peak = a;
  }
  if (peak === 0) return [];

  const threshold = peak * 0.22;
  const onsets: number[] = [];
  let last = -minGap;
  for (let i = 0; i < data.length; ) {
    const a = data[i] < 0 ? -data[i] : data[i];
    if (a >= threshold && i - last >= minGap) {
      onsets.push(Math.max(0, i - attackPad) / sampleRate);
      last = i;
      i += minGap;
    } else {
      i++;
    }
  }
  return onsets;
}
