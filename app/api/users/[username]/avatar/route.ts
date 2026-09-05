import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Somebody's picture.
//
// Readable by anyone signed in, and only by them: a face beside a queue row is the point, and
// the queue shows every account's rows. Nothing else about the person is served here — the
// picture and its type, and a 404 if they have not set one.
//
// `user` carries no ownership rule — it is not meeting content — so the scoped client passes
// this straight through. It is used anyway, because reaching for the unscoped one should mean
// something, and here it would mean nothing.
export async function GET(_req: Request, ctx: { params: Promise<{ username: string }> }) {
  const me = await currentUser();
  if (!me) return new NextResponse("unauthorized", { status: 401 });

  const { username } = await ctx.params;
  const user = await prisma.user.findUnique({
    where: { username },
    select: { image: true, imageType: true, disabledAt: true },
  });
  if (!user || user.disabledAt || !user.image) return new NextResponse("not found", { status: 404 });

  return new NextResponse(new Uint8Array(user.image), {
    headers: {
      "Content-Type": user.imageType ?? "image/png",
      // Private, because it is only served to somebody signed in. Short, because a person who
      // changes their picture should see the new one rather than yesterday's.
      "Cache-Control": "private, max-age=60",
    },
  });
}
