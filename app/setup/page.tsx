import Link from "next/link";
import { hasUsersCached } from "@/lib/auth/has-users";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

// The first account, and only the first. Reaching this page at all means the proxy already let
// the request through — with the shared password, or from inside the tailnet — so the person
// here is one who could already read everything.
export default async function SetupPage() {
  if (await hasUsersCached()) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <h1 className="mb-2 text-xl font-semibold text-[var(--text-strong)]">
          This server already has an account
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Further accounts are made by an administrator.{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm py-16">
      <h1 className="mb-1 text-center text-xl font-semibold text-[var(--text-strong)]">
        Create the first account
      </h1>
      <p className="mb-4 text-center text-xs text-[var(--text-muted)]">
        It is an administrator. From then on this server asks who you are instead of sharing one
        password, and <code>APP_PASSWORD</code> stops being a way in.
      </p>
      <SetupForm />
    </div>
  );
}
