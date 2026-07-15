import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { readSettings } from "@/lib/settings";
import { collectSpeakerKeys, parseSpeakerLabels, speakerName } from "@/lib/speakers";
import { formatDateTime, formatDuration, formatOffset } from "@/lib/utils";

export const runtime = "nodejs";

const PARTS = ["minutes", "transcript", "meta"] as const;
type Part = (typeof PARTS)[number];

// Meeting export: minutes (.md), transcript (.txt), and a metadata sheet (.md) —
// one raw file for a single part, a zip for several. The recording (WAV) is served
// by the STT host and is downloaded separately by the client (it can be huge).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requested = (new URL(req.url).searchParams.get("parts") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is Part => (PARTS as readonly string[]).includes(p));
  if (requested.length === 0) return apiError("no valid parts requested", 400);

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      transcripts: { orderBy: { createdAt: "asc" } },
      summaries: { orderBy: { createdAt: "desc" } },
      tags: { select: { name: true }, orderBy: { name: "asc" } },
      series: { select: { name: true } },
    },
  });
  if (!meeting) return apiError("not found", 404);

  const labels = parseSpeakerLabels(meeting.speakerLabels);
  const latest = meeting.summaries[0];

  const files = new Map<string, string>();

  if (requested.includes("minutes") && latest) {
    files.set("minutes.md", `# ${meeting.title} — Minutes\n\n${latest.summaryText}\n`);
  }

  if (requested.includes("transcript") && meeting.transcripts.length > 0) {
    const anchor = meeting.transcripts[0].createdAt.getTime();
    const multi = new Set(meeting.transcripts.map((t) => t.speakerType)).size > 1;
    const lines = meeting.transcripts.map((t) => {
      const at = formatOffset((t.createdAt.getTime() - anchor) / 1000);
      return multi
        ? `[${at}] ${speakerName(t.speakerType, labels)}: ${t.text}`
        : `[${at}] ${t.text}`;
    });
    files.set("transcript.txt", `${meeting.title} — Transcript\n\n${lines.join("\n")}\n`);
  }

  if (requested.includes("meta")) {
    const s = await readSettings();
    const speakers = collectSpeakerKeys(
      meeting.transcripts.map((t) => t.speakerType),
      labels,
    ).map((k) => speakerName(k, labels));
    const duration = formatDuration(meeting.startedAt, meeting.endedAt);
    const meta = [
      `# ${meeting.title} — Meeting info`,
      "",
      `- **Date:** ${formatDateTime(meeting.startedAt)}${meeting.endedAt ? ` – ${formatDateTime(meeting.endedAt)}` : ""}${duration ? ` (${duration})` : ""}`,
      meeting.series ? `- **Series:** ${meeting.series.name}` : null,
      meeting.tags.length ? `- **Tags:** ${meeting.tags.map((t) => t.name).join(", ")}` : null,
      `- **Speakers:** ${speakers.join(", ") || "-"}`,
      `- **Utterances:** ${meeting.transcripts.length}`,
      `- **Minutes versions:** ${meeting.summaries.length}${latest ? ` (latest: ${formatDateTime(latest.createdAt)})` : ""}`,
      "",
      "## Purpose & agenda",
      "",
      meeting.description?.trim() || "(not set)",
      "",
      "## Generation settings",
      "",
      latest
        ? `- **Minutes LLM:** ${latest.provider ?? s.llmProvider}${latest.model ? ` / ${latest.model}` : ""}${latest.provider ? "" : " (current setting — not recorded for this version)"}`
        : "- **Minutes LLM:** (no minutes generated)",
      `- **Minutes language / detail:** ${s.summaryLanguage} / ${s.summaryDetail}`,
      `- **Custom minutes format:** ${s.summaryFormat.trim() ? "yes (set in Settings)" : "no (default)"}`,
      `- **Transcription language:** ${meeting.sttLanguage ?? "auto (settings default)"}`,
      `- **Whisper model (current setting):** ${s.whisperModel}`,
      "",
      `_Exported from Voxinq Meeting on ${formatDateTime(new Date())}_`,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
    files.set("meeting-info.md", `${meta}\n`);
  }

  if (files.size === 0) return apiError("nothing to export (no minutes/transcript yet)", 400);

  const safeTitle = meeting.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
  const dispo = (name: string) =>
    `attachment; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`;

  if (files.size === 1) {
    const [name, body] = [...files.entries()][0];
    return new NextResponse(body, {
      headers: {
        "Content-Type": name.endsWith(".md")
          ? "text/markdown; charset=utf-8"
          : "text/plain; charset=utf-8",
        "Content-Disposition": dispo(`${safeTitle}-${name}`),
      },
    });
  }

  const zip = new JSZip();
  for (const [name, body] of files) zip.file(name, body);
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": dispo(`${safeTitle}.zip`),
    },
  });
}
