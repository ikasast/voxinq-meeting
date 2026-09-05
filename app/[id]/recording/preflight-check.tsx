"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { micConstraints } from "@/lib/stt/mic-constraints";

// Is the microphone actually hearing anything?
//
// The most expensive failure this app has is a meeting that was not recorded, and until now the
// only way to find out was to record one: the level meter moved after you pressed the button,
// which is after the point where finding out is useful. A muted headset, a laptop lid that
// switched the input, a phone that handed the mic to another app — all of them look exactly
// like a working setup until the transcript comes back empty.
//
// The microphone opened here is handed to the recording rather than released and re-acquired.
// Some phones fail the second `getUserMedia` of a session, and a check that breaks the thing it
// was checking would be worse than no check.

/** Long enough to say a sentence and watch the bar; short enough not to sit on the mic. */
const AUTO_STOP_MS = 60_000;

/** RMS above this, at any point, means sound is arriving. Below it, the room is silent. */
const HEARD = 0.02;

/**
 * How often the level is sampled, matching the recording meter's own rate.
 *
 * A timer rather than `requestAnimationFrame`: rAF does not fire at all while the tab is
 * hidden, and a phone whose screen dims mid-check would freeze the bar and then report
 * "silent" at the end — the check answering wrongly, which is worse than no check. Timers are
 * throttled in the background, not stopped.
 */
const SAMPLE_MS = 100;

export type PreflightState = "idle" | "checking" | "heard" | "silent" | "error";

export function PreflightCheck({
  source,
  micMode,
  onStream,
  disabled = false,
}: {
  source: string;
  micMode?: string;
  /** The open microphone, for the recording to take over. Null when it is released. */
  onStream: (stream: MediaStream | null) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<PreflightState>("idle");
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sampleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held in a ref because the parent passes an inline callback, so its identity changes every
  // render — and `release` must not be rebuilt (and its cleanup re-run) ten times a second.
  const onStreamRef = useRef(onStream);
  useEffect(() => {
    onStreamRef.current = onStream;
  }, [onStream]);

  const release = useCallback((keepStream: boolean) => {
    if (sampleRef.current) clearInterval(sampleRef.current);
    sampleRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    if (!keepStream) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      onStreamRef.current(null);
    }
  }, []);

  // The microphone must not outlive the screen. Leaving it open would keep the browser's
  // recording indicator lit on a page nobody is looking at.
  useEffect(() => () => release(false), [release]);

  // Changing the source or the mic mode changes what would be asked for, so what is open is no
  // longer a check of the thing that would be recorded.
  useEffect(() => {
    if (streamRef.current) {
      release(false);
      setState("idle");
      setLevel(0);
      setPeak(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, micMode]);

  const start = useCallback(async () => {
    setError(null);
    setPeak(0);
    setState("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micConstraints(source, micMode),
      });
      streamRef.current = stream;
      onStreamRef.current(stream);

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);

      let loudest = 0;
      sampleRef.current = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        // The same RMS the recording meter shows, so the bar means the same thing before and
        // during rather than being a second scale to learn.
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        setLevel(rms);
        if (rms > loudest) {
          loudest = rms;
          setPeak(rms);
        }
      }, SAMPLE_MS);

      timerRef.current = setTimeout(() => {
        setState(loudest >= HEARD ? "heard" : "silent");
        release(false);
        setLevel(0);
      }, AUTO_STOP_MS);
    } catch (e) {
      setState("error");
      setError(
        (e as Error).name === "NotAllowedError"
          ? "The browser refused access to the microphone. Allow it for this site and try again."
          : `Could not open the microphone: ${(e as Error).message}`,
      );
      release(false);
    }
  }, [source, micMode, release]);

  const stop = useCallback(() => {
    setState(peak >= HEARD ? "heard" : "silent");
    // The stream stays open on a successful check: the recording takes it from here, which is
    // the whole reason the check is safe to run on a phone.
    release(peak >= HEARD);
    setLevel(0);
  }, [peak, release]);

  const checking = state === "checking";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-[var(--text-strong)]">Microphone check</span>
        {!checking ? (
          <button
            type="button"
            onClick={() => void start()}
            disabled={disabled}
            className="btn-outline !px-3 !py-1 !text-xs disabled:opacity-50"
          >
            {state === "idle" ? "Check the microphone" : "Check again"}
          </button>
        ) : (
          <button type="button" onClick={stop} className="btn-outline !px-3 !py-1 !text-xs">
            Done
          </button>
        )}
      </div>

      {checking ? (
        <>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Say something. The bar should move.
          </p>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--elevated)]"
            role="meter"
            aria-label="Microphone level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(level * 300))}
          >
            <div
              className={`h-full transition-[width] duration-75 ${
                peak >= HEARD ? "bg-[var(--accent)]" : "bg-[var(--text-muted)]"
              }`}
              style={{ width: `${Math.min(100, Math.round(level * 300))}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">
            {peak >= HEARD
              ? "Sound is arriving. The microphone stays open, and the recording will use it."
              : "Nothing heard yet."}
          </p>
        </>
      ) : null}

      {state === "heard" ? (
        <p className="mt-2 text-xs text-[var(--accent-sub)]">
          Heard you. This microphone is open and the recording will use it — no second permission
          prompt, and no chance of it opening a different input.
        </p>
      ) : null}

      {state === "silent" ? (
        <p className="mt-2 text-xs text-[var(--warning)]">
          Nothing came through. Check that the right input is selected and not muted — a headset
          with its own mute switch, or another app holding the microphone, both look like this.
          Recording now would produce an empty transcript.
        </p>
      ) : null}

      {state === "error" ? <p className="mt-2 text-xs text-[var(--error)]">{error}</p> : null}
    </div>
  );
}
