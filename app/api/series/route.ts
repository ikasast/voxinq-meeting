import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List series names (for pickers). Series are created implicitly when a meeting is
// assigned to a new name, and pruned when their last meeting is removed.
export async function GET() {
  const series = await prisma.series.findMany({
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(series);
}
