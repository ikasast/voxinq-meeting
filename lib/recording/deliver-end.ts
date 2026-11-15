// What a stopped recording still has to do, after the screen has already said it stopped
// (app/recorder.tsx). Kept apart from the provider so the order can be tested without a page.
//
// 1. Stop the handle: the rest of the audio and `end` go to the service, which recognises the
//    last segment, saves the recording and says `closed` (bounded on the handle's side:
//    lib/stt/client.ts, lib/stt/native.ts). A start still opening is waited for and stopped.
// 2. Wait for the lines still being saved — the last one usually arrives during step 1 — so
//    whoever waits on this (ending the meeting, writing minutes) finds them on the server.
// 3. Wait for a stop before this one, if this was a start that was waiting for it.
// 4. Hand the GPU back, unless the same meeting is recording again: the card is that
//    recording's now.

export type Stoppable = { stop: () => Promise<void> };

export type DeliverEnd = {
  /** The handle, or the start still opening it. */
  handle: Stoppable | Promise<Stoppable> | null;
  /** The line saves in flight. Read after the handle has stopped, so saves it caused count. */
  saves: ReadonlySet<Promise<void>>;
  /** How long to wait for those saves. */
  savesMs: number;
  /** The stop before this one, still delivering. */
  earlier?: Promise<void>;
  /** Whether the card may be handed back now. */
  mayRelease: () => boolean;
  release: () => void;
};

export async function deliverEnd(d: DeliverEnd): Promise<void> {
  const h = d.handle instanceof Promise ? await d.handle.catch(() => null) : d.handle;
  await h?.stop().catch(() => {});
  if (d.saves.size > 0) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled([...d.saves]),
      new Promise((resolve) => {
        timer = setTimeout(resolve, d.savesMs);
      }),
    ]);
    clearTimeout(timer);
  }
  await d.earlier?.catch(() => {});
  if (d.mayRelease()) d.release();
}
