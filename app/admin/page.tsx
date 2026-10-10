import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { serverT } from "@/lib/i18n/server";
import { PeopleList } from "./people-list";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await currentUser();
  if (!me) redirect("/login?next=/admin");
  // Not a 403 page: somebody who is not an administrator has no business knowing this screen
  // exists, and the home page is where they were going anyway.
  if (!me.isAdmin) redirect("/");

  const t = await serverT();
  return (
    <div data-paper className="mx-auto max-w-[50rem] space-y-4 pt-2 lg:pt-6">
      {/* Who can use this server and how they get in — not what any of them have recorded:
          running the machine is a different thing from reading what is on it. */}
      <PeopleList meId={me.id} title={t("People")} intro={t("Who can use this server, and how they sign in.")} />
    </div>
  );
}
