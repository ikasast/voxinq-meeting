import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One job's state, for a screen that is waiting on it.
//
// `position` is how many queued jobs are ahead of this one — the number someone waiting
// actually wants, and one the row cannot answer on its own.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      status: true,
      detail: true,
      meetingId: true,
      position: true,
      createdAt: true,
      startedAt: true,
    },
  });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  let ahead = 0;
  if (job.status === "queued") {
    ahead = await prisma.job.count({
      where: {
        status: "queued",
        OR: [
          { position: { lt: job.position } },
          { position: job.position, createdAt: { lt: job.createdAt } },
        ],
      },
    });
  }
  return NextResponse.json({ ...job, ahead });
}
