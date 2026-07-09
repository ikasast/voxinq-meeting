import type { Metadata } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { ConfirmProvider } from "./confirm-dialog";
import { GearIcon } from "./icons";
import { LogoutButton } from "./logout-button";
import { isExternalRequest } from "@/lib/is-tailnet";

// Latin uses Inter, Japanese falls back to Noto Sans JP (see globals.css).
const fontInter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fontNoto = Noto_Sans_JP({
  variable: "--font-noto-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Voxinq",
  description: "Self-hosted meeting minutes system",
  appleWebApp: { capable: true, title: "Voxinq", statusBarStyle: "black-translucent" },
};

export const viewport = {
  themeColor: "#0b1220",
};

function HeaderNav({ external }: { external: boolean }) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--header)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" aria-label="Voxinq home" className="flex items-center">
          {/* Show the logo per theme (.logo-dark/.logo-light in globals.css) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Voxinq" className="logo-dark h-9 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-light.svg" alt="Voxinq" className="logo-light h-9 w-auto" />
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/settings" className="btn-icon" title="Settings" aria-label="Settings">
            <GearIcon />
          </Link>
          {external ? (
            // Recording is Tailscale-internal only, so disable the create action on external access
            <span className="btn-ink cursor-not-allowed opacity-50" title="Recording is not available from an external network">
              + New meeting
            </span>
          ) : (
            <Link href="/new" className="btn-ink">
              + New meeting
            </Link>
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
    <html lang="ja" className={`${fontInter.variable} ${fontNoto.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
        {/* Theme is per device (localStorage). Apply before paint to avoid flicker */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("voxinq.theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`,
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
