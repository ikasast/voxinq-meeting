import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Your display name and your picture.
//
// The picture arrives already square and already small: the browser crops and resizes it before
// sending, because a phone camera produces four megabytes and none of that survives being drawn
// at twenty-six pixels. What lands here is checked anyway — a client that has been edited is
// not a client that can be trusted about sizes.
//
// `user` carries no ownership rule — it is not meeting content — so the scoped client passes
// this straight through. It is used anyway, because reaching for the unscoped one should mean
// something, and here it would mean nothing.

const MAX_BYTES = 512 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "expected a form" }, { status: 400 });

  // Prisma types Bytes as `Uint8Array<ArrayBuffer>` — the concrete buffer, not `ArrayBufferLike`.
  const data: {
    name?: string | null;
    image?: Uint8Array<ArrayBuffer> | null;
    imageType?: string | null;
  } = {};

  if (form.has("name")) {
    const name = String(form.get("name") ?? "").trim();
    if (name.length > 60) {
      return NextResponse.json({ error: "Display names are up to 60 characters." }, { status: 400 });
    }
    data.name = name || null;
  }

  if (form.get("removeImage") === "1") {
    data.image = null;
    data.imageType = null;
  } else {
    const file = form.get("image");
    if (file instanceof File && file.size > 0) {
      if (!TYPES.has(file.type)) {
        return NextResponse.json({ error: "Use a PNG, JPEG or WebP image." }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: "That picture is too large even after resizing. Try a smaller one." },
          { status: 400 },
        );
      }
      data.image = new Uint8Array(await file.arrayBuffer());
      data.imageType = file.type;
    }
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ ok: true, changed: false });

  await prisma.user.update({ where: { id: me.id }, data });
  return NextResponse.json({ ok: true, changed: true });
}
