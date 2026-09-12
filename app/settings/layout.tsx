import type { ReactNode } from "react";
import { version } from "../../package.json";

// The version, at the bottom of Settings.
//
// A desktop shows it at the foot of the rail. A phone has no rail, and "which version is this"
// gets asked of a phone as often as of anything — usually straight after an update, to see
// whether it took. A layout rather than a line in the page because the page is a client
// component, and reading package.json there would ship all of it to the browser for one field.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <p className="mt-6 text-center text-xs tabular-nums text-[var(--text-muted)]">
        Voxinq Meeting v{version}
      </p>
    </>
  );
}
