import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { hasUsersCached } from "@/lib/auth/has-users";
import { signupIsOpen } from "@/lib/auth/signup";
import { isExternalRequest } from "@/lib/is-tailnet";
import { AdminScreen } from "./admin-screen";
import { ADMIN_TABS, type AdminTab } from "./tabs";

export const dynamic = "force-dynamic";

// Administration: what describes the machine and everybody on it, apart from Settings, which is
// each person's own. Members, the defaults everybody starts from, this machine's recognition
// model, GPU budget and retention, the extensions, and the app lock rule.
//
// Who may open it: an administrator, or — on an instance with no accounts yet, where there is
// nobody to be one — whoever is inside, as the settings API already treats them. Never from
// outside the tailnet.
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const external = await isExternalRequest();
  const me = await currentUser();
  const accounts = await hasUsersCached();
  if (accounts && !me) redirect("/login?next=/admin");
  // Not a 403 page: somebody who is not an administrator has no business knowing this screen
  // exists, and the home page is where they were going anyway.
  if (external || (me && !me.isAdmin)) redirect("/");

  const asked = (await searchParams).tab;
  const tab: AdminTab = ADMIN_TABS.some((x) => x === asked) ? (asked as AdminTab) : "people";
  return <AdminScreen tab={tab} meId={me?.id ?? null} accounts={accounts} signupOpen={signupIsOpen()} />;
}
