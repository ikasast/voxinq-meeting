"use client";

import Link from "next/link";
import { useT } from "@/app/locale-provider";
import { AppLockPolicy } from "@/app/settings/app-lock-policy";
import { ExtensionsSettings } from "@/app/settings/extensions-settings";
import { HouseDefaults } from "@/app/settings/house-defaults";
import { MachineSettings } from "./machine-settings";
import { PeopleList } from "./people-list";
import type { ExtensionId } from "@/lib/extensions";
import type { SttAuthState } from "@/lib/stt/auth-state";
import { ADMIN_TABS, type AdminTab } from "./tabs";

// The administration screen's tabs (app/admin/page.tsx). A tab is a link with ?tab=, so a tab can
// be linked to and the browser's Back goes through them.

export function AdminScreen({
  tab,
  meId,
  accounts,
  signupOpen,
  openExtension = null,
  sttAuth = "signed",
}: {
  tab: AdminTab;
  meId: string | null;
  accounts: boolean;
  signupOpen: boolean;
  /** An extension whose card opens with the tab. */
  openExtension?: ExtensionId | null;
  /** Whether the transcription service answers only this app (lib/stt/auth-state.ts). */
  sttAuth?: SttAuthState;
}) {
  const t = useT();
  const sttProblem =
    sttAuth === "open"
      ? t(
          "The transcription service answers any device that can reach it, recordings included. Fetch the current docker-compose.yml from the release branch and restart, or give the web app and the service the same STT_SECRET.",
        )
      : sttAuth === "mismatch"
        ? t(
            "The transcription service expects a secret this app does not have, so recording and playback fail. Give the web app and the service the same STT_SECRET.",
          )
        : null;
  const label: Record<AdminTab, string> = {
    people: t("People"),
    defaults: t("Defaults for everyone"),
    machine: t("This machine"),
    extensions: t("Extensions"),
    security: t("Security"),
  };

  return (
    <div data-paper className="mx-auto max-w-5xl space-y-5 pt-2 lg:pt-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{t("Administration")}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {t("What describes this server and everybody on it. Your own preferences are under Settings.")}
        </p>
      </div>

      {sttProblem ? (
        <p
          role="alert"
          className="rounded-md border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          {sttProblem}
        </p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label={t("Administration")} className="flex gap-1 overflow-x-auto md:flex-col">
          {ADMIN_TABS.map((id) => (
            <Link
              key={id}
              href={`/admin?tab=${id}`}
              aria-current={id === tab ? "page" : undefined}
              className={`shrink-0 rounded-md px-3 py-2 text-sm ${
                id === tab
                  ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-medium text-[var(--text-strong)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--hover-surface)]"
              }`}
            >
              {label[id]}
            </Link>
          ))}
        </nav>

        <div className="min-w-0">
          <h2 className="mb-3 text-lg font-semibold text-[var(--text-strong)]">{label[tab]}</h2>

          {tab === "people" ? (
            accounts && meId ? (
              <PeopleList meId={meId} title="" intro={t("Who can use this server, and how they sign in.")} />
            ) : (
              <div className="space-y-2 text-sm text-[var(--text-secondary)]">
                <p>{t("There are no accounts yet: whoever reaches this server uses it as one.")}</p>
                <p>
                  <Link href="/setup" className="text-[var(--accent-sub)] hover:underline">
                    {t("Create the first account")}
                  </Link>{" "}
                  — {t("it becomes the administrator, and everything recorded so far becomes its.")}
                </p>
              </div>
            )
          ) : null}

          {tab === "defaults" ? <HouseDefaults /> : null}
          {tab === "machine" ? <MachineSettings /> : null}
          {tab === "extensions" ? <ExtensionsSettings isAdmin initialOpen={openExtension} /> : null}

          {tab === "security" ? (
            <div className="space-y-6">
              <AppLockPolicy />
              <section className="space-y-1 border-t border-[var(--border)] pt-6">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("New accounts")}</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  {signupOpen
                    ? t("Open: somebody new on the tailnet becomes an account the first time they arrive.")
                    : t("Closed: only an administrator makes accounts.")}
                </p>
                <p className="text-xs text-[var(--text-muted)]">{t("Set with VOXINQ_SIGNUP in .env.")}</p>
              </section>
              <section className="space-y-1 border-t border-[var(--border)] pt-6">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("Transcription service")}</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  {sttAuth === "signed"
                    ? t("Answers this app only: every request to it is signed, and a recording carries a token for its own meeting.")
                    : sttAuth === "unknown"
                      ? t("Could not be reached, so whether it answers only this app is not known.")
                      : sttProblem}
                </p>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
