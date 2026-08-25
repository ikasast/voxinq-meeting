"use client";

// "Install app" — the PWA route to something that looks and launches like a desktop app,
// without a signed installer, a download, or any of the cost that comes with those.
//
// It appears only when it can actually do something. Chromium fires `beforeinstallprompt`
// when a page qualifies and is not already installed, so that event *is* the condition —
// nothing here has to guess at browser support. Safari never fires it and has no API to
// install from, so iOS gets the two-step instruction instead and desktop Safari gets nothing,
// because there is nothing useful to say there.

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "voxinq.install-dismissed";

/** iOS Safari: no install event, no API, and "Add to Home Screen" is buried in the share sheet. */
function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/** Already installed? Then there is nothing to offer. */
function isInstalled() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS reports it here rather than through display-mode.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(true); // assume hidden until the check runs

  // Registering it is what makes the browser consider the app installable at all; see
  // public/sw.js, which caches nothing on purpose.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Blocked by policy or private mode. The app works; it just cannot be installed.
    });
  }, []);

  useEffect(() => {
    if (isInstalled()) return;
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
    } catch {
      // Private mode with storage blocked: showing the offer is the better failure.
    }
    setDismissed(false);

    const onPrompt = (e: Event) => {
      // Without this Chromium shows its own mini-infobar, and the saved event is what lets the
      // offer live in the header instead.
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to do; it simply asks again next time.
    }
  };

  if (dismissed) return null;

  // The tooltips say what is being installed, because the obvious reading is the wrong one:
  // the first person to meet this button asked whether it was installing the server.
  if (prompt) {
    return (
      <button
        type="button"
        className="btn-icon"
        title="Adds Voxinq to this device as its own window, without the browser bars. It is the same app talking to the same machine — nothing new is installed to run it. Most worthwhile on the phone you record with."
        aria-label="Install app"
        onClick={async () => {
          await prompt.prompt();
          const { outcome } = await prompt.userChoice;
          setPrompt(null);
          // "Not now" is an answer about this moment, not forever. Only a deliberate dismissal
          // of our own control is remembered.
          if (outcome === "accepted") hide();
        }}
      >
        <InstallIcon />
      </button>
    );
  }

  if (isIosSafari()) {
    return (
      <>
        <button
          type="button"
          className="btn-icon"
          title="Adds Voxinq to your home screen as its own window, without the browser bars. It is the same app talking to the same machine — nothing new is installed to run it."
          aria-label="Add to home screen"
          onClick={() => setShowIosHelp(true)}
        >
          <InstallIcon />
        </button>
        {showIosHelp ? (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setShowIosHelp(false)}
          >
            <div
              className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-medium text-[var(--text-strong)]">Add to your home screen</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--text-secondary)]">
                <li>Tap the share button at the bottom of Safari</li>
                <li>Choose &ldquo;Add to Home Screen&rdquo;</li>
              </ol>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                It then opens from your home screen without the browser bars. It is the same
                app talking to the same machine — nothing new is installed to run it, and it
                still needs that machine to be on.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className="btn-outline text-xs" onClick={hide}>
                  Don&rsquo;t show again
                </button>
                <button type="button" className="btn-ink text-xs" onClick={() => setShowIosHelp(false)}>
                  Got it
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  // Safari on the desktop, Firefox, an already-installed copy: nothing to offer.
  return null;
}

function InstallIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}
