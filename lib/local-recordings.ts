// Recordings kept in this browser, waiting to be sent to the server.
//
// Two kinds land here. A **copy** of a recording to the server, kept while it runs (lib/stt/client.ts):
// the same 16 kHz PCM the transcription service is sent, so that audio lost to a long drop — more
// than the five minutes the page holds in memory — or to a tab that was closed can still reach
// the server afterwards. It is thrown away when the recording ends with everything delivered. And
// a recording made on the **offline page** (public/offline.html) while the server could not be
// reached at all, in whatever the browser's MediaRecorder produces.
//
// IndexedDB, one record per recording and its audio in chunks beside it, so a long recording is
// appended to rather than rewritten. public/offline.html opens the same database with the same
// shape: change one, change the other.

export const DB_NAME = "voxinq-local";

/** Sent on `window` when a recording is kept to be sent, so whatever lists them looks again. */
export const LOCAL_KEPT_EVENT = "voxinq:local-kept";
const DB_VERSION = 1;

export type LocalKind = "copy" | "offline";

export type LocalRecording = {
  id: string;
  kind: LocalKind;
  /** "pcm16k" (raw 16 kHz mono 16-bit) or "media" (a MediaRecorder file of `mimeType`). */
  format: "pcm16k" | "media";
  mimeType?: string;
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  /** "recording" while it is being written; "waiting" once it is to be sent. */
  state: "recording" | "waiting";
  bytes: number;
  /** For a copy: the meeting it is a copy of, and what it was called. */
  meetingId?: string;
  title?: string;
  /**
   * For a copy: whether the server was missing some of it at the last write — the connection was
   * down, or audio had been dropped. A copy cut off while the server had all of it is not kept.
   */
  behind?: boolean;
  /** The meeting a send created, so a send cut short is finished there rather than doubled. */
  sentAs?: string;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("recordings")) db.createObjectStore("recordings", { keyPath: "id" });
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks", { keyPath: ["id", "seq"] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function createLocal(meta: Pick<LocalRecording, "kind" | "format" | "mimeType" | "meetingId" | "title">): Promise<string> {
  const db = await open();
  const now = Date.now();
  const rec: LocalRecording = { id: `${now}-${Math.random().toString(36).slice(2, 8)}`, startedAt: now, updatedAt: now, state: "recording", bytes: 0, ...meta };
  const tx = db.transaction("recordings", "readwrite");
  tx.objectStore("recordings").put(rec);
  await done(tx);
  db.close();
  return rec.id;
}

export async function appendLocal(id: string, seq: number, data: ArrayBuffer | Blob, patch?: Pick<LocalRecording, "behind">): Promise<void> {
  const db = await open();
  const tx = db.transaction(["recordings", "chunks"], "readwrite");
  tx.objectStore("chunks").put({ id, seq, data });
  const recs = tx.objectStore("recordings");
  const rec = (await request(recs.get(id))) as LocalRecording | undefined;
  if (rec) {
    rec.bytes += data instanceof Blob ? data.size : data.byteLength;
    rec.updatedAt = Date.now();
    recs.put({ ...rec, ...patch });
  }
  await done(tx);
  db.close();
}

/** The recording is over: kept to be sent, or — a copy with nothing missing — thrown away. */
export async function finishLocal(id: string, keep: boolean): Promise<void> {
  if (!keep) return removeLocal(id);
  const db = await open();
  const tx = db.transaction("recordings", "readwrite");
  const store = tx.objectStore("recordings");
  const rec = (await request(store.get(id))) as LocalRecording | undefined;
  if (rec) store.put({ ...rec, state: "waiting", endedAt: Date.now() });
  await done(tx);
  db.close();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LOCAL_KEPT_EVENT));
}

/**
 * What is waiting to be sent, oldest first. A recording still marked "recording" that has not
 * been written to for a minute was cut off — a closed tab, a crash — and is waiting too, unless
 * it is a copy the server was not behind on: that one is only a duplicate, and is thrown away.
 */
export async function listLocal(): Promise<LocalRecording[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await open();
  const all = (await request(db.transaction("recordings").objectStore("recordings").getAll())) as LocalRecording[];
  db.close();
  const stale = Date.now() - 60_000;
  const cutOff = (r: LocalRecording) => r.state === "recording" && r.updatedAt < stale;
  const waiting: LocalRecording[] = [];
  for (const r of all) {
    if (cutOff(r) && (r.bytes === 0 || (r.kind === "copy" && !r.behind))) await removeLocal(r.id).catch(() => {});
    else if (r.bytes > 0 && (r.state === "waiting" || cutOff(r))) waiting.push(r);
  }
  return waiting.sort((a, b) => a.startedAt - b.startedAt);
}

/** The audio as one file: a WAV for the copy's PCM, the recorder's own file otherwise. */
export async function fileOf(rec: LocalRecording): Promise<Blob> {
  const db = await open();
  const range = IDBKeyRange.bound([rec.id, 0], [rec.id, Number.MAX_SAFE_INTEGER]);
  const chunks = (await request(db.transaction("chunks").objectStore("chunks").getAll(range))) as { data: ArrayBuffer | Blob }[];
  db.close();
  const parts = chunks.map((c) => c.data);
  if (rec.format === "pcm16k") {
    const size = parts.reduce((a, p) => a + (p instanceof Blob ? p.size : p.byteLength), 0);
    return new Blob([wavHeader(size), ...parts], { type: "audio/wav" });
  }
  return new Blob(parts, { type: rec.mimeType || "audio/webm" });
}

async function markSent(id: string, meetingId: string): Promise<void> {
  const db = await open();
  const tx = db.transaction("recordings", "readwrite");
  const store = tx.objectStore("recordings");
  const rec = (await request(store.get(id))) as LocalRecording | undefined;
  if (rec) store.put({ ...rec, sentAs: meetingId });
  await done(tx);
  db.close();
}

export async function removeLocal(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(["recordings", "chunks"], "readwrite");
  tx.objectStore("recordings").delete(id);
  tx.objectStore("chunks").delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
  await done(tx);
  db.close();
}

/** The 44 bytes that make 16 kHz mono 16-bit PCM a WAV file. */
export function wavHeader(dataBytes: number, sampleRate = 16_000): ArrayBuffer {
  const b = new DataView(new ArrayBuffer(44));
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => b.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  b.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true); // PCM
  b.setUint16(22, 1, true); // mono
  b.setUint32(24, sampleRate, true);
  b.setUint32(28, sampleRate * 2, true);
  b.setUint16(32, 2, true);
  b.setUint16(34, 16, true);
  ascii(36, "data");
  b.setUint32(40, dataBytes, true);
  return b.buffer;
}

/**
 * Send one to the server: a meeting dated for when it was recorded, its audio, and the
 * recognition queued — the path a dropped-in file takes (app/transcribe-file.ts). A copy is
 * named after the meeting it is a copy of, so the two are told apart in the list.
 */
export async function sendLocal(rec: LocalRecording, copyTitle: (title: string) => string): Promise<string> {
  const file = await fileOf(rec);
  const started = new Date(rec.startedAt).toISOString();
  const create = async () => {
    const created = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: rec.kind === "copy" && rec.title ? copyTitle(rec.title) : "", recordedAt: started }),
    });
    if (!created.ok) throw new Error(`HTTP ${created.status}`);
    const { id } = (await created.json()) as { id: string };
    await markSent(rec.id, id).catch(() => {});
    return id;
  };
  const upload = (id: string) =>
    fetch(`/api/meetings/${id}/recording`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
  // A send cut short — the tab closed, the connection dropped — left a meeting with nothing in
  // it: this one goes there. Deleted since, it is made again.
  let id = rec.sentAs ?? (await create());
  let up = await upload(id);
  if (up.status === 404 && rec.sentAs) {
    id = await create();
    up = await upload(id);
  }
  // Already transcribed there: the earlier send got through, and only the clean-up did not.
  if (up.status === 409 && rec.sentAs) {
    await removeLocal(rec.id);
    return id;
  }
  if (!up.ok) {
    await fetch(`/api/meetings/${id}`, { method: "DELETE" }).catch(() => {});
    const d = (await up.json().catch(() => null)) as { error?: string } | null;
    throw new Error(d?.error ?? `HTTP ${up.status}`);
  }
  await fetch(`/api/meetings/${id}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startedAt: started }),
  }).catch(() => {});
  await fetch(`/api/meetings/${id}/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  await removeLocal(rec.id);
  return id;
}
