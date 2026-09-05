import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { PeopleList } from "./people-list";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await currentUser();
  if (!me) redirect("/login?next=/admin");
  // Not a 403 page: somebody who is not an administrator has no business knowing this screen
  // exists, and the home page is where they were going anyway.
  if (!me.isAdmin) redirect("/");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">People</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Who can use this server, and how they get in. Not what any of them have recorded —
          running the machine is a different thing from reading what is on it.
        </p>
      </div>
      <PeopleList meId={me.id} />
    </div>
  );
}
