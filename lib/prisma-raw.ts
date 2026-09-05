import { PrismaClient } from "@prisma/client";

// The client with no ownership rules on it.
//
// Two things need it and nothing else should. Working out who you are is a database query, and
// running that through the scoped client would ask who you are in order to find out who you
// are. And the scoped client is built from this one.
//
// Everything else imports `@/lib/prisma`, which is this with the rules applied. A test holds
// that line, because "just this once" is how a boundary stops being one.
const store = globalThis as typeof globalThis & { __voxinqPrisma?: PrismaClient };

export const prismaRaw: PrismaClient = (store.__voxinqPrisma ??= new PrismaClient());
