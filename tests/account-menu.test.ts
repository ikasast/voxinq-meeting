import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("the corner of the screen", () => {
  const layout = read("app/layout.tsx");
  const menu = read("app/account-menu.tsx");

  it("is a person, not a log-out button", () => {
    // Signing out used to be the only account-shaped thing the app had, so it was the only
    // thing there. Now that people have names and faces the corner says whose session this is,
    // and signing out is one item inside it.
    expect(layout).toContain("<AccountMenu");
    expect(layout).not.toContain("LogoutButton");
  });

  it("holds the three things that follow from being signed in", () => {
    expect(menu).toContain('href="/account"');
    expect(menu).toContain('href="/settings"');
    expect(menu).toContain('fetch("/api/auth/logout"');
  });

  it("closes on Escape and when the page moves under it", () => {
    // It is positioned from the button's rectangle, so a scroll leaves it somewhere arbitrary.
    expect(menu).toContain('e.key === "Escape"');
    expect(menu).toContain('window.addEventListener("scroll", close, true)');
  });

  it("does not carry a picture into the HTML to decide whether one exists", () => {
    expect(layout).toContain("select: { imageType: true }");
  });
});

describe("reaching the queue from a phone", () => {
  const layout = read("app/layout.tsx");
  const header = read("app/queue-header-link.tsx");
  const rail = read("app/side-rail.tsx");

  it("has a way in that is not the address bar", () => {
    // The rail that carries the queue is desktop-only, so on a phone there was no link to it
    // anywhere — on the screen that answers "has my minutes finished yet".
    expect(layout).toContain("<QueueHeaderLink />");
  });

  it("counts your own work, not the machine's", () => {
    // The queue lists everybody now. A badge reading 3 when none of the three are yours is not
    // a notification; it is a wrong answer to the question a badge is asked.
    expect(header).toContain("d.jobs.filter((j) => j.mine).length");
  });

  it("uses one count for both badges", () => {
    // Two implementations of "how many" eventually disagree in front of somebody.
    expect(rail).toContain("useMyQueueCount()");
    expect(header).toContain("export function useMyQueueCount()");
    expect(rail).not.toContain("fetch(\"/api/jobs\"");
  });
});
