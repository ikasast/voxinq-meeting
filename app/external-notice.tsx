import { serverT } from "@/lib/i18n/server";

// Opened from outside the private network: one line above every page saying what can be done
// from here. It was part of the old page header, which v4's sidebar replaced, and went with it.
export async function ExternalNotice() {
  const t = await serverT();
  return (
    <div className="border-b border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-4 py-2 text-sm text-[var(--warning)] lg:px-8">
      {/* Two sentences, two keys. Splitting inside one of them to keep the <strong> around
          "read-only" would fix the order of the fragments, and Japanese does not put them in
          that order. */}
      <strong>{t("Accessing from outside your private network — read-only.")}</strong>{" "}
      {t(
        "You can view and download minutes and transcripts here; recording, editing and deleting are available on your local network only.",
      )}
    </div>
  );
}
