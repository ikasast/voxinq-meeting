import Link from "next/link";
import { hasUsersCached } from "@/lib/auth/has-users";
import { serverT } from "@/lib/i18n/server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

// A server shell, because which login this is depends on whether the server has accounts, and
// the browser is not the place to find that out.
export default async function LoginPage() {
  const accounts = await hasUsersCached();
  const t = await serverT();
  return (
    <div>
      <LoginForm accounts={accounts} />
      {!accounts && process.env.APP_PASSWORD ? (
        <p className="mx-auto max-w-sm text-center text-xs text-[var(--text-muted)]">
          {/* A sentence with a link through the middle of it. Each piece is its own key and
              its Japanese is written for the position it sits in, because the verb that ends a
              Japanese sentence has to land after the link rather than before it. */}
          {t("This server uses a single shared password.")}{" "}
          <Link href="/setup" className="underline">
            {t("Create an account")}
          </Link>{" "}
          {t("to give people their own.")}
        </p>
      ) : null}
    </div>
  );
}
