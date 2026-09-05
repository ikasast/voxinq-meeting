"use client";

import { useRef, useState } from "react";
import { Avatar } from "../avatar";

// Your name and your face.
//
// The picture is cropped square and resized to 256px **in the browser**, before it is sent. A
// phone camera produces something in the megabytes and none of that detail survives being drawn
// at twenty-six pixels beside a queue row — sending it would only put a photograph in the
// database and in every backup.

const SIZE = 256;

export function ProfileForm({
  username,
  name: initialName,
  hasImage: initialHasImage,
}: {
  username: string;
  name: string | null;
  hasImage: boolean;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [hasImage, setHasImage] = useState(initialHasImage);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (chosen: File) => {
    setError(null);
    setMsg(null);
    try {
      const square = await cropToSquare(chosen, SIZE);
      setFile(square);
      setPreview(URL.createObjectURL(square));
    } catch {
      setError("That file could not be read as an image.");
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const body = new FormData();
      body.set("name", name);
      if (file) body.set("image", new File([file], "avatar.png", { type: "image/png" }));
      const res = await fetch("/api/auth/profile", { method: "POST", body });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      if (file) setHasImage(true);
      setFile(null);
      setMsg("Saved.");
      // The picture is served from a URL that has not changed, so the page has to be told.
      if (file) window.location.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async () => {
    setBusy(true);
    try {
      const body = new FormData();
      body.set("removeImage", "1");
      await fetch("/api/auth/profile", { method: "POST", body });
      window.location.reload();
    } catch {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="card space-y-3 p-4">
      <h2 className="text-sm font-medium text-[var(--text-strong)]">Name and picture</h2>

      <div className="flex items-center gap-3">
        {preview ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={preview}
            alt=""
            aria-hidden
            className="h-14 w-14 shrink-0 rounded-full border border-[var(--border)] object-cover"
          />
        ) : (
          <Avatar username={username} name={name} hasImage={hasImage} size={56} />
        )}
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pick(f);
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="btn-outline !px-3 !py-1 !text-xs"
          >
            {hasImage || preview ? "Choose another" : "Choose a picture"}
          </button>
          {hasImage && !preview ? (
            <button
              type="button"
              onClick={() => void removeImage()}
              disabled={busy}
              className="btn-outline !px-3 !py-1 !text-xs text-[var(--error)]"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Shown as a circle, so anything outside the middle square is trimmed. It is resized to{" "}
        {SIZE}px here before it is sent — the original never leaves this device.
      </p>

      <div>
        <label htmlFor="displayName" className="label">
          Display name
        </label>
        <input
          id="displayName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={username}
          disabled={busy}
          className="input mt-1"
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          What other people see beside your work in the queue. Empty falls back to your username.
        </p>
      </div>

      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
      {msg ? <p className="text-sm text-[var(--accent-sub)]">{msg}</p> : null}
      <button type="submit" disabled={busy} className="btn-ink">
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

/**
 * Centre-crop to a square and scale to `size`, as a PNG.
 *
 * Done here rather than on the server so the original never leaves the device, and so what is
 * stored is the few kilobytes that are actually drawn.
 */
async function cropToSquare(file: File, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/png"),
  );
}
