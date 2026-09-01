import { externalHostOf } from "../llm/destination";

/** Just enough of a profile to say where it points. */
type ProfileLike = { id: string; name: string; baseUrl: string };

/**
 * The host a profile sends to, or null when it does not leave your network.
 *
 * Judged by URL rather than by the fact that a profile exists. A whisper server of your own on
 * the next machine is a case this feature serves as much as any cloud, and warning about it
 * would be wrong -- the same rule the LLM side uses, from the same function.
 */
export function profileDestination(profile: ProfileLike | undefined | null): string | null {
  if (!profile) return null;
  return externalHostOf(profile.baseUrl ?? "");
}

/** Where recognition goes by default, or null when it stays on this machine. */
export function sttDestination(settings: {
  sttDefaultProfileId?: string;
  sttProfiles?: ProfileLike[];
}): string | null {
  const id = settings.sttDefaultProfileId;
  if (!id) return null;
  return profileDestination((settings.sttProfiles ?? []).find((p) => p.id === id));
}
