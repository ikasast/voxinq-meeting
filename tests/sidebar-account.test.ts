import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The foot of the sidebar says whose session it is: the picture and the name while the sidebar
// is open, the picture alone on the folded rail.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("the account in the sidebar", () => {
  it("shows the name beside the picture in the open sidebar only", () => {
    const sidebar = read("app/sidebar.tsx");
    // Rendered here from the account's data. It used to be an element the layout made, which
    // cloneElement could not switch the name on for: an element from a server component is not
    // a plain element on the client, so the open sidebar showed the picture alone.
    expect(sidebar).not.toContain("cloneElement");
    expect(sidebar).toContain("<AccountMenu {...me} docsUrl={docsUrl} withName />");
    // The rail: the picture alone.
    expect(sidebar).toContain('<div className="mt-1">{me ? <AccountMenu {...me} docsUrl={docsUrl} /> : null}</div>');
    // The display name, and the username under it when there is a display name to tell apart.
    const menu = read("app/account-menu.tsx");
    expect(menu).toContain("{name || username}</span>");
    expect(menu).toContain('{name ? <span className="truncate text-xs text-[var(--text-muted)]">{username}</span> : null}');
  });

  // The foot held so many links that they crowded the meetings (2026-11-03). Administration,
  // Help and Settings moved into the account's menu; Series, Feedback and Queue stay.
  it("leaves Administration, Help and Settings to the account's menu", () => {
    const sidebar = read("app/sidebar.tsx");
    const foot = sidebar.slice(sidebar.indexOf("const footLinks"), sidebar.indexOf("const full ="));
    const gate = foot.indexOf("{!me ? (");
    expect(gate, "the three are no longer behind having no account").toBeGreaterThan(-1);
    for (const href of ['href="/admin"', "href={docsUrl}", 'href="/settings"']) {
      expect(foot.indexOf(href), href).toBeGreaterThan(gate);
    }
    for (const href of ['href="/series"', 'href="/reviews"', 'href="/queue"']) {
      expect(foot.indexOf(href), href).toBeLessThan(gate);
    }
    const menu = read("app/account-menu.tsx");
    for (const href of ['href="/settings"', 'href="/admin"', "href={docsUrl}"]) expect(menu).toContain(href);
  });

  it("has no shade over the meetings", () => {
    const sidebar = read("app/sidebar.tsx");
    const foot = sidebar.slice(sidebar.indexOf("const FOOT ="), sidebar.indexOf("const FOOT_STYLE"));
    expect(foot).not.toContain("shadow");
  });
});
