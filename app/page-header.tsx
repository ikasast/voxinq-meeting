import { serverT } from "@/lib/i18n/server";
import { HealthStatus } from "./health-status";

// Page header shared by the home and meeting-detail pages.
// So selecting a meeting in the 2-pane UI keeps the header and looks like "the same screen".
export async function PageHeader({ external }: { external: boolean }) {
  const t = await serverT();
  return (
    <div className="space-y-3">
      {external ? (
        <div className="rounded-md border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-3 py-2 text-sm text-[var(--warning)]">
          {/* Two sentences, two keys. Splitting inside one of them to keep the <strong>
              around "read-only" would fix the order of the fragments, and Japanese does not
              put them in that order. */}
          <strong>
            {t("Accessing from outside your private network — read-only.")}
          </strong>{" "}
          {t(
            "You can view and download minutes and transcripts here; recording, editing and deleting are available on your local network only.",
          )}
        </div>
      ) : null}
      <HealthStatus showStt={!external} />
    </div>
  );
}
