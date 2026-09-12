import Link from "next/link";
import { checkReset } from "@/lib/auth/reset";
import { serverT } from "@/lib/i18n/server";
import { ResetForm } from "./reset-form";

export const dynamic = "force-dynamic";

// Spending a reset link.
//
// Checked before the form is drawn, so a link that has expired says so instead of asking for a
// password twice and then refusing.
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const check = await checkReset(token);
  const t = await serverT();

  if (!check.ok) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <h1 className="mb-2 text-xl font-semibold text-[var(--text-strong)]">
          {t("This link cannot be used")}
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          {check.why === "That link has expired or has already been used."
            ? t("That link has expired or has already been used.")
            : check.why}{" "}
          {t("Ask an administrator for another — they take a few seconds to make.")}
        </p>
        <p className="mt-4 text-sm">
          <Link href="/login" className="underline">
            {t("Back to the login page")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm py-16">
      <h1 className="mb-1 text-center text-xl font-semibold text-[var(--text-strong)]">
        {t("Choose a password")}
      </h1>
      <p className="mb-4 text-center text-xs text-[var(--text-muted)]">
        {t("This link works once. Setting a password signs you in here and signs out every other device.")}
      </p>
      <ResetForm token={token} />
    </div>
  );
}
