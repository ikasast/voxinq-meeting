// Taking a meeting's text away: the share sheet where the device has one, the clipboard where it
// does not. Used beside the minutes and in the transcript's menu.

/**
 * Hands the text to the device's share sheet where there is one, and otherwise — or when the
 * sheet is dismissed — copies it.
 */
export async function shareText(text: string, title?: string): Promise<"shared" | "copied" | "failed"> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title, text });
      return "shared";
    } catch {
      // ignore cancel etc. and fall back to copy
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
