import { apiError } from "@/lib/api";
import type { ExtensionId } from "@/lib/extensions";
import { extensionEnabled } from "@/lib/extensions-store";

/**
 * For an API route of an extension (lib/extensions.ts): null when it is on, otherwise the 404
 * to return. Not found rather than forbidden: switched off, the feature is not there.
 */
export async function extensionOff(id: ExtensionId) {
  if (await extensionEnabled(id)) return null;
  return apiError("This feature is switched off. An administrator can switch it on under Settings, Extensions.", 404);
}
