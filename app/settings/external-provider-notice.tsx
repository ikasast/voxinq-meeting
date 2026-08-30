import { llmDestination } from "@/lib/llm/destination";

// What choosing a cloud provider actually does, said before it is chosen rather than after.
//
// The provider list used to mark only Ollama as "local" and leave the rest to be inferred from
// a name: "Anthropic (Claude API)" does not tell anyone that the whole meeting transcript is
// about to be sent to another company and billed per token. Both halves matter, and the first
// one matters more -- someone who would accept the cost may not accept the destination.
//
// Amber rather than red. This is a legitimate choice that the app supports on purpose, and a
// cloud model genuinely writes better minutes than a 7B on 8 GB. Red would read as "you have
// made a mistake", which is not the message: the message is "know what this does".
//
// Driven by `llmDestination`, so it follows the base URL rather than the provider's name --
// "OpenAI-compatible" pointed at LM Studio stays quiet, and Ollama pointed at a remote host
// does not.
export function ExternalProviderNotice({
  settings,
}: {
  settings: { llmProvider: string; ollamaBaseUrl?: string; openaiBaseUrl?: string };
}) {
  const dest = llmDestination(settings);
  if (!dest.external) return null;

  return (
    <div
      role="note"
      className="rounded-md border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] p-3"
    >
      <p className="text-xs font-semibold text-[var(--warning)]">
        This sends your meetings to {dest.host}
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-[var(--text-secondary)]">
        <li>
          The <strong>full transcript</strong> of a meeting is uploaded each time minutes are
          written or regenerated, and each time you ask a question about a series.
        </li>
        <li>
          Their terms decide how long it is kept and whether it trains anything. Voxinq cannot
          change that.
        </li>
        <li>You are billed by them, per token. Long meetings cost more than short ones.</li>
      </ul>
      <p className="mt-1.5 text-xs text-[var(--text-muted)]">
        Audio never leaves this machine either way — transcription is always local.
      </p>
    </div>
  );
}
