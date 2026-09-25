// Dividing a line between the people who spoke in it.
//
// An utterance is cut where the room goes quiet, never where the speaker changes, so a quick
// exchange — a question and the "はい" that answers it — lands in one line, and that whole line
// used to go to whoever spoke most of it. The recogniser's word times (kept beside the
// recording) and the diarizer's turns together say where the change falls, and the diarizer
// returns the pieces. This is what turns those pieces into rows.
//
// The line that was there keeps the first piece, so its id, its place in the order and
// anything pointing at it survive. The rest become new lines just after it, each remembering
// which line it came from — that is what `undoSplits` walks back.

import { prisma } from "@/lib/prisma";
import { reindexAfterWrite } from "@/lib/crypto/reindex-hook";
import { diarizerLabelToKey, isValidSpeakerKey } from "@/lib/speakers";

/** One part of a divided line, as the diarizer returns it (seconds, and its own label). */
export type SplitPiece = { speaker: string; text: string; start: number; end: number };

export type RowToSplit = {
  id: string;
  text: string;
  createdAt: Date;
};

export type SplitPlan = {
  rowId: string;
  pieces: { speaker: string; text: string; audioStartMs: number; audioEndMs: number }[];
};

/** Only the spacing may differ: the pieces are the line's own words, in order. */
const sameText = (a: string, b: string) => a.replace(/\s+/g, "") === b.replace(/\s+/g, "");

/**
 * Which lines can be divided, and into what.
 *
 * Refuses more than it accepts, because every refusal leaves a line exactly as it is while a
 * wrong acceptance rewrites one. A line is divided only when the pieces are whole, in the
 * past, and add up to the text that is there now — which they do not when somebody has edited
 * it since, and rewriting an edited line from the recogniser's words would throw that edit
 * away without a word.
 */
export function planSplits(
  rows: RowToSplit[],
  pieces: (SplitPiece[] | null | undefined)[],
): SplitPlan[] {
  const plans: SplitPlan[] = [];
  rows.forEach((row, i) => {
    const parts = pieces[i];
    if (!Array.isArray(parts) || parts.length < 2) return;
    const cleaned = parts.map((p) => ({
      speaker: diarizerLabelToKey(p.speaker),
      text: (p.text ?? "").trim(),
      audioStartMs: Math.round((p.start ?? 0) * 1000),
      audioEndMs: Math.round((p.end ?? 0) * 1000),
    }));
    const usable = cleaned.every(
      (p) =>
        p.text &&
        isValidSpeakerKey(p.speaker) &&
        Number.isFinite(p.audioStartMs) &&
        p.audioEndMs > p.audioStartMs &&
        p.audioStartMs >= 0,
    );
    if (!usable) return;
    if (new Set(cleaned.map((p) => p.speaker)).size < 2) return; // nothing to divide
    if (!sameText(cleaned.map((p) => p.text).join(""), row.text)) return;
    plans.push({ rowId: row.id, pieces: cleaned });
  });
  return plans;
}

/** Carry out the plans. Returns how many lines were divided and how many lines that added. */
export async function applySplits(meetingId: string, rows: RowToSplit[], plans: SplitPlan[]) {
  if (plans.length === 0) return { split: 0, added: 0 };
  const byId = new Map(rows.map((r) => [r.id, r]));
  const writes = [];
  let added = 0;

  for (const plan of plans) {
    const row = byId.get(plan.rowId);
    if (!row) continue;
    const [first, ...rest] = plan.pieces;
    writes.push(
      prisma.transcript.update({
        where: { id: row.id },
        data: {
          text: first.text,
          speakerType: first.speaker,
          audioStartMs: first.audioStartMs,
          audioEndMs: first.audioEndMs,
          // The translation was of the whole line, and the whole line is no longer here.
          translation: null,
        },
      }),
    );
    rest.forEach((piece, k) => {
      writes.push(
        prisma.transcript.create({
          data: {
            meetingId,
            text: piece.text,
            speakerType: piece.speaker,
            audioStartMs: piece.audioStartMs,
            audioEndMs: piece.audioEndMs,
            // Lines are ordered by when they were created, so these sit immediately after the
            // one they came out of — milliseconds after it, and well before the next line.
            createdAt: new Date(row.createdAt.getTime() + k + 1),
            splitOfId: row.id,
          },
        }),
      );
      added += 1;
    });
  }

  await prisma.$transaction(writes);
  // The text moved between lines, and search reads lines.
  await reindexAfterWrite(meetingId);
  return { split: plans.length, added };
}

/**
 * Put divided lines back together.
 *
 * The way back from a split anyone disagrees with. Each line that came out of another is
 * appended to it, in order, and removed. The speaker kept is the first piece's: the label the
 * line had before the split was whoever spoke most of it, and reviving that would be pretending
 * to know something nobody wrote down.
 */
export async function undoSplits(meetingId: string) {
  const rows = await prisma.transcript.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
    select: { id: true, text: true, audioEndMs: true, splitOfId: true },
  });
  const parents = new Map(rows.filter((r) => !r.splitOfId).map((r) => [r.id, r]));
  const children = rows.filter((r) => r.splitOfId && parents.has(r.splitOfId));
  if (children.length === 0) return { merged: 0, removed: 0 };

  const grouped = new Map<string, typeof children>();
  for (const child of children) {
    const list = grouped.get(child.splitOfId!) ?? [];
    list.push(child);
    grouped.set(child.splitOfId!, list);
  }

  const writes = [];
  for (const [parentId, list] of grouped) {
    const parent = parents.get(parentId)!;
    writes.push(
      prisma.transcript.update({
        where: { id: parentId },
        data: {
          text: [parent.text, ...list.map((c) => c.text)].join(""),
          audioEndMs: list.at(-1)?.audioEndMs ?? parent.audioEndMs,
          translation: null,
        },
      }),
    );
  }
  writes.push(
    prisma.transcript.deleteMany({ where: { id: { in: children.map((c) => c.id) } } }),
  );

  await prisma.$transaction(writes);
  await reindexAfterWrite(meetingId);
  return { merged: grouped.size, removed: children.length };
}
