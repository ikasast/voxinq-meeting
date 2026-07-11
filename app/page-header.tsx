import { HealthStatus } from "./health-status";

// Page header shared by the home and meeting-detail pages.
// So selecting a meeting in the 2-pane UI keeps the header and looks like "the same screen".
export function PageHeader({ external }: { external: boolean }) {
  return (
    <div className="space-y-3">
      {external ? (
        <div className="rounded-md border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-3 py-2 text-sm text-[var(--warning)]">
          Accessing from an external network. <strong>Recording works over Tailscale only.</strong>
          You can still view, generate, and share minutes here.
        </div>
      ) : null}
      <HealthStatus showStt={!external} />
    </div>
  );
}
