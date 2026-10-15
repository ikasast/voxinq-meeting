import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { serverT } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
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
      select: {
        passwordHash: true,
        email: true,
        tailscaleLogin: true,
        createdAt: true,
        imageType: true,
      },
    }),
    prisma.session.count({ where: { userId: me.id, expiresAt: { gt: new Date() } } }),
  ]);

  const t = await serverT();
  // v4: the page is a table like Settings — what it is on the left, its value or its control
  // on the right, a hairline between rows — rather than a column of cards.
  return (
    <div data-paper className="mx-auto max-w-3xl space-y-5 pt-2 lg:pt-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{t("Account")}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {t("Signed in as")} <strong className="font-medium text-[var(--text-secondary)]">{me.username}</strong>
          {me.isAdmin ? ` · ${t("Administrator")}` : ""}
          {me.via === "tailnet" ? ` · ${t("identified by your tailnet login")}` : ""}
        </p>
      </div>
      <div className="border-t border-[var(--border)]">
        <ProfileForm
          username={me.username}
          email={row.email}
          name={me.name}
          hasImage={row.imageType !== null}
        />
        <AccountForm
          hasPassword={Boolean(row.passwordHash)}
          sessions={sessions}
          tailnetLogin={row.tailscaleLogin}
        />
      </div>
    </div>
  );
}
