// Back closes what is open before it leaves the page.
//
// On a phone, Back with a menu or a dialog open is expected to close it — Android's own rule,
// and what the system back gesture does everywhere else. A web page gets that only by giving
// whatever is open a history entry of its own: opening it pushes one at the same address, Back
// pops it, and the popstate is taken as "close". Closing it any other way takes the entry back
// out, so the history the person walks with Back is the pages they saw and nothing else.
//
// The same mechanism lets the recording screen ask before Back takes it away mid-meeting.
//
// Guard entries carry a token in history.state. Tokens only grow (they start from the clock, so
// a reload does not reuse one), which is what lets a popstate tell how many guards it passed:
// everything above the token it landed on was left. The existing state is copied into each
// entry, so the router's own bookkeeping (Next.js keeps its tree there) comes along and Back to
// the entry underneath is, to the router, the same page.
//
// Framework-free, with the window passed in, so the bookkeeping can be tested on its own;
// app/use-back-guard.ts is the React side.

export const GUARD_KEY = "__voxinqBack";

/**
 * What a guard does when Back reaches it. "stay" puts the guard back: the person was asked and
 * chose not to leave.
 */
export type OnBack = () => void | "stay" | Promise<void | "stay">;

export type Guard = { token: number; onBack: OnBack };

export type GuardWindow = {
  history: { state: unknown; pushState(data: unknown, unused: string, url?: string | null): void; back(): void };
  location: { href: string };
  addEventListener(type: "popstate", listener: () => void): void;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
};

export type BackGuards = {
  /** Start guarding: push an entry that Back will spend on `onBack` instead of the page. */
  arm(onBack: OnBack): Guard;
  /** Stop guarding, because it was closed some other way; its entry goes if it is on top. */
  release(guard: Guard): Promise<void>;
  /** Before leaving the page from inside something guarded: every guard entry on top goes. */
  unwind(): Promise<void>;
  /** Resolves once the Backs already asked for have happened. */
  settled(): Promise<void>;
};

export function createBackGuards(win: GuardWindow): BackGuards {
  const stack: Guard[] = [];
  let last = 0;
  /** Set while a Back of our own is under way: the next popstate is that, not the person. */
  let ours: (() => void) | null = null;
  let chain: Promise<void> = Promise.resolve();

  const tokenHere = (): number => {
    const s = win.history.state as Record<string, unknown> | null;
    const v = s?.[GUARD_KEY];
    return typeof v === "number" ? v : 0;
  };

  const push = (guard: Guard) => {
    guard.token = last = Math.max(Date.now(), last + 1);
    stack.push(guard);
    const state = (win.history.state as Record<string, unknown> | null) ?? {};
    win.history.pushState({ ...state, [GUARD_KEY]: guard.token }, "", win.location.href);
  };

  /** One Back of our own, after any already asked for, and only if `still()` holds by then. */
  const back = (still: () => boolean): Promise<void> => {
    chain = chain.then(
      () =>
        new Promise<void>((resolve) => {
          if (!still()) return resolve();
          let timer: unknown = null;
          const done = () => {
            ours = null;
            win.clearTimeout(timer);
            resolve();
          };
          // A popstate that never comes (the entry was already gone) must not hold the chain.
          timer = win.setTimeout(done, 1000);
          ours = done;
          win.history.back();
        }),
    );
    return chain;
  };

  win.addEventListener("popstate", () => {
    if (ours) {
      ours();
      return;
    }
    // The person went back (or forward). Every guard above where they landed was left.
    const here = tokenHere();
    const left: Guard[] = [];
    while (stack.length > 0 && stack[stack.length - 1].token > here) left.push(stack.pop()!);
    for (const guard of left) {
      void Promise.resolve(guard.onBack()).then((answer) => {
        if (answer === "stay") push(guard);
      });
    }
  });

  return {
    arm(onBack) {
      const guard: Guard = { token: 0, onBack };
      push(guard);
      return guard;
    },
    release(guard) {
      const i = stack.indexOf(guard);
      if (i === -1) return chain;
      stack.splice(i, 1);
      return back(() => tokenHere() === guard.token);
    },
    unwind() {
      stack.length = 0;
      // Bounded: a Back that does not move (nothing left to go back to) must not loop.
      const pop = (tries: number): Promise<void> =>
        tries > 0 && tokenHere() > 0 ? back(() => tokenHere() > 0).then(() => pop(tries - 1)) : Promise.resolve();
      return chain.then(() => pop(10));
    },
    settled() {
      return chain;
    },
  };
}
