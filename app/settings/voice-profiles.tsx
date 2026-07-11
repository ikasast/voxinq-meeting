"use client";

import { useEffect, useRef, useState } from "react";
import { sttHttpBase } from "@/lib/stt/client";
import { TrashIcon } from "../icons";

type Profile = { name: string; sourceMeetingId: string | null; updatedAt: string };

// A phonetically varied passage for enrollment. The voiceprint is text-independent,
// but ~20-30s of natural, varied speech gives a much more reliable embedding than
// short or monotone clips.
const GUIDE_TEXT = `お手数ですが、次の文章を普段の会議で話すときの調子で、20〜30秒ほど読み上げてください。

「本日の打ち合わせでは、まず先週の進捗を確認し、そのあとで来月の計画について話し合います。
資料は事前に共有した通りですが、変更点が三つあります。第一に予算の配分、第二に担当者の割り当て、
第三に納期の調整です。何か質問があれば、遠慮なくその場でお知らせください。」

読み終えたら、そのまま自由に一言二言付け加えても構いません。`;

const MIN_SECONDS = 8;
const MAX_SECONDS = 90;

// Build a 16kHz mono 16-bit WAV from raw Int16 PCM chunks (what pcm-worklet emits).
function pcmToWav(chunks: ArrayBuffer[]): Blob {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const buf = new ArrayBuffer(44 + total);
  const v = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  v.setUint32(4, 36 + total, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 16000, true);
  v.setUint32(28, 16000 * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, "data");
  v.setUint32(40, total, true);
  let off = 44;
  for (const c of chunks) {
    new Uint8Array(buf, off, c.byteLength).set(new Uint8Array(c));
    off += c.byteLength;
  }
  return new Blob([buf], { type: "audio/wav" });
}

// Settings section: enroll a voice profile by reading a guided passage, and manage
// (list/delete) enrolled profiles. Profiles auto-name matching speakers whenever a
// meeting is diarized.
export function VoiceProfiles() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [name, setName] = useState("Me");
  const [phase, setPhase] = useState<"idle" | "recording" | "extracting">("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const chunksRef = useRef<ArrayBuffer[]>([]);
  const cleanupRef = useRef<() => void>(() => {});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);

  const loadProfiles = () => {
    fetch("/api/speaker-profiles", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((list: Profile[] | null) => setProfiles(list ?? []))
      .catch(() => setProfiles([]));
  };
  useEffect(loadProfiles, []);
  // Stop capture if the user navigates away mid-recording.
  useEffect(() => () => cleanupRef.current(), []);

  const stopCapture = () => {
    cleanupRef.current();
    cleanupRef.current = () => {};
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const start = async () => {
    setError(null);
    setDone(null);
    chunksRef.current = [];
    setSeconds(0);
    secondsRef.current = 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const ctx = new AudioContext({ sampleRate: 16000 });
      await ctx.audioWorklet.addModule("/worklets/pcm-worklet.js");
      const node = new AudioWorkletNode(ctx, "pcm-worklet", {
        channelCount: 1,
        channelCountMode: "explicit",
        channelInterpretation: "speakers",
      });
      ctx.createMediaStreamSource(stream).connect(node);
      node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        chunksRef.current.push(e.data);
        const arr = new Int16Array(e.data);
        let sum = 0;
        for (let i = 0; i < arr.length; i += 4) sum += (arr[i] / 32768) ** 2;
        setLevel(Math.sqrt(sum / Math.max(1, arr.length / 4)));
      };
      cleanupRef.current = () => {
        try {
          node.disconnect();
        } catch {}
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => {});
      };
      setPhase("recording");
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= MAX_SECONDS) void finish();
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not access the microphone");
    }
  };

  const cancel = () => {
    stopCapture();
    setPhase("idle");
  };

  const finish = async () => {
    if (secondsRef.current < MIN_SECONDS) {
      setError(`Keep reading — at least ${MIN_SECONDS} seconds are needed.`);
      return;
    }
    stopCapture();
    setPhase("extracting");
    setError(null);
    try {
      const wav = pcmToWav(chunksRef.current);
      const res = await fetch(`${sttHttpBase()}/voiceprint`, { method: "POST", body: wav });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.detail ?? `Extraction failed (HTTP ${res.status})`);
      }
      const { embedding } = (await res.json()) as { embedding: number[] };
      const save = await fetch("/api/speaker-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), embedding }),
      });
      if (!save.ok) {
        const d = await save.json().catch(() => null);
        throw new Error(d?.error ?? `Save failed (HTTP ${save.status})`);
      }
      setDone(`Voice profile "${name.trim()}" saved. Diarized meetings will now auto-name this voice.`);
      loadProfiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrollment failed");
    } finally {
      setPhase("idle");
    }
  };

  const remove = async (n: string) => {
    await fetch(`/api/speaker-profiles?name=${encodeURIComponent(n)}`, { method: "DELETE" }).catch(
      () => {},
    );
    loadProfiles();
  };

  return (
    <section className="card space-y-4 p-6">
      <h2 className="section-title text-sm font-semibold text-[var(--text-strong)]">
        Voice profiles (speaker auto-naming)
      </h2>
      <p className="text-xs text-[var(--text-muted)]">
        Enroll a voice once and diarization will label that speaker by name automatically in
        every future meeting. You can also enroll people from a diarized meeting (name the
        speaker there, then “Save voice profiles”).
      </p>

      {/* Enrolled profiles */}
      <div>
        <p className="label">Enrolled</p>
        {profiles === null ? (
          <p className="mt-1 text-xs text-[var(--text-muted)]">Loading…</p>
        ) : profiles.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--text-muted)]">No profiles yet.</p>
        ) : (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {profiles.map((p) => (
              <li
                key={p.name}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                title={p.sourceMeetingId ? "Enrolled from a meeting" : "Enrolled from guided recording"}
              >
                {p.name}
                <button
                  type="button"
                  onClick={() => void remove(p.name)}
                  className="text-[var(--text-muted)] hover:text-[var(--error)]"
                  aria-label={`Delete profile ${p.name}`}
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Guided enrollment */}
      <div className="space-y-3 rounded-md border border-[var(--border)] p-4">
        <div>
          <label htmlFor="vp-name" className="label">
            Name for this voice
          </label>
          <input
            id="vp-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            disabled={phase !== "idle"}
            className="input mt-1 max-w-xs"
          />
        </div>

        <pre className="whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--elevated)] p-3 font-sans text-xs leading-relaxed text-[var(--text-secondary)]">
          {GUIDE_TEXT}
        </pre>

        {phase === "idle" ? (
          <button
            type="button"
            onClick={() => void start()}
            disabled={!name.trim()}
            className="btn-ink"
          >
            Start recording
          </button>
        ) : phase === "recording" ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-sm text-[var(--accent-sub)]">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--error)]" />
              Recording… {seconds}s
            </span>
            {/* simple level meter so silence is obvious */}
            <span className="h-1.5 w-24 overflow-hidden rounded bg-[var(--elevated)]">
              <span
                className="block h-full bg-[var(--accent)] transition-[width]"
                style={{ width: `${Math.min(100, level * 300)}%` }}
              />
            </span>
            <button
              type="button"
              onClick={() => void finish()}
              disabled={seconds < MIN_SECONDS}
              className="btn-ink"
              title={seconds < MIN_SECONDS ? `Record at least ${MIN_SECONDS}s` : undefined}
            >
              Done — save voiceprint
            </button>
            <button type="button" onClick={cancel} className="btn-outline">
              Cancel
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-[var(--accent-sub)]">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
            Extracting the voiceprint (GPU)… this takes a little while.
          </p>
        )}
        {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
        {done ? <p className="text-sm text-[var(--accent-sub)]">{done}</p> : null}
      </div>
    </section>
  );
}
