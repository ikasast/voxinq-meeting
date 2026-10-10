"use client";

import { useEffect, useState } from "react";
import { SELF_UPDATE_FROM, appVersionFrom, compareVersions, releasePage } from "@/lib/app-version";
import { type AppUpdateState, askAppToUpdate } from "@/lib/stt/native";
import { useT } from "./locale-provider";
import { CloseIcon, DownloadIcon } from "./icons";

const DISMISSED = "voxinq.appUpdateDismissed";

// In the Android app, when the app is behind the server it talks to: a line at the top offering
// the update (4.0). The app fetches that version's APK and Android asks once to install it — the
// most there is outside the Play Store. An app from before this could not update itself, so it is
// sent to the release page, where the APK is, instead.
//
// "Later" hides it until the server moves to another version.
export function AppUpdate({ serverVersion }: { serverVersion: string }) {
  const t = useT();
  const [app, setApp] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [progress, setProgress] = useState<AppUpdateState | null>(null);

  useEffect(() => {
    setApp(appVersionFrom(navigator.userAgent));
    try {
      setDismissed(localStorage.getItem(DISMISSED) === serverVersion);
    } catch {
      setDismissed(false);
    }
  }, [serverVersion]);

  if (!app || dismissed || compareVersions(app, serverVersion) >= 0) return null;
  const canSelf = compareVersions(app, SELF_UPDATE_FROM) >= 0;

  const later = () => {
    try {
      localStorage.setItem(DISMISSED, serverVersion);
    } catch {}
    setDismissed(true);
  };

  const status =
    progress?.state === "downloading"
      ? t("Downloading… {percent}%", { percent: progress.percent ?? 0 })
      : progress?.state === "installing"
        ? t("Confirm the update on the screen that opens.")
        : progress?.state === "permission"
          ? t("Allow Voxinq to install apps, then come back.")
          : progress?.state === "failed"
            ? t("Could not update ({reason}).", { reason: progress.reason ?? "" })
            : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--btn-primary-border)] bg-[var(--btn-primary-bg)] px-4 py-2 text-sm text-[var(--btn-primary-text)] lg:px-8">
      <span className="min-w-0 flex-1">
        {status ?? t("A newer app is available ({version}).", { version: serverVersion })}
      </span>
      {canSelf ? (
        progress && progress.state !== "failed" ? null : (
          <button
            type="button"
            onClick={() => askAppToUpdate(serverVersion, setProgress)}
            className="inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline"
          >
            <DownloadIcon className="h-4 w-4" />
            {t("Update")}
          </button>
        )
      ) : (
        // Opens outside the app (the app sends any other site to the browser), where the APK
        // downloads and installs over this one.
        <a href={releasePage(serverVersion)} className="inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline">
          <DownloadIcon className="h-4 w-4" />
          {t("Get it")}
        </a>
      )}
      <button type="button" onClick={later} title={t("Later")} aria-label={t("Later")} className="opacity-70 hover:opacity-100">
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
