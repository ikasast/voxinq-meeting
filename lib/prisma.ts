import type { PrismaClient } from "@prisma/client";
import { NOBODY, resolveScope } from "./db/owner";
import { prismaRaw } from "./prisma-raw";

// The database, with ownership already applied.
//
// Every query in the app goes through here, and the rule is underneath all of them rather than
// repeated in each: there are forty-odd API routes and as many server components, and the cost
// of missing one is somebody reading another person's meetings. A check you have to remember is
// a check that gets forgotten; this one cannot be, because it is not written at the call sites
// at all.
//
// What it does, per query:
//
//   open    nothing. This instance has no accounts, so there is nobody to separate.
//   system  nothing, deliberately — see asSystem() and the few places that use it.
//   user    a meeting must be yours; anything hanging off a meeting must hang off one of yours.
//
// **What it is not.** It is a filter, not a permission system: it makes other people's rows
// invisible, which is what stops a forgotten `where` becoming a leak. Whether a particular
// person may do a particular thing — an administrator reordering somebody else's queue — is a
// decision that stays in the route offering the action, where it can be read.
//
// **What it does not reach.** Conditions nested inside a relation filter are the caller's own.
// `tag.findMany({ where: { meetings: { some: { … } } } })` is scoped here at the top level, but
// a `_count` with its own `where` is not rewritten, so a count that must be per-person has to
// say so itself. There is a test naming the ones that do.

/** Rows that are not meeting content. Shared, or scoped by being about a person already. */
const UNOWNED = new Set(["user", "session"]);

/**
 * Belongs to a person directly, through an `ownerId` of its own.
 *
 * Voiceprints are here rather than shared because a shared library of "who I can recognise" is
 * a list of who each person meets. The cost is that the same colleague is enrolled twice.
 */
const OWNED = new Set(["meeting", "speakerProfile"]);

/** Belongs to a person through the meeting it hangs off. */
const VIA_MEETING = new Set(["transcript", "meetingSummary", "meetingParticipant", "job"]);

/**
 * Labels on meetings rather than content of them. A person sees a tag or a series when they
 * have a meeting in it, which keeps somebody else's project names out of the sidebar.
 */
const VIA_MEETINGS_LIST = new Set(["tag", "series"]);

/**
 * Looking one row up by its id, which cannot simply be narrowed.
 *
 * `findUnique` accepts only a unique field in its `where` — adding `ownerId` beside the id is
 * a validation error, not a filter, and the request fails with a 500 instead of a 404. So these
 * two are re-issued as `findFirst`, which does take arbitrary conditions. The visible effect is
 * the one wanted: somebody else's id is not found rather than not permitted, and the difference
 * between "no such meeting" and "not yours" is not something the app should be telling people.
 */
const BY_UNIQUE = new Set(["findUnique", "findUniqueOrThrow"]);

/** Operations that carry a `where` and can therefore be narrowed in place. */
const FILTERED = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
  "update",
  "delete",
]);

type Args = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
};

function narrow(args: Args, condition: Record<string, unknown>): Args {
  // A sibling key on `where` narrows rather than replaces, which is what turns "find meeting X"
  // into "find meeting X if it is mine" — and makes a findUnique for someone else's id return
  // nothing instead of their meeting.
  return { ...args, where: args.where ? { AND: [args.where, condition] } : condition };
}

function conditionFor(model: string, userId: string): Record<string, unknown> | null {
  if (OWNED.has(model)) return { ownerId: userId };
  if (VIA_MEETING.has(model)) return { meeting: { ownerId: userId } };
  if (VIA_MEETINGS_LIST.has(model)) return { meetings: { some: { ownerId: userId } } };
  return null;
}

export const prisma = prismaRaw.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const name = model.charAt(0).toLowerCase() + model.slice(1);
        if (UNOWNED.has(name)) return query(args);

        const scope = await resolveScope();
        if (scope.mode !== "user") return query(args);

        const condition = conditionFor(name, scope.userId);
        if (!condition) {
          // A model nobody has classified. Refusing is the safe default: a new table full of
          // meeting content that silently skipped the rules is the exact failure this exists to
          // prevent, and the fix is one line in this file.
          throw new Error(
            `${name} has no ownership rule. Add it to lib/prisma.ts — as owned, or as shared.`,
          );
        }

        const a = args as Args;

        if (operation === "create" || operation === "createMany") {
          return query(OWNED.has(name) ? stampOwner(a, scope.userId, operation) : a);
        }
        if (operation === "upsert") {
          const next = narrow(a, condition);
          if (OWNED.has(name) && next.create) {
            next.create = { ...next.create, ownerId: requireSomebody(scope.userId) };
          }
          return query(next);
        }
        if (BY_UNIQUE.has(operation)) {
          const table = (prismaRaw as unknown as Record<string, { findFirst: (a: unknown) => Promise<unknown> }>)[name];
          const found = await table.findFirst(narrow(a, condition));
          if (found === null && operation === "findUniqueOrThrow") throw notFound(name);
          return found;
        }
        if (FILTERED.has(operation)) return query(narrow(a, condition));
        return query(args);
      },
    },
  },
});

export type ScopedPrisma = typeof prisma;

/**
 * The client handed to a `$transaction` callback.
 *
 * Taken from the extended client rather than from `PrismaClient`, so it keeps agreeing with
 * whatever the extension makes of it — and so a transaction is scoped exactly like everything
 * outside one.
 */
export type PrismaTransaction = Parameters<Parameters<ScopedPrisma["$transaction"]>[0]>[0];

/** Shaped like Prisma's own, so callers that already handle P2025 keep working. */
function notFound(model: string): Error & { code?: string } {
  const err: Error & { code?: string } = new Error(
    `No ${model} found (or it belongs to somebody else)`,
  );
  err.code = "P2025";
  return err;
}

function requireSomebody(userId: string): string {
  if (userId === NOBODY) {
    // Writing a row with no owner would leave something nobody can reach again. Refusing says
    // so, where a successful write would not.
    throw new Error("Cannot create anything while signed out.");
  }
  return userId;
}

function stampOwner(args: Args, userId: string, operation: string): Args {
  const owner = requireSomebody(userId);
  if (operation === "createMany") {
    const rows = Array.isArray(args.data) ? args.data : [args.data ?? {}];
    return { ...args, data: rows.map((d) => ({ ...d, ownerId: owner })) };
  }
  return { ...args, data: { ...((args.data as Record<string, unknown>) ?? {}), ownerId: owner } };
}

export { prismaRaw };
export type { PrismaClient };
