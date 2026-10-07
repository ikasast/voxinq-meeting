import type { ExtensionState } from "./extensions";
import type { AppSettings } from "./settings";

// The settings as the app acts on them, with what belongs to a switched-off extension reading as
// unused: no translation, Ollama for minutes, this machine for transcription, the built-in
// format. Nothing stored is changed, so switching the extension back on brings each choice back.
//
// Pure, and a separate module from lib/settings.ts so it can be tested without a settings file;
// readEffectiveSettings() there applies it to what is stored.

export function withExtensions(s: AppSettings, on: ExtensionState): AppSettings {
  return {
    ...s,
    sttTranslate: on.translation && s.sttTranslate,
    llmProvider: on.externalAi ? s.llmProvider : "ollama",
    sttProfiles: on.externalAi ? s.sttProfiles : [],
    sttDefaultProfileId: on.externalAi ? s.sttDefaultProfileId : "",
    minutesTemplates: on.minutesFormats ? s.minutesTemplates : [],
    defaultMinutesTemplateId: on.minutesFormats ? s.defaultMinutesTemplateId : "",
  };
}

/**
 * What a save leaves alone while its extension is off. The screen was shown the unused value
 * (above), so what it sends back is that value, not a choice — saving it would overwrite the one
 * kept for when the extension comes back.
 */
export function keysKeptWhileOff(on: ExtensionState): (keyof AppSettings)[] {
  return [
    ...(on.translation ? [] : (["sttTranslate"] as const)),
    ...(on.externalAi ? [] : (["llmProvider", "sttProfiles", "sttDefaultProfileId"] as const)),
    ...(on.minutesFormats ? [] : (["minutesTemplates", "defaultMinutesTemplateId"] as const)),
  ];
}
