import { PrismaClient } from "@prisma/client";

// Keep a single PrismaClient for the whole process so hot reload in the
// dev server does not multiply connections.
const store = globalThis as typeof globalThis & { __voxinqPrisma?: PrismaClient };

export const prisma: PrismaClient = (store.__voxinqPrisma ??= new PrismaClient());
