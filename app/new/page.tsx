"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { defaultMeetingTitle } from "@/lib/utils";
import { abortMinutesAndSettle, currentMinutesBusy } from "@/lib/minutes-busy";
import { sttHttpBase } from "@/lib/stt/client";
import {
  WHISPER_MODELS,
  effectiveSttLanguage,
  isJapaneseOnlyModel,
  isKnownWhisperModel,
} from "@/lib/stt/models";
import { preloadSttIfIdle } from "@/lib/stt/preload";
import { useGpuBusy } from "../use-gpu-busy";

const MIC_MODES: { id: string; label: string }[] = [
  { id: "standard", label: "Standard (close talk / calls)" },
  { id: "room", label: "Room (pick up distant voices)" },
];
const SOURCES: { id: string; label: string }[] = [
  { id: "mic", label: "Microphone" },
  { id: "display", label: "PC audio" },
  { id: "both", label: "Microphone + PC audio" },
];

const AUDIO_EXT = /\.(wav|mp3|m4a|aac|ogg|oga|flac|webm|mp4|mov|mkv|opus)$/i;

type Phase = null | "creating" | "transcribing" | "summarizing";

export default function NewMeetingPage() {
  const router = useRouter();
  const gpu = useGpuBusy();
  const [title, setTitle] = useState(() => defaultMeetingTitle());
  const [description, setDescription] = useState("");
  const [series, setSeries] = useState("");
  const [seriesOptions, setSeriesOptions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown when the user starts a recording while minutes are still generating: recording
  // needs the GPU, so we offer to interrupt the in-progress minutes first.
  const [showInterrupt, setShowInterrupt] = useState(false);
  const [interrupting, setInterrupting] = useState(false);
  const [interruptMeetingId, setInterruptMeetingId] = useState<string | undefined>(undefined);

  // Recording settings for this meeting only; not saved to the settings file.
  const [sttLanguage, setSttLanguage] = useState("auto"); // saved on the meeting
  const [model, setModel] = useState("large-v3-turbo");
  const [micMode, setMicMode] = useState("standard");
  const [source, setSource] = useState("mic");
  const [displaySupported, setDisplaySupported] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // Controls the user has changed; the settings response must not overwrite these.
  const touched = useRef<Set<string>>(new Set());

  // Upload-from-file flow (skip live recording).
  const [phase, setPhase] = useState<Phase>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const glossaryRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const supported =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === "function";
    setDisplaySupported(supported);
    try {
      const saved = localStorage.getItem("voxinq.source");
      if (saved === "mic" || (supported && (saved === "display" || saved === "both"))) {
        setSource(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/series")
      .then((r) => (r.ok ? r.json() : null))
      .then((list: { name: string }[] | null) => {
        if (!cancelled && list) setSeriesOptions(list.map((s) => s.name));
      })
      .catch(() => {});
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { whisperModel?: string; micMode?: string; sttGlossary?: string } | null) => {
        if (cancelled || !s) return;
        // Only fill in fields the user has not touched yet. This response can land after the
        // form is already being filled in (the first request after a restart is slow), and
        // silently reverting a chosen model would send the recording to the wrong one.
        if (s.whisperModel && !touched.current.has("model")) setModel(s.whisperModel);
        if (s.micMode && !touched.current.has("micMode")) setMicMode(s.micMode);
        if (s.sttGlossary) glossaryRef.current = s.sttGlossary;
        setSettingsLoaded(true);
      })
      .catch(() => setSettingsLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Start loading the Whisper model that this meeting will actually use — a cold load takes
  // tens of seconds, and filling in this form covers most of it. Keyed on `model`, so picking
  // a different one here warms that one instead (warming the settings model and then swapping
  // at recording start would cost two loads and defeat the point).
  useEffect(() => {
    if (!settingsLoaded) return;
    void preloadSttIfIdle(model);
  }, [settingsLoaded, model]);

  const createMeeting = async (fallbackTitle: string) => {
    const res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || fallbackTitle,
        description: description.trim(),
        series: series.trim(),
        sttLanguage,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? `HTTP ${res.status}`);
    }
    return (await res.json()) as { id: string };
  };

  // Set up the meeting: create it and open the recording screen ready to go. Recording is
  // started by hand there — auto-starting meant capture began while the model was still
  // loading and before the settings could be checked.
  const startRecording = async () => {
    setSubmitting(true);
    // Load the model for real now: from here the only thing left is pressing record, so this
    // is the last moment a warm-up can still hide the load time.
    void preloadSttIfIdle(model);
    try {
      const meeting = await createMeeting(defaultMeetingTitle());
      try {
        localStorage.setItem("voxinq.source", source);
      } catch {
        // ignore
      }
      const qs = new URLSearchParams({ model, mic: micMode, source });
      router.push(`/${meeting.id}/recording?${qs}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create meeting.");
      setSubmitting(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Please enter a title.");
      return;
    }
    // Recording needs the GPU. If minutes are still generating (Ollama holds the GPU),
    // ask whether to interrupt them first instead of contending for VRAM. Check freshly at
    // click time — the polled `gpu.minutesBusy` lags and starts false. Fall back to it if
    // the fresh check fails.
    setSubmitting(true);
    const mb = await currentMinutesBusy();
    if (mb.busy || gpu.minutesBusy) {
      setInterruptMeetingId(mb.meetingId ?? gpu.minutesMeetingId);
      setShowInterrupt(true);
      setSubmitting(false);
      return;
    }
    await startRecording();
  };

  // Confirmed from the popup: interrupt the running minutes generation (frees the GPU),
  // then start the recording.
  const interruptAndStart = async () => {
    setInterrupting(true);
    try {
      await abortMinutesAndSettle(interruptMeetingId);
    } finally {
      setInterrupting(false);
      setShowInterrupt(false);
    }
    await startRecording();
  };

  // Upload flow: create meeting -> upload audio -> transcribe -> minutes -> open detail.
  const handleFile = async (file: File) => {
    if (phase || submitting) return;
    setError(null);
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/") && !AUDIO_EXT.test(file.name)) {
      setError("Please drop an audio file (wav, mp3, m4a, ...).");
      return;
    }
    setPhase("creating");
    try {
      const meeting = await createMeeting(file.name);
      const base = sttHttpBase();

      setPhase("transcribing");
      // Glossary = global setting + the series' glossary (if the meeting joined one).
      let glossary = glossaryRef.current ?? "";
      try {
        const detail = (await fetch(`/api/meetings/${meeting.id}`).then((r) =>
          r.ok ? r.json() : null,
        )) as { series?: { sttGlossary?: string | null } | null } | null;
        glossary = [glossaryRef.current, detail?.series?.sttGlossary]
          .filter(Boolean)
          .join("、");
      } catch {
        // best-effort — the global glossary alone is fine
      }
      const qs = new URLSearchParams({
        language: effectiveSttLanguage(model, sttLanguage) ?? sttLanguage,
        model,
      });
      if (glossary) qs.set("initialPrompt", glossary);
      const up = await fetch(`${base}/upload/${meeting.id}?${qs}`, { method: "POST", body: file });
      if (!up.ok) {
        const d = await up.json().catch(() => null);
        throw new Error(d?.detail ?? `Upload failed (HTTP ${up.status})`);
      }
      let job = (await up.json()) as {
        status: string;
        utterances?: { start: number; end: number; text: string }[];
        detail?: string;
      };
      while (job.status === "running") {
        await new Promise((r) => setTimeout(r, 4000));
        job = (await fetch(`${base}/transcribe/${meeting.id}/status`).then((r) => r.json())) as typeof job;
      }
      if (job.status !== "done" || !Array.isArray(job.utterances)) {
        throw new Error(job.detail ?? "Transcription failed.");
      }

      const apply = await fetch(`/api/meetings/${meeting.id}/apply-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utterances: job.utterances }),
      });
      if (!apply.ok) {
        const d = await apply.json().catch(() => null);
        throw new Error(d?.error ?? `Failed to save transcript (HTTP ${apply.status})`);
      }
      await fetch(`/api/meetings/${meeting.id}/end`, { method: "POST" }).catch(() => {});

      setPhase("summarizing");
      // Best-effort: if another minutes generation is in progress (409), just open the detail
      // page — the user can generate later.
      await fetch("/api/claude/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: meeting.id }),
      }).catch(() => {});
      router.push(`/${meeting.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process the file.");
      setPhase(null);
    }
  };

  const selectClass = "input mt-1";
  const busy = Boolean(phase) || submitting;
  const phaseLabel =
    phase === "creating"
      ? "Creating meeting…"
      : phase === "transcribing"
        ? "Transcribing the audio… (this can take a few minutes)"
        : phase === "summarizing"
          ? "Generating minutes…"
          : null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">New meeting</h1>

      {/* Drag & drop an existing recording to skip live capture. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition ${
          dragOver
            ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
            : "border-[var(--border-strong)]"
        } ${busy || gpu.busy ? "opacity-60" : ""}`}
      >
        {phase ? (
          <p className="flex items-center justify-center gap-2 text-sm text-[var(--accent-sub)]">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
            {phaseLabel}
          </p>
        ) : (
          <>
            <p className="text-sm text-[var(--text-secondary)]">
              Drop an audio file here to transcribe and summarize (no live recording).
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">wav / mp3 / m4a / etc.</p>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy || gpu.busy}
              className="btn-outline mt-3"
              title={gpu.busy ? `Busy: ${gpu.label ?? "another GPU task is running"}` : undefined}
            >
              Choose file
            </button>
            {gpu.busy ? (
              <p className="mt-2 text-xs text-[var(--warning)]">{gpu.label} — please wait.</p>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>

      <form onSubmit={onSubmit} className="card space-y-4 p-6">
        <div>
          <label htmlFor="title" className="label">
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Weekly research sync #2"
            maxLength={200}
            autoFocus
            disabled={busy}
            className="input mt-1"
          />
        </div>

        <div>
          <label htmlFor="description" className="label">
            Purpose / agenda (metadata)
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Purpose, agenda, and background of the meeting. Improves minutes quality."
            rows={4}
            disabled={busy}
            className="input mt-1 resize-y"
          />
        </div>

        <div>
          <label htmlFor="series" className="label">
            Series (recurring meetings, optional)
          </label>
          <input
            id="series"
            type="text"
            list="series-options"
            value={series}
            onChange={(e) => setSeries(e.target.value)}
            placeholder="e.g. Weekly sync — links meetings so minutes carry context"
            maxLength={60}
            disabled={busy}
            className="input mt-1"
          />
          <datalist id="series-options">
            {seriesOptions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        {/* Recording settings for this meeting only. Defaults come from settings; changes here are
            not saved. Always expanded: picking the wrong model here is silent and costly, so these
            must be visible before the meeting is set up, not hidden behind a disclosure. */}
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            Recording settings (this meeting only)
          </p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Defaults come from the app settings. Changes here apply to this meeting only and do not
            change the settings. (Model and language also apply to dropped files.)
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="model" className="label">
                Transcription model
              </label>
              <select
                id="model"
                value={model}
                onChange={(e) => {
                  touched.current.add("model");
                  setModel(e.target.value);
                }}
                disabled={busy}
                className={selectClass}
              >
                {WHISPER_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
                {isKnownWhisperModel(model) ? null : (
                  <option value={model}>{model} (from settings)</option>
                )}
              </select>
              {/* A Japanese-only model transcribes any other language into garbage — and with a
                  glossary prompt it can return nothing at all, which looks like a broken mic. */}
              {isJapaneseOnlyModel(model) ? (
                <p className="mt-1 text-xs text-[var(--warning)]">
                  {sttLanguage === "en"
                    ? "This model only handles Japanese — an English meeting will not transcribe. Pick large-v3-turbo instead."
                    : "Japanese-only model: transcription is forced to Japanese. Use large-v3-turbo for meetings in any other language."}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="sttLanguage" className="label">
                Transcription language
              </label>
              <select
                id="sttLanguage"
                value={sttLanguage}
                onChange={(e) => setSttLanguage(e.target.value)}
                disabled={busy}
                className={selectClass}
              >
                <option value="auto">Auto (follow settings default)</option>
                <option value="ja">Japanese</option>
                <option value="en">English</option>
              </select>
            </div>

            <div>
              <label htmlFor="micMode" className="label">
                Microphone mode
              </label>
              <select
                id="micMode"
                value={micMode}
                onChange={(e) => {
                  touched.current.add("micMode");
                  setMicMode(e.target.value);
                }}
                disabled={busy}
                className={selectClass}
              >
                {MIC_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="source" className="label">
                Recording source
              </label>
              <select
                id="source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={busy}
                className={selectClass}
              >
                {SOURCES.map((s) =>
                  s.id === "mic" || displaySupported ? (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ) : null,
                )}
              </select>
              {!displaySupported ? (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  This device cannot capture PC audio (Chrome / Edge on desktop required).
                </p>
              ) : null}
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            The transcription language is saved on the meeting. Microphone mode and source apply to
            live recording only (source can also be switched while recording).
          </p>
        </div>

        {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}

        <div className="flex items-center justify-end gap-2">
          <Link href="/" className="btn-outline">
            Cancel
          </Link>
          <button type="submit" disabled={busy} className="btn-ink">
            {submitting ? "Setting up…" : "Set up meeting"}
          </button>
        </div>
      </form>

      {/* Interrupt-minutes confirmation. Recording needs the GPU that minutes generation
          (Ollama) is currently using, so offer to stop it and record now. */}
      {showInterrupt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-sm space-y-4 p-6">
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">
              Minutes are being generated
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Recording uses the GPU that minutes generation is running on. Interrupt the
              in-progress minutes so the meeting is ready to record? You can regenerate those
              minutes afterward.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowInterrupt(false)}
                disabled={interrupting}
                className="btn-outline"
              >
                Keep generating
              </button>
              <button
                type="button"
                onClick={() => void interruptAndStart()}
                disabled={interrupting}
                className="btn-ink"
              >
                {interrupting ? "Interrupting…" : "Interrupt & set up"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
