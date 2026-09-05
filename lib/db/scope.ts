import { AsyncLocalStorage } from "node:async_hooks";

// Who a database query is running as.
//
// Authorization is not spread across the routes. There are forty-odd of them and forty-odd more
// server components, and one missed check is somebody else's minutes — so the rule lives under
// all of them, in the Prisma client, and the routes cannot opt out of it by forgetting.
//
// Four answers, and the last one is the point:
//
//   open    this instance has no accounts. It behaves as it always has.
//   nobody  signed out. Owns nothing, and every read is narrowed to nothing.
//   system  deliberately unscoped: the queue dispatcher, and looking up who you are.
//   user    a request, resolved to a person. Everything is theirs or invisible.
//   (none)  a query that is none of the above — refused, loudly.
//
// The refusal is what makes this safe to rely on. Work that runs outside a request and forgets
// to say so does not quietly read everybody's meetings; it throws, in development, on the first
// query. A leak that fails closed is a bug report. One that fails open is a breach nobody sees.

export type Scope =
  | { mode: "open" }
  /** Signed out, or an identity with no account here. Owns nothing, so sees nothing. */
  | { mode: "nobody" }
  | { mode: "system"; because: string }
  | { mode: "user"; userId: string };

const store = new AsyncLocalStorage<Scope>();

// Both wrappers below `await` inside `store.run` rather than handing the promise back out of
// it, and that is not a stylistic choice. A Prisma call returns a lazy PrismaPromise: nothing
// executes until something calls `.then` on it. Returning it from `run` unawaited means the
// query starts *after* the context has been left, with no scope — and the scoped client then
// refuses it, or worse, would not have. The bug looked like AsyncLocalStorage not working at
// all, and the stack trace that gave it away ended in `PrismaPromise.then`.

/**
 * Run something outside the ownership rules, on purpose.
 *
 * `because` is required and is not decoration: it appears in the error when this is used from
 * somewhere it should not be, and it is what a reader grep-searching for the holes will find.
 */
export function asSystem<T>(because: string, fn: () => Promise<T>): Promise<T> {
  return store.run({ mode: "system", because }, async () => await fn());
}

/** Run as a specific person. Used by the queue, which knows whose job it is running. */
export function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return store.run({ mode: "user", userId }, async () => await fn());
}

/** The scope set explicitly around this call, if any. */
export function explicitScope(): Scope | undefined {
  return store.getStore();
}
