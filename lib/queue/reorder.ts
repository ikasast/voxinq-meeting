import { prisma } from "@/lib/prisma";

// Moving a job up or down the queue.
//
// Positions are rewritten for the whole queued set rather than patched for the one that moved,
// because the alternative — inserting between neighbours — needs either fractional positions or
// a rule for what happens when two are equal, and neither is worth it for a list this short.
// Ten rows renumbered is one statement per row and always leaves a total order.
//
// Anything not named keeps its relative place at the end. A queue is a live thing: a job can
// finish, or arrive, between the screen listing it and the drag being let go.
export async function reorderQueue(orderedIds: string[]): Promise<number> {
  const queued = await prisma.job.findMany({
    where: { status: "queued" },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const known = new Set(queued.map((j) => j.id));
  const wanted = orderedIds.filter((id) => known.has(id));
  const rest = queued.map((j) => j.id).filter((id) => !wanted.includes(id));
  const final = [...wanted, ...rest];

  await prisma.$transaction(
    final.map((id, i) => prisma.job.update({ where: { id }, data: { position: i + 1 } })),
  );
  return final.length;
}
