import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newProfileId } from "../lib/stt/profiles";

// This machine is a row in the endpoints table, and the model it runs is behind that row's
// Edit.
//
// It used to be a select of its own below the table, which is where the confusion was: a
// control labelled "Model", under a list of endpoints that each have a model of their own,
// belonging to none of them. Nothing on the page said it was about this machine.
//
// The two halves live in different files -- the table in stt-profiles.tsx, the model picker in
// page.tsx, passed in -- so nothing in the type system notices if one of them is dropped. The
// picker would simply stop being on the page, and the only symptom is a setting you can no
// longer reach.

const root = join(__dirname, "..");
const page = readFileSync(join(root, "app/settings/page.tsx"), "utf8");
const table = readFileSync(join(root, "app/settings/stt-profiles.tsx"), "utf8");

describe("the settings page", () => {
  it("hands the local model and its editor to the table", () => {
    expect(page).toMatch(/localModel=\{settings\.whisperModel\}/);
    expect(page).toMatch(/localEditor=\{/);
  });

  it("keeps the model picker inside that editor rather than loose on the page", () => {
    const select = page.indexOf('id="whisperModel"');
    const from = page.indexOf("localEditor={");
    const to = page.indexOf("onChange={setDraftProfiles}");
    expect(select, "the local model picker is gone from the settings page").toBeGreaterThan(-1);
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    expect(
      select > from && select < to,
      "the model picker is back outside the endpoint list, where it reads as belonging to nothing",
    ).toBe(true);
  });
});

describe("the row for this machine", () => {
  // Everything else in the table you added and can take away again. There is always a machine.
  it("offers no way to remove it", () => {
    // The rows before the saved ones start. `{profiles.map(` also builds the default-endpoint
    // <option> list higher up the file, so the search starts from the table itself.
    const tbody = table.indexOf("<tbody>");
    const body = table.slice(tbody, table.indexOf("{profiles.map(", tbody));
    expect(body).toContain("On this machine");
    expect(body).toMatch(/>\s*Edit\s*</);
    expect(body, "the machine cannot be removed from the machine").not.toMatch(/>\s*Remove\s*</);
  });

  it("cannot be mistaken for a saved endpoint", () => {
    // The row is addressed by an id, and a collision would open the wrong editor. Generated
    // ids all start with "p"; this one does not, and that is the whole guarantee.
    expect(table).toContain('const LOCAL_ID = "local"');
    for (let i = 0; i < 200; i++) expect(newProfileId()).not.toBe("local");
  });
});
