import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GUARD_KEY, createBackGuards, type GuardWindow } from "@/lib/back-guard";

// Back on a phone: what is open closes first, the recording screen asks, and the history the
// person walks with Back holds the pages they saw.

/** A history of entries and a popstate that arrives a moment after Back, as in a browser. */
function browser() {
  const entries: { state: Record<string, unknown> | null; url: string }[] = [
    { state: { __NA: true, tree: "page" }, url: "http://app.test/meeting" },
  ];
  let index = 0;
  const at = (url: string | URL | null | undefined) => (url ? new URL(String(url), entries[index].url).href : entries[index].url);
  const listeners: (() => void)[] = [];
  const win: GuardWindow = {
    history: {
      get state() {
        return entries[index].state;
      },
      pushState(data, _unused, url) {
        const next = at(url);
        entries.splice(index + 1);
        entries.push({ state: data as Record<string, unknown>, url: next });
        index++;
      },
      replaceState(data, _unused, url) {
        entries[index] = { state: data as Record<string, unknown>, url: at(url) };
      },
      back() {
        if (index === 0) return;
        index--;
        setTimeout(() => listeners.forEach((l) => l()), 0);
      },
    },
    location: {
      get href() {
        return entries[index].url;
      },
    },
    addEventListener(_type, listener) {
      listeners.push(listener);
    },
    setTimeout: (h, ms) => setTimeout(h, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  };
  return {
    win,
    /** The person presses Back. */
    back: () => win.history.back(),
    /** A navigation to another page, as the router makes one. */
    navigate: (url: string) => win.history.pushState({ __NA: true, tree: url }, "", url),
    depth: () => index,
    here: () => entries[index],
  };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("something open over the page", () => {
  it("gets an entry of its own at the same address, keeping the router's state", () => {
    const b = browser();
    createBackGuards(b.win).arm(() => {});
    expect(b.depth()).toBe(1);
    expect(b.here().url).toBe("http://app.test/meeting");
    expect(b.here().state).toMatchObject({ __NA: true, tree: "page" });
    expect(typeof b.here().state?.[GUARD_KEY]).toBe("number");
  });

  it("closes on Back, and the page is where Back leaves it", async () => {
    const b = browser();
    const close = vi.fn();
    createBackGuards(b.win).arm(close);
    b.back();
    await tick();
    expect(close).toHaveBeenCalledOnce();
    expect(b.depth()).toBe(0);
  });

  it("takes its entry with it when closed some other way", async () => {
    const b = browser();
    const guards = createBackGuards(b.win);
    const close = vi.fn();
    const g = guards.arm(close);
    await guards.release(g);
    expect(b.depth()).toBe(0);
    expect(close).not.toHaveBeenCalled();
  });

  it("leaves the history alone when closed by going to another page", async () => {
    const b = browser();
    const guards = createBackGuards(b.win);
    const g = guards.arm(() => {});
    b.navigate("/settings");
    await guards.release(g);
    expect(b.here().url).toBe("http://app.test/settings");
  });

  it("closes the top one first when two are open", async () => {
    const b = browser();
    const guards = createBackGuards(b.win);
    const menu = vi.fn();
    const dialog = vi.fn();
    guards.arm(menu);
    guards.arm(dialog);
    b.back();
    await tick();
    expect(dialog).toHaveBeenCalledOnce();
    expect(menu).not.toHaveBeenCalled();
    b.back();
    await tick();
    expect(menu).toHaveBeenCalledOnce();
  });

  it("does not take a lower guard for one that was already closed", async () => {
    // A menu closed while a dialog stood over it keeps its entry; Back through that entry is not
    // Back through the guard below it.
    const b = browser();
    const guards = createBackGuards(b.win);
    const below = vi.fn();
    guards.arm(below); // the recording screen, say
    const menu = guards.arm(() => {});
    guards.arm(() => {}); // a dialog over the menu
    await guards.release(menu); // not on top: its entry stays
    b.back(); // closes the dialog
    await tick();
    b.back(); // into the menu's leftover entry
    await tick();
    expect(below).not.toHaveBeenCalled();
    b.back(); // past it
    await tick();
    expect(below).toHaveBeenCalledOnce();
  });
});

describe("the router rewriting the entry", () => {
  it("keeps the guard's mark through a refresh of the same page", async () => {
    // Without it the menu's entry looks like the page, and closing the menu leaves it behind.
    const b = browser();
    const guards = createBackGuards(b.win);
    const g = guards.arm(() => {});
    b.win.history.replaceState({ __NA: true, tree: "refreshed" }, "", "/meeting");
    expect(b.here().state?.[GUARD_KEY]).toBe(g.token);
    await guards.release(g);
    expect(b.depth()).toBe(0);
  });

  it("does not carry it to another address", () => {
    const b = browser();
    createBackGuards(b.win).arm(() => {});
    b.win.history.replaceState({ __NA: true, tree: "other" }, "", "/elsewhere");
    expect(b.here().state?.[GUARD_KEY]).toBeUndefined();
  });
});

describe("the recording screen", () => {
  it("asks, and keeps guarding when the answer is to stay", async () => {
    const b = browser();
    const guards = createBackGuards(b.win);
    const ask = vi.fn().mockResolvedValue("stay");
    guards.arm(ask);
    b.back();
    await tick();
    await tick();
    expect(ask).toHaveBeenCalledOnce();
    expect(b.depth()).toBe(1); // guarded again
    b.back();
    await tick();
    await tick();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("clears every guard entry before leaving, so a replace lands on the page itself", async () => {
    const b = browser();
    const guards = createBackGuards(b.win);
    guards.arm(() => {});
    guards.arm(() => {});
    await guards.unwind();
    expect(b.depth()).toBe(0);
    expect(b.here().state?.[GUARD_KEY]).toBeUndefined();
  });
});

describe("the ways off a page", () => {
  const read = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

  it("leave the recording screen only through leave(), which clears the guard first", () => {
    const page = read("app/[id]/recording/page.tsx");
    // The one replace left is leave() itself.
    expect(page.split("router.replace(").length - 1).toBe(1);
    expect(page).toContain("await backGuards().unwind();\n      router.replace(to);");
    // Back wakes a resting screen. It no longer asks "Stop recording?", and links no longer
    // ask either: leaving stops nothing, because the recording is the app's (app/recorder.tsx).
    expect(page).toContain("useBackGuard(resting,");
    expect(page).not.toContain('document.addEventListener("click", onClick, true)');
    expect(read("app/layout.tsx")).toContain("<RecorderProvider>");
  });

  it("do not leave a blank new-meeting form one Back away", () => {
    const form = read("app/new/new-meeting-form.tsx");
    expect(form).not.toMatch(/router\.push\(`\/\$\{meeting\.id\}/);
  });

  it("open the recording screen in place of the meeting page", () => {
    expect(read("app/[id]/page.tsx")).toContain("href={`/${meeting.id}/recording`} replace");
    expect(read("app/[id]/resume-recording-button.tsx")).toMatch(/resume=1`\}\n\s+\/\/[^\n]*\n\s+replace/);
  });

  it("do not keep what was deleted one Back away", () => {
    expect(read("app/[id]/delete-meeting-button.tsx")).toContain('router.replace("/")');
    expect(read("app/series/[id]/delete-series-button.tsx")).toContain('router.replace("/series")');
  });

  it("go back to the list rather than open a new one on top", () => {
    // Not on a meeting's own page any more: the sidebar is the list there (v4, design B), and on a
    // phone it is the menu in the top bar.
    for (const p of ["app/archive/page.tsx", "app/series/page.tsx", "app/series/[id]/page.tsx", "app/trash/trash-list.tsx"]) {
      expect(read(p), p).toMatch(/<BackLink href="\/"[^>]*>\s*\{t\("Back to list"\)\}/);
    }
    expect(read("app/layout.tsx")).toContain("<NavTracker />");
  });

  it("page through months without piling up history", () => {
    const cal = read("app/meeting-calendar.tsx");
    expect(cal.match(/href=\{hrefForMonth\([^)]*\)\)?\}\n\s+replace/g)?.length).toBe(3);
  });

  it("keep the settings tab in the address without making it a step of its own", () => {
    const settings = read("app/settings/page.tsx");
    expect(settings).toContain('window.history.replaceState(null, "", `${url.pathname}${url.search}`)');
    expect(settings).toContain('new URLSearchParams(window.location.search).get("tab")');
  });

  it("close what is open on Back", () => {
    for (const p of [
      "app/confirm-dialog.tsx",
      "app/account-menu.tsx",
      "app/meeting-item-menu.tsx",
      "app/[id]/download-meeting-button.tsx",
      "app/drop-menu.tsx",
      "app/[id]/recording/end-dialog.tsx",
      "app/install-app.tsx",
      "app/settings/stt-profiles.tsx",
    ]) {
      expect(read(p), p).toContain("useBackGuard(");
    }
  });
});
