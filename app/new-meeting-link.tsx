"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAuthPath } from "./auth-paths";
import { useT } from "./locale-provider";

// The header's New meeting. A component of its own only so that it can see the path: the header
// is rendered by the layout, which cannot, and on the sign-in screen this would lead straight
// back to the sign-in screen.
export function NewMeetingLink() {
  const pathname = usePathname() ?? "/";
  const t = useT();
  if (isAuthPath(pathname)) return null;
  return (
    <Link href="/new" className="btn-ink whitespace-nowrap">
      {t("New meeting")}
    </Link>
  );
}
