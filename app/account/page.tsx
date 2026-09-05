import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AccountForm } from "./account-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await currentUser();
  if (!me) redirect("/login?next=/account");

  const [row, sessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: me.id },
      select: { passwordHash: true, tailscaleLogin: true, createdAt: true },
    }),
    prisma.session.count({ where: { userId: me.id, expiresAt: { gt: new Date() } } }),
  ]);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
          {me.name || me.username}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Signed in as <strong>{me.username}</strong>
          {me.isAdmin ? " · administrator" : ""} ·{" "}
          {me.via === "tailnet"
            ? "identified by your tailnet login"
            : `${sessions} signed-in device${sessions === 1 ? "" : "s"}`}
        </p>
        {row.tailscaleLogin ? (
          <p className="text-xs text-[var(--text-muted)]">Tailnet login: {row.tailscaleLogin}</p>
        ) : null}
      </div>
      <AccountForm hasPassword={Boolean(row.passwordHash)} />
    </div>
  );
}
