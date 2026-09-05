import { forgetAccountCheck } from "@/lib/db/owner";
import { forgetUserCount } from "@/lib/auth/has-users";
import { prismaRaw } from "@/lib/prisma-raw";

// What happens to everything that was here before there were accounts.
//
// A meeting recorded last year has no owner, and the moment the first account exists the
// ownership rules start applying — so without this it would belong to nobody and be visible to
// nobody. Every recording, transcript and set of minutes on the instance would vanish from the
// screen at the instant somebody signed up, which is not a migration, it is a disappearance.
//
// So the first account adopts them. It is the right answer on the installs this applies to:
// until now the app had one shared password, so everything on it was already one person's.
//
// Only the first. After that, an account is a new person and nothing is theirs yet.

export async function adoptOrphanedMeetings(userId: string): Promise<number> {
  // Unscoped on purpose, and it must be: the whole point is to touch rows that belong to
  // nobody, which is precisely what the scoped client refuses to show.
  const { count } = await prismaRaw.meeting.updateMany({
    where: { ownerId: null },
    data: { ownerId: userId },
  });
  // Voiceprints too: the same person recorded them, and a library nobody owns is a library
  // nobody can use.
  await prismaRaw.speakerProfile.updateMany({ where: { ownerId: null }, data: { ownerId: userId } });

  // Both caches answer "are there accounts". Clearing them here means the very next query in
  // this process is scoped, rather than running unscoped until the recheck.
  forgetUserCount();
  forgetAccountCheck();
  if (count > 0) {
    console.log(`[auth] ${count} meeting(s) from before accounts now belong to the first account`);
  }
  return count;
}
