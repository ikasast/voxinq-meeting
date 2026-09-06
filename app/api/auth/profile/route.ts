import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { looksLikeEmail, normaliseEmail } from "@/lib/auth/email";
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
    email?: string;
    image?: Uint8Array<ArrayBuffer> | null;
    imageType?: string | null;
  } = {};

  // Where an account that predates addresses gets one, and where a typo is fixed. Not removable:
  // it is how this account signs in, and an account with a password and no address is one that
  // can only be reached from inside the tailnet.
  if (form.has("email")) {
    const email = normaliseEmail(String(form.get("email") ?? ""));
    if (!looksLikeEmail(email)) {
      return apiError("Enter the email address you want to sign in with.", 400);
    }
    data.email = email;
  }

  if (form.has("name")) {
    const name = String(form.get("name") ?? "").trim();
    if (name.length > 60) {
      return apiError("Display names are up to 60 characters.", 400);
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
        return apiError("Use a PNG, JPEG or WebP image.", 400);
      }
      if (file.size > MAX_BYTES) {
        return apiError("That picture is too large even after resizing. Try a smaller one.", 400);
      }
      data.image = new Uint8Array(await file.arrayBuffer());
      data.imageType = file.type;
    }
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ ok: true, changed: false });

  try {
    await prisma.user.update({ where: { id: me.id }, data });
  } catch {
    // The only unique thing here. Saying which account holds it would answer a question nobody
    // signed in as this person is entitled to ask.
    return apiError("That email address is already in use.", 409);
  }
  return NextResponse.json({ ok: true, changed: true });
}
