import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { Avatar } from "../avatar";
import { AccountForm } from "./account-form";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await currentUser();
  if (!me) redirect("/login?next=/account");

  const [row, sessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: me.id },
      // `imageType` stands in for "has a picture": it is set exactly when the bytes are, and
      // selecting the bytes here would carry a picture inside the HTML of a page that only
      // needs to know there is one. It is served from its own route instead.
      select: { passwordHash: true, tailscaleLogin: true, createdAt: true, imageType: true },
    }),
    prisma.session.count({ where: { userId: me.id, expiresAt: { gt: new Date() } } }),
  ]);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center gap-3">
        <Avatar
          username={me.username}
          name={me.name}
          hasImage={row.imageType !== null}
          size={48}
        />
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
      </div>
      <ProfileForm username={me.username} name={me.name} hasImage={row.imageType !== null} />
      <AccountForm hasPassword={Boolean(row.passwordHash)} />
    </div>
  );
}
