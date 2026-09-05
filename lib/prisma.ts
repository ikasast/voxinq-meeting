import type { PrismaClient } from "@prisma/client";
import { keyFor } from "./crypto/key-cache";
import { LOCKED, decryptField, encryptField, isEncrypted } from "./crypto/field";
import { resolveScope } from "./db/owner";
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

/**
 * What is encrypted, and under what name.
 *
 * The two things a meeting actually contains. Titles, dates and tags stay in the clear on
 * purpose: they are what the list, the calendar and the search bar are made of, and encrypting
 * them would mean an app that cannot show you your own meetings without unlocking every one.
 * That is the trade, and it is written down in the documentation rather than implied here.
 */
const ENCRYPTED: Record<string, { field: string; purpose: string }> = {
  transcript: { field: "text", purpose: "transcript" },
  meetingSummary: { field: "summaryText", purpose: "minutes" },
};

/** Rows that are not meeting content. Shared, or scoped by being about a person already. */
const UNOWNED = new Set(["user", "session", "passwordReset"]);

/**
 * Belongs to a person directly, through an `ownerId` of its own.
 *
 * Voiceprints are here rather than shared because a shared library of "who I can recognise" is
 * a list of who each person meets. The cost is that the same colleague is enrolled twice.
 */
const OWNED = new Set(["meeting", "speakerProfile", "job"]);

/** Belongs to a person through the meeting it hangs off. */
const VIA_MEETING = new Set(["transcript", "meetingSummary", "meetingParticipant"]);

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
]);

/**
 * Writes addressed by id, which need the condition beside the id rather than wrapped around it.
 *
 * `update` and `delete` take a *unique* where. Prisma does allow extra filters there — that is
 * how a filtered update works — but not an `AND` around the whole thing, which is a validation
 * error rather than a narrower query. It failed as a 500 in the middle of a queued job, which is
 * the worst place to find out.
 */
const BY_ID_WRITE = new Set(["update", "delete"]);

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
        if (scope.mode === "open" || scope.mode === "system") return query(args);

        // Signed out. Reads are narrowed to nothing by an empty `in`, which is a condition no
        // row satisfies and — unlike a sentinel id that must never collide — contains nothing
        // that has to be got right. Writes are refused below.
        if (scope.mode === "nobody") {
          if (FILTERED.has(operation) || BY_UNIQUE.has(operation)) {
            const nothing = narrow(args as Args, { id: { in: [] } });
            if (BY_UNIQUE.has(operation)) {
              if (operation === "findUniqueOrThrow") throw notFound(name);
              return null;
            }
            return query(nothing);
          }
          throw new Error("Cannot write anything while signed out.");
        }

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
        const secret = ENCRYPTED[name] ? await keyFor(scope.userId) : null;

        // On the way out. Anything that looks like our ciphertext is decrypted wherever it
        // appears — top level, nested in an include, inside an array — because a read can be
        // shaped in more ways than a list of field names could keep up with.
        const run = async (finalArgs: unknown) => {
          const result = await query(finalArgs as typeof args);
          return decryptDeep(result, await keyFor(scope.userId));
        };

        // On the way in. Without a key the value is stored as it arrives — which is right for
        // an account that has none, and cannot happen for one that does: a job whose owner's key
        // is not held does not run at all.
        if (secret && (operation === "create" || operation === "createMany" || operation === "update")) {
          encryptIncoming(a, ENCRYPTED[name], secret);
        }

        if (operation === "create" || operation === "createMany") {
          return query(OWNED.has(name) ? stampOwner(a, scope.userId, operation) : a);
        }
        if (BY_ID_WRITE.has(operation)) {
          return run({ ...a, where: { ...(a.where ?? {}), ...condition } });
        }
        if (operation === "upsert") {
          const next = { ...a, where: { ...(a.where ?? {}), ...condition } } as Args & {
            create?: Record<string, unknown>;
          };
          if (OWNED.has(name) && next.create) {
            next.create = { ...next.create, ownerId: scope.userId };
          }
          return query(next);
        }
        if (BY_UNIQUE.has(operation)) {
          const table = (prismaRaw as unknown as Record<string, { findFirst: (a: unknown) => Promise<unknown> }>)[name];
          const found = await table.findFirst(narrow(a, condition));
          if (found === null && operation === "findUniqueOrThrow") throw notFound(name);
          // Decrypted like every other read. Missing this meant a meeting opened by its id came
          // back as ciphertext on the page, while the same rows fetched in a list came back
          // readable — the sort of difference that looks like data corruption.
          return decryptDeep(found, await keyFor(scope.userId));
        }
        if (FILTERED.has(operation)) return run(narrow(a, condition));
        return run(args);
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

function stampOwner(args: Args, userId: string, operation: string): Args {
  const owner = userId;
  if (operation === "createMany") {
    const rows = Array.isArray(args.data) ? args.data : [args.data ?? {}];
    return { ...args, data: rows.map((d) => ({ ...d, ownerId: owner })) };
  }
  return { ...args, data: { ...((args.data as Record<string, unknown>) ?? {}), ownerId: owner } };
}

export { prismaRaw };
export type { PrismaClient };

/** Encrypt the field this model keeps its content in, wherever the write put it. */
function encryptIncoming(
  args: Args,
  spec: { field: string; purpose: string },
  master: Buffer,
): void {
  const one = (row: Record<string, unknown>) => {
    const v = row[spec.field];
    // Already encrypted means a re-save of something read back out; encrypting it twice would
    // produce a value nothing can read.
    if (typeof v === "string" && !isEncrypted(v)) {
      row[spec.field] = encryptField(v, master, spec.purpose);
    }
  };
  const data = args.data;
  if (Array.isArray(data)) data.forEach((d) => one(d));
  else if (data) one(data);
}

/**
 * Decrypt every value that carries our prefix, anywhere in a result.
 *
 * By the prefix rather than by field name: a read can be shaped as a select, an include, a
 * nested include inside an array, or a groupBy, and keeping a list of paths in step with all of
 * that is the kind of thing that silently misses one. Nothing else in this database begins with
 * `enc:v1.`, so matching on it cannot catch anything that is not ours.
 */
function decryptDeep(value: unknown, master: Buffer | null): unknown {
  if (typeof value === "string") {
    if (!isEncrypted(value)) return value;
    if (!master) return LOCKED;
    return decryptField(value, master) ?? LOCKED;
  }
  if (Array.isArray(value)) return value.map((v) => decryptDeep(v, master));
  if (value && typeof value === "object" && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = decryptDeep(v, master);
    return out;
  }
  // Dates, Buffers, Decimals and the like are returned untouched — walking into them would
  // rebuild them as plain objects and quietly change what callers receive.
  return value;
}
