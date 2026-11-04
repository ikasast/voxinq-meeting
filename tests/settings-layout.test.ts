import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Settings, rearranged after a look at it on a phone (2026-11-03): one place to choose the minutes
// model, search results that stand out, each extension's settings marked as its own, the display
// size as a slider and the meeting notification as one switch.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const page = read("app/settings/page.tsx");
const field = read("app/settings/ollama-model-field.tsx");
const search = read("app/settings/ollama-library-search.tsx");

describe("the minutes model", () => {
  it("is chosen from what the Ollama has, with typing a name behind a link", () => {
    // It was a box with the installed models as suggestions, then a search, suggestions and the
    // installed models again: four things, and nowhere that said which one chose.
    expect(field).toContain('role="radiogroup"');
    expect(field).toContain("onChange={() => onChange(m.name)}");
    expect(field).not.toContain("<datalist");
    expect(field).not.toContain("<details");
    expect(field).toContain('t("Type a name")');
  });

  it("is added from one place, where the suggestions wait until something is searched for", () => {
    const add = field.indexOf('t("Add a model")');
    expect(add).toBeGreaterThan(field.indexOf('role="radiogroup"'));
    expect(field.indexOf("<OllamaLibrarySearch")).toBeGreaterThan(add);
    expect(field.indexOf("suggestions(t).map")).toBeGreaterThan(field.indexOf("<OllamaLibrarySearch"));
    expect(search).toContain("{models === null && !failed ? children : null}");
  });

  it("shows search results in a box of their own, counted, and finding nothing in red", () => {
    expect(search).toContain('t("Results for “{q}” ({n})"');
    const alert = search.slice(search.indexOf('role="alert"') - 200, search.indexOf('t("No model matches'));
    expect(alert).toContain("var(--error)");
  });

  it("for questions, is chosen from the same list", () => {
    const prep = page.slice(page.indexOf('id="ollamaPrepModel"'), page.indexOf("</select>", page.indexOf('id="ollamaPrepModel"')));
    expect(prep).toContain("ollamaInstalled.map");
    expect(page).toContain("onInstalled={setOllamaInstalled}");
    expect(page).not.toContain('list="ollama-installed"');
  });
});

describe("an extension's settings", () => {
  it("are gathered at the foot of their tab and say whose they are", () => {
    for (const [id, label] of [
      ["translation", "Japanese translation"],
      ["minutesFormats", "Formats"],
      ["prep", "Model for preparing questions"],
    ]) {
      const row = page.indexOf(`label={t("${label}")}`);
      expect(row, label).toBeGreaterThan(-1);
      const heading = page.lastIndexOf('<ExtensionSettingsHeading>{t("Extension settings")}</ExtensionSettingsHeading>', row);
      expect(heading, label).toBeGreaterThan(-1);
      expect(page.slice(row, row + 400), label).toContain(`<ExtensionChip id="${id}"`);
    }
    expect(page).toContain('<ExtensionChip id="schedule"');
  });

  it("open that extension's card for an administrator", () => {
    expect(read("app/settings/extension-chip.tsx")).toContain("href={`/admin?tab=extensions&open=${id}`}");
    expect(read("app/admin/page.tsx")).toContain("EXTENSION_IDS.find((id) => id === open)");
    expect(read("app/settings/extensions-settings.tsx")).toContain("useState<ExtensionId | null>(initialOpen)");
  });
});

describe("the display size", () => {
  it("is a slider with a step either side, applied when it is let go", () => {
    const setting = read("app/settings/display-size-setting.tsx");
    expect(setting).toContain('type="range"');
    expect(setting).toContain("onPointerUp={(e) => apply(Number(e.currentTarget.value))}");
    expect(setting).not.toContain("<select");
  });
});

describe("the meeting notification", () => {
  const card = read("app/settings/reminder-notifications.tsx");

  it("is one row with a switch", () => {
    expect(card).toContain('t("Meeting start notifications")');
    expect(card).toContain("<Switch");
  });

  it("can be switched off here, though a site cannot take back the browser's permission", () => {
    const notices = read("app/device-notifications.ts");
    expect(notices).toContain('if (Notification.permission === "granted" && switchedOff()) return "off";');
    // The banner shows a reminder only when it is "granted", so "off" silences it.
    expect(read("app/due-meeting-alert.tsx")).toContain('if (notifyState() !== "granted") return;');
  });

  it("opens the app's own notification settings in the Android app", () => {
    expect(card).toContain("openAppNotificationSettings()");
    expect(read("lib/stt/native.ts")).toContain('send({ type: "notificationSettings" });');
    expect(read("android/app/src/main/java/io/github/ikasast/voxinq/MainActivity.kt")).toContain(
      '"notificationSettings" -> {',
    );
  });
});
