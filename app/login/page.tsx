import Link from "next/link";
import { hasUsersCached } from "@/lib/auth/has-users";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

// A server shell, because which login this is depends on whether the server has accounts, and
// the browser is not the place to find that out.
export default async function LoginPage() {
  const accounts = await hasUsersCached();
  return (
    <div>
      <LoginForm accounts={accounts} />
      {!accounts && process.env.APP_PASSWORD ? (
        <p className="mx-auto max-w-sm text-center text-xs text-[var(--text-muted)]">
          This server uses a single shared password.{" "}
          <Link href="/setup" className="underline">
            Create an account
          </Link>{" "}
          to give people their own.
        </p>
      ) : null}
    </div>
  );
}
