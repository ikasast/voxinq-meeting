import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const screen = read("app/recovery-code.tsx");

// The one screen where skimming costs somebody their meetings. Everything asserted here exists
// to slow a reader down, and every one of them is the kind of thing that gets "simplified" by
// somebody who does not know why it is there.

describe("the recovery code screen", () => {
  it("says it will never be shown again, before the code", () => {
    // The warning has to be read first. Underneath the code it is a caption on something the
    // reader has already decided to skip.
    const warning = screen.indexOf("never shown again");
    const theCode = screen.indexOf("{code}");
    expect(warning).toBeGreaterThan(-1);
    expect(warning).toBeLessThan(theCode);
  });

  it("says who cannot get it back, by name", () => {
    // "Keep this safe" is advice. "An administrator cannot produce it" is a fact, and it is the
    // one that changes what somebody does next.
    expect(screen).toContain("It is not stored anywhere");
    expect(screen).toContain("an administrator");
  });

  it("asks once more before letting anybody leave", () => {
    expect(screen).toContain("Have you saved your recovery code?");
    expect(screen).toContain('confirmLabel: "Yes, I have saved it"');
    expect(screen).toContain('cancelLabel: "Not yet"');
    // Cancelling has to leave them exactly where they were.
    expect(screen).toContain("if (ok) onDone();");
  });

  it("copies in one tap, and still works where the clipboard API does not exist", () => {
    // `navigator.clipboard` is absent outside a secure context, and this app is routinely
    // reached over plain http on a home network — the deployment least likely to have a
    // password manager is the one where the modern API is missing.
    expect(screen).toContain("navigator.clipboard.writeText(code)");
    expect(screen).toContain('document.execCommand("copy")');
  });

  it("selects the code when it cannot copy, rather than failing silently", () => {
    // A button that reports nothing is worse than no button: the reader believes it worked.
    expect(screen).toContain("selectCode(codeRef.current)");
    expect(screen).toContain("would not let the page copy");
  });
});

describe("where the code is shown", () => {
  it("after the first account is created", () => {
    expect(read("app/setup/setup-form.tsx")).toContain("<RecoveryCode");
  });

  it("after somebody sets their first password", () => {
    expect(read("app/account/account-form.tsx")).toContain("<RecoveryCode");
  });

  it("after a reset that started the key over", () => {
    expect(read("app/reset/[token]/reset-form.tsx")).toContain("<RecoveryCode");
  });

  it("without leaving the previous screen's heading above it", () => {
    // The page under /setup used to keep saying "Create the first account" over a recovery
    // code, which reads as a form that has not been submitted yet.
    expect(read("app/setup/page.tsx")).not.toContain("Create the first account");
    expect(screen).toContain("Your recovery code");
  });
});

describe("starting again without the code", () => {
  const form = read("app/reset/[token]/reset-form.tsx");

  it("is behind its own confirmation, with the loss spelled out", () => {
    expect(form).toContain("Start again without your old meetings?");
    expect(form).toContain("can never be read again");
    expect(form).toContain('confirmLabel: "Start again — I accept losing them"');
  });

  it("only ever sends the flag because somebody pressed that button", () => {
    // Not inferred from an empty field: somebody who has mislaid the code for a minute should
    // meet a refusal, not a new key.
    expect(form).toContain("if (ok) await post(true);");
    expect(form).toContain("startOver: startOver || undefined");
  });
});
