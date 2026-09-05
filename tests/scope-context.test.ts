import { describe, expect, it } from "vitest";
import { asSystem, asUser, explicitScope, type Scope } from "../lib/db/scope";

// The context has to survive until the query actually runs, which is later than it looks.
//
// A Prisma call returns a lazy PrismaPromise: building it does nothing, and the query is only
// sent when something calls `.then`. Handing that promise out of `AsyncLocalStorage.run`
// unawaited means it executes after the context has been left — the scope is gone, and the
// scoped client either refuses the query or, in the version of this that had no refusal, would
// have run it unscoped. It looked exactly like AsyncLocalStorage not working.

/** A promise that does nothing until awaited, the way a PrismaPromise does. */
function lazy<T>(onRun: () => void, value: T): PromiseLike<T> {
  return {
    then(resolve) {
      onRun();
      return Promise.resolve(value).then(resolve);
    },
  };
}

describe("the scope reaches work that starts late", () => {
  it("holds for a promise that only runs when awaited", async () => {
    let seen: Scope | undefined;
    await asSystem("test", () => lazy(() => (seen = explicitScope()), null) as Promise<null>);
    expect(seen).toEqual({ mode: "system", because: "test" });
  });

  it("holds the same way for a user", async () => {
    let seen: Scope | undefined;
    await asUser("user_1", () => lazy(() => (seen = explicitScope()), null) as Promise<null>);
    expect(seen).toEqual({ mode: "user", userId: "user_1" });
  });

  it("holds across awaits inside the callback", async () => {
    const seen = await asSystem("test", async () => {
      await new Promise((r) => setTimeout(r, 1));
      return explicitScope();
    });
    expect(seen?.mode).toBe("system");
  });

  it("does not leak out again afterwards", async () => {
    await asSystem("test", async () => undefined);
    expect(explicitScope()).toBeUndefined();
  });

  it("nests, with the inner one winning", async () => {
    const inner = await asSystem("outer", () => asUser("user_2", async () => explicitScope()));
    expect(inner).toEqual({ mode: "user", userId: "user_2" });
  });

  it("is separate between concurrent callers", async () => {
    // Two requests in flight at once must not see each other's scope, which is the entire
    // reason this is AsyncLocalStorage and not a module-level variable.
    const [a, b] = await Promise.all([
      asUser("user_a", async () => {
        await new Promise((r) => setTimeout(r, 5));
        return explicitScope();
      }),
      asUser("user_b", async () => explicitScope()),
    ]);
    expect(a).toEqual({ mode: "user", userId: "user_a" });
    expect(b).toEqual({ mode: "user", userId: "user_b" });
  });
});
