import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { demoMeeting } from "@/lib/demo-meeting";
import { currentLocale } from "@/lib/i18n/server";
import { isExternalRequest } from "@/lib/is-tailnet";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** One at a time. A second sample teaches nothing the first did not. */
const MAX_SAMPLES = 1;

/**
 * Create the sample meeting somebody learns on, in their own account.
 *
 * An ordinary meeting in every respect — owned, encrypted, searchable, deletable — except for
 * the `sample` flag, which is what the guide card keys off and what DELETE removes. Nothing
 * about it is a special case further down: the buttons it teaches are the real buttons acting
 * on real rows.
 *
 * Refused from outside the private network: writing rows is not on the external allow-list, and
 * a sample is the least urgent reason to be the exception.
 */
export async function POST() {
  if (await isExternalRequest()) {
    return apiError("Sample meetings can only be created from inside your private network.", 403);
  }

  const existing = await prisma.meeting.count({ where: { sample: true, deletedAt: null } });
  if (existing >= MAX_SAMPLES) {
    return apiError("There is already a sample meeting. Delete it to make a fresh one.", 409);
  }

  const demo = demoMeeting(await currentLocale());
  // Ninety seconds ago, so it reads as "just finished" and lands at the top of the list rather
  // than under a date somebody has to go looking for.
  const endedAt = new Date(Date.now() - 90_000);
  const startedAt = new Date(endedAt.getTime() - 18 * 60_000);

  const created = await prisma.meeting.create({
    data: {
      sample: true,
      title: demo.title,
      description: demo.description,
      startedAt,
      endedAt,
      recordedMs: endedAt.getTime() - startedAt.getTime(),
      sttLanguage: null,
      speakerLabels: JSON.stringify(demo.labels),
      // Deliberately no summary: pressing Generate minutes has to actually generate them.
      transcripts: {
        create: demo.lines.map((l, i) => ({
          speakerType: l.speaker,
          text: l.text,
          // Spread across the meeting so the timestamps read like a conversation, and so
          // "click a timestamp to play from there" has something plausible to show.
          createdAt: new Date(startedAt.getTime() + i * 85_000),
        })),
      },
      participants: {
        create: demo.participants.map((name, position) => ({ name, position, speaking: true })),
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}

/** Remove the samples, and only the samples. */
export async function DELETE() {
  if (await isExternalRequest()) {
    return apiError("Sample meetings can only be removed from inside your private network.", 403);
  }
  // Gone rather than trashed: nobody wants to find the sample in the trash, and it holds
  // nothing anybody could regret losing.
  const { count } = await prisma.meeting.deleteMany({ where: { sample: true } });
  return NextResponse.json({ removed: count });
}
