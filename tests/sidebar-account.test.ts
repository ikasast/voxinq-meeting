import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The foot of the sidebar says whose session it is: the picture and the name while the sidebar
// is open, the picture alone on the folded rail.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("the account in the sidebar", () => {
  it("shows the name beside the picture in the open sidebar only", () => {
    const sidebar = read("app/sidebar.tsx");
    expect(sidebar).toContain("cloneElement(account, { withName: true })");
    // The rail keeps the account as the layout made it: the picture.
    expect(sidebar).toContain('<div className="mt-1">{account}</div>');
    expect(read("app/account-menu.tsx")).toContain("{name || username}</span>");
  });
});
