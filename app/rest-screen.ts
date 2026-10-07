// How long the recording screen waits before it goes black. Per device, like the theme.
//
// It was a setting on the account, which made it one answer for two different screens: a phone
// recording from a pocket wants to rest (on an OLED panel the lit screen is most of the
// battery), a computer on the meeting table wants to keep showing the transcript. Now each
// device keeps its own, and one that has not chosen gets the answer for its kind: touch-first
// devices and the Android app rest after a minute, the rest never.

import { hasNativeRecorder } from "@/lib/stt/native";

/** The waits offered, in seconds. 0 = never. */
export const REST_SCREEN_SECONDS = [0, 30, 60, 300, 600] as const;

const KEY = "voxinq.restScreen";
const CHANGED = "voxinq:rest-screen";

export type Device = { app: boolean; touchFirst: boolean };

/** What a device that has not chosen gets. */
export function defaultRestSeconds(device: Device): number {
  return device.app || device.touchFirst ? 60 : 0;
}

/** The stored choice if it is one of the offered waits, otherwise the device's default. */
export function restSecondsFrom(stored: string | null, device: Device): number {
  const n = stored === null ? NaN : Number(stored);
  return (REST_SCREEN_SECONDS as readonly number[]).includes(n) ? n : defaultRestSeconds(device);
}

function thisDevice(): Device {
  return {
    app: hasNativeRecorder(),
    // A phone or a tablet: no hover, and a finger for a pointer. A laptop with a touch screen
    // still has a mouse or a pad, so it counts as a computer.
    touchFirst: window.matchMedia("(hover: none) and (pointer: coarse)").matches,
  };
}

function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // a private window: the default for the device
  }
}

/** For useSyncExternalStore: the wait for this device. */
export function readRestSeconds(): number {
  return restSecondsFrom(stored(), thisDevice());
}

export function writeRestSeconds(seconds: number): void {
  try {
    localStorage.setItem(KEY, String(seconds));
  } catch {
    // No storage: the choice lasts as long as the page.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** For useSyncExternalStore: another tab, or Settings in this one, changed it. */
export function subscribeRestSeconds(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGED, onChange);
  };
}
