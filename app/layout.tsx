import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import { ConfirmProvider } from "./confirm-dialog";
import { GearIcon, MicIcon } from "./icons";
import { LogoutButton } from "./logout-button";
import { ThemeToggle } from "./theme-toggle";
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
  appleWebApp: { capable: true, title: "Voxinq Meeting", statusBarStyle: "black-translucent" },
};

export const viewport = {
  themeColor: "#0b1220",
};

function HeaderNav({ external }: { external: boolean }) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--header)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" aria-label="Voxinq Meeting home" className="flex items-center">
          {/* Show the logo per theme (.logo-dark/.logo-light in globals.css) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Voxinq Meeting" className="logo-dark h-9 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-light.svg" alt="Voxinq Meeting" className="logo-light h-9 w-auto" />
        </Link>
        <nav className="flex items-center gap-2">
          {/* External visitors cannot open Settings, so the theme control comes to them.
              Internal users keep using Settings → Appearance, which has the same three
              choices with labels. */}
          {external ? <ThemeToggle /> : null}
          {/* External (read-only) access hides settings/record/new — only viewing + downloads. */}
          {external ? null : (
            <>
              <Link href="/settings" className="btn-icon" title="Settings" aria-label="Settings">
                <GearIcon />
              </Link>
              <Link
                href="/quick-record"
                className="btn-icon"
                title="One-tap record"
                aria-label="One-tap record"
              >
                <MicIcon />
              </Link>
              <Link href="/new" className="btn-ink">
                + New
              </Link>
            </>
          )}
          {process.env.APP_PASSWORD ? <LogoutButton /> : null}
        </nav>
      </div>
    </header>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const external = await isExternalRequest();
  return (
    <html lang="ja" className={`${fontInter.variable} h-full antialiased`}>
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
        <ConfirmProvider>
          <HeaderNav external={external} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        </ConfirmProvider>
      </body>
    </html>
  );
}
