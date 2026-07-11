// Semantic-search embeddings (server-only). Meetings are indexed into a single
// embedding vector (title + purpose + minutes + transcript head) via a local Ollama
// embedding model, stored as JSON on the meeting, and ranked by cosine similarity in
// the app (no pgvector needed at this scale — hundreds of meetings load in ms).

import { prisma } from "./prisma";
import { getEmbeddingConfig } from "./settings";
import { cosineSimilarity } from "./voiceprint";

const INDEX_TEXT_MAX_CHARS = 8000;

/** Embed one text via the Ollama embeddings API. Throws with a readable message on failure. */
export async function embedText(text: string): Promise<{ vector: number[]; model: string }> {
  const { baseUrl, model } = await getEmbeddingConfig();
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
      // First call may need to load the model into VRAM.
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new Error("Cannot reach Ollama for embeddings");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      detail.includes("not found")
        ? `Embedding model "${model}" is not installed — run: ollama pull ${model}`
        : `Embedding request failed (HTTP ${res.status})`,
    );
  }
  const data = (await res.json()) as { embeddings?: number[][] };
  const vector = data.embeddings?.[0];
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error("Embedding response was empty");
  }
  return { vector, model };
}

/** The text a meeting is indexed under. */
function buildIndexText(m: {
  title: string;
  description: string | null;
  summary?: string | null;
  transcriptHead?: string | null;
}): string {
  const parts = [m.title, m.description ?? "", m.summary ?? "", m.transcriptHead ?? ""];
  return parts.filter(Boolean).join("\n\n").slice(0, INDEX_TEXT_MAX_CHARS);
}

/** (Re)build the embedding for one meeting. Best-effort — throws on embedding failure. */
export async function indexMeeting(meetingId: string): Promise<void> {
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      title: true,
      description: true,
      summaries: { orderBy: { createdAt: "desc" }, take: 1, select: { summaryText: true } },
      transcripts: { orderBy: { createdAt: "asc" }, take: 80, select: { text: true } },
    },
  });
  if (!m) return;
  const text = buildIndexText({
    title: m.title,
    description: m.description,
    summary: m.summaries[0]?.summaryText,
    transcriptHead: m.transcripts.map((t) => t.text).join("\n"),
  });
  if (!text.trim()) return;
  const { vector, model } = await embedText(text);
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { embedding: JSON.stringify(vector), embeddingModel: model },
  });
}

export type SemanticHit = { id: string; similarity: number };

/**
 * Rank indexed meetings against a query. Returns hits (best first) plus how many
 * candidate meetings are not indexed yet (so the UI can offer to build the index).
 */
export async function semanticSearch(
  query: string,
  limit = 20,
): Promise<{ hits: SemanticHit[]; unindexed: number }> {
  const { vector: qvec, model } = await embedText(query);
  const rows = await prisma.meeting.findMany({
    where: { deletedAt: null },
    select: { id: true, embedding: true, embeddingModel: true },
  });
  const hits: SemanticHit[] = [];
  let unindexed = 0;
  for (const r of rows) {
    if (!r.embedding || r.embeddingModel !== model) {
      unindexed += 1;
      continue;
    }
    let vec: number[] | null = null;
    try {
      const parsed: unknown = JSON.parse(r.embedding);
      if (Array.isArray(parsed)) vec = parsed as number[];
    } catch {
      // treat as unindexed
    }
    if (!vec) {
      unindexed += 1;
      continue;
    }
    const sim = cosineSimilarity(qvec, vec);
    if (sim > 0) hits.push({ id: r.id, similarity: sim });
  }
  hits.sort((a, b) => b.similarity - a.similarity);
  return { hits: hits.slice(0, limit), unindexed };
}
