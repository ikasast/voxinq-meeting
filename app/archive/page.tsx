import { redirect } from "next/navigation";

// Archiving was removed in v4 — pins, search and the trash cover what it was for — and the
// meetings once archived are in the list again. An old bookmark lands there.
export default function ArchivePage() {
  redirect("/?list=1");
}
