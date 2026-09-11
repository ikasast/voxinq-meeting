import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import { ConfirmProvider } from "./confirm-dialog";
import { currentUser } from "@/lib/auth/session";
import { currentLocale, serverT } from "@/lib/i18n/server";
import { hasKey } from "@/lib/crypto/key-cache";
import { prisma } from "@/lib/prisma";
import { AccountMenu } from "./account-menu";
import { ThemeToggle } from "./theme-toggle";
import { BottomBar } from "./bottom-bar";
import { LocaleProvider } from "./locale-provider";
import { DueMeetingAlert } from "./due-meeting-alert";
import { LockedBanner } from "./locked-banner";
import { InstallApp } from "./install-app";
import { version as appVersion } from "../package.json";
import { SideRail } from "./side-rail";
import { NewMeetingLink } from "./new-meeting-link";
import { SeriesIcon } from "./icons";
import { isExternalRequest } from "@/lib/is-tailnet";

// Latin text uses Inter, shipped with the repo rather than fetched from Google.
//
// `next/font/google` downloads at BUILD time and caches the URLs it was given. When Google
// rotated the Noto Sans JP files those cached URLs began returning 404 and the build failed —
// on a project whose whole point is not depending on anyone else's servers. A local file
// cannot break that way, and the build no longer needs the network at all.
//
// Only the latin subset is bundled (48 KB): the interface is English, and Japanese content is
// rendered by the OS fonts listed in globals.css. Bundling Japanese too would have meant
// 5.4 MB even as a variable font.
const fontInter = localFont({
  src: "./fonts/Inter-latin-variable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Voxinq Meeting",
  description: "Self-hosted meeting minutes system",
  appleWebApp: {
    capable: true,
    title: "Voxinq Meeting",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  themeColor: "#0b1220",
};

// The top bar, now only on screens too narrow for the rail. It keeps the full logo because
// there is room for it here and it is the only place the app names itself on a phone.
function HeaderNav({
  external,
  me,
  t,
}: {
  t: (key: string) => string;
  external: boolean;
  me: {
    username: string;
    name: string | null;
    hasImage: boolean;
    isAdmin: boolean;
    via: "session" | "tailnet";
  } | null;
}) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--header)] lg:hidden">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-3">
        <Link
          href="/"
          aria-label={t("Voxinq Meeting home")}
          className="flex items-center"
        >
          {/* Show the logo per theme (.logo-dark/.logo-light in globals.css) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="Voxinq Meeting"
            className="logo-dark h-9 w-auto"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-light.svg"
            alt="Voxinq Meeting"
            className="logo-light h-9 w-auto"
          />
        </Link>
        <nav className="flex items-center gap-2">
          {/* External visitors cannot open Settings, so the theme control comes to them.
              Internal users keep using Settings → Appearance, which has the same three
              choices with labels. */}
          {external ? <ThemeToggle /> : null}
          {/* The bottom bar carries Series on a phone, and it is not rendered for an external
              visitor at all — so for them the way to the series list comes up here. */}
          {external ? (
            <Link
              href="/series"
              aria-label={t("Series")}
              title={t("Series")}
              className="p-1 text-[var(--text-secondary)] hover:text-[var(--foreground)]"
            >
              <SeriesIcon className="h-6 w-6" />
            </Link>
          ) : null}
          {/* Only renders where it can actually install; see install-app.tsx. Offered to
              external visitors too — installing changes how the page opens, not what it
              lets anyone do. */}
          <InstallApp />
          {/* Recording and the queue are on the bottom bar now, where a thumb reaches them.
              What is left up here is the deliberate path — setting a meeting up rather than
              starting one — and it can afford to say so: with two icons gone there is room for
              the word, and "+ New" alone never said new *what*.

              Shown from outside too. Setting a meeting up is allowed from there, and on a phone
              outside the tailnet this is the only way to it: the bottom bar is all recording and
              is not rendered at all. Not on the sign-in screens, though — see NewMeetingLink. */}
          <NewMeetingLink />
          {me ? (
            <AccountMenu
              username={me.username}
              name={me.name}
              hasImage={me.hasImage}
              isAdmin={me.isAdmin}
              via={me.via}
            />
          ) : null}
        </nav>
      </div>
    </header>
  );
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const external = await isExternalRequest();
  // Asked here because the layout renders on every page and has to say who you are anyway.
  // It is also where a tailnet identity becomes an account: the header showing a name is the
  // first moment the app has ever needed to know which person is looking at it.
  const me = await currentUser();
  // Whether there is a picture, without carrying its bytes into the HTML of every page.
  const meWithImage = me
    ? {
        ...me,
        hasImage:
          (
            await prisma.user.findUnique({
              where: { id: me.id },
              select: { imageType: true },
            })
          )?.imageType != null,
      }
    : null;
  // Has a key, and it is shut. Both halves matter: an account with no key at all is not locked,
  // it is unencrypted, and telling that person to unlock something would be a sentence about a
  // thing they do not have.
  const locked = me
    ? Boolean(
        (
          await prisma.user.findUnique({
            where: { id: me.id },
            select: { keySalt: true },
          })
        )?.keySalt,
      ) && !(await hasKey(me.id))
    : false;
  // The docs index, on the tag this instance is running. package.json only moves when a
  // release is cut, so the tag it names always exists -- pointing at main would instead
  // describe whatever has landed since, including things this build does not have.
  const docsUrl = `https://github.com/ikasast/voxinq-meeting/blob/v${appVersion}/docs/README.md`;
  // Resolved here, once, and handed down. Fetching it in the browser would paint English and
  // then swap under somebody already reading.
  const locale = await currentLocale();
  const t = await serverT();
  return (
    // `lang` was hard-coded to "ja" while every screen was in English, which is a lie told to
    // screen readers and to the browser's own translation offer.
    <html lang={locale} className={`${fontInter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
        {/* Where the browser should reach the STT service, read from the environment at
            request time. The build-time NEXT_PUBLIC_ value still applies when this is unset,
            so building from source is unchanged — but a published image cannot bake in a URL
            that only the person running it knows, and recording from a phone needs exactly
            that. Set STT_WS_URL to override without rebuilding. */}
        {process.env.STT_WS_URL ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__VOXINQ_STT_WS__=${JSON.stringify(process.env.STT_WS_URL)}`,
            }}
          />
        ) : null}
        {/* Theme is per device (localStorage), applied before paint so there is no flash of
            the wrong one. Unset or unrecognised means "system", which is resolved here rather
            than after hydration — otherwise a light-mode OS would flash dark on every load.
            Kept in sync with lib/theme.ts, which cannot be imported into an inline script. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("voxinq.theme");if(t!=="light"&&t!=="dark")t="system";if(t==="light"||(t==="system"&&matchMedia("(prefers-color-scheme: light)").matches))document.documentElement.dataset.theme="light"}catch(e){}`,
          }}
        />
        <LocaleProvider locale={locale}>
          <ConfirmProvider>
            <div className="flex min-h-full flex-1">
              <SideRail
                external={external}
                docsUrl={docsUrl}
                version={appVersion}
                isAdmin={me?.isAdmin ?? false}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <HeaderNav external={external} me={meWithImage} t={t} />
                {/* Above everything, because until it is dealt with nothing below it can be read. */}
                {locked ? <LockedBanner /> : null}
                {/* Below the lock and above the page: a meeting starting is worth interrupting
                    for, but not worth interrupting an account that cannot read anything yet. */}
                {locked ? null : <DueMeetingAlert external={external} />}
                {/* The rail carries navigation on wide screens, but not the controls that only
                  make sense per-device or per-session — those keep a home along the top. */}
                <div className="hidden justify-end gap-2 px-4 pt-3 lg:flex">
                  {external ? <ThemeToggle /> : null}
                  <InstallApp />
                  {meWithImage ? (
                    <AccountMenu
                      username={meWithImage.username}
                      name={meWithImage.name}
                      hasImage={meWithImage.hasImage}
                      isAdmin={meWithImage.isAdmin}
                      via={meWithImage.via}
                    />
                  ) : null}
                </div>
                <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6">
                  {children}
                </main>
                {/* Narrow layouts only; the rail is this on a desktop. It renders its own spacer,
                  so nothing ends up underneath it. */}
                <BottomBar external={external} />
              </div>
            </div>
          </ConfirmProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
