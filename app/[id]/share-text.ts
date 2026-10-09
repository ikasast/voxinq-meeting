// Taking a meeting's text away: the share sheet where the device has one, the clipboard where it
// does not, or a file. Used by the minutes' and the transcript's menus.

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

/** Saves the text as a file. */
export function downloadText(text: string, filename: string, type = "text/plain") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
