"use client";

import { hasNativeRecorder } from "@/lib/stt/native";

// Meeting reminders as notifications on this device: whether they can be shown here, asking
// for them, and showing one. Shared by the due-meeting banner and Settings.
//
// Asking used to be possible only from the banner, which appears only once a meeting is due —
// so the first reminder on a computer could never be a notification. Settings can ask ahead.

/** Remembered per device, so the banner does not offer what was already answered. */
export const ASKED_KEY = "voxinq.notifyAsked";

export type NotifyState =
  /** The Android app: it sets its own reminders, which the phone's settings govern. */
  | "app"
  /** Notifications need https (or localhost); over plain http there is no API to ask. */
  | "insecure"
  | "unsupported"
  | NotificationPermission;

export function notifyState(): NotifyState {
  if (hasNativeRecorder()) return "app";
  if (typeof window !== "undefined" && window.isSecureContext === false) return "insecure";
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/** Ask the browser. The answer is the browser's to keep; the key only stops the banner asking. */
export async function askToNotify(): Promise<NotifyState> {
  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // fine — the browser remembers its own answer
  }
  if (typeof Notification === "undefined") return notifyState();
  await Notification.requestPermission();
  return notifyState();
}

/**
 * Show a notification that opens `url` when clicked.
 *
 * Through the service worker where there is one: a notification owned by the page dies with the
 * tab, and the point is to reach somebody looking at another window. `data.url` is what sw.js
 * opens. Resolves false when nothing could be shown.
 */
export async function showNotification(title: string, body: string, url: string, tag: string): Promise<boolean> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  try {
    // `ready` never settles when registering failed (private mode, a policy), so not for ever.
    const reg = await Promise.race([
      navigator.serviceWorker?.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: "/icons/icon-192.png", data: { url } });
      return true;
    }
  } catch {
    // fall through to the page's own
  }
  try {
    new Notification(title, { body, tag });
    return true;
  } catch {
    // Some browsers only allow the service-worker form. Nothing to fall back to.
    return false;
  }
}
