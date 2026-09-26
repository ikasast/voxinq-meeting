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
 * Scripts written without spaces between words: kana, CJK ideographs, and the full-width forms
 * and punctuation that go with them. Between two of these, pieces join directly; anywhere else
 * a space was there before the line was divided.
 */
const UNSPACED = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/**
 * Put the pieces of a line back into one string.
 *
 * Each piece was trimmed when the line was divided, so the space an English line had between
 * "the date?" and "Yes" went with it — joining with nothing turned it into "the date?Yes". A
 * space goes back wherever neither side of the join is written without them; a Japanese line
 * joins as it always did.
 */
export function joinPieces(parts: string[]): string {
  let out = "";
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (!out) {
      out = part;
      continue;
    }
    const spaced = !UNSPACED.test(out.at(-1)!) && !UNSPACED.test(part[0]);
    out += (spaced ? " " : "") + part;
  }
  return out;
}

/**
 * The lines a run asked about, with the text each has now.
 *
 * Diarization reads the lines when it starts and answers minutes later. A line somebody
 * corrected in between must be judged by the correction, not by what it said when the run
 * began — otherwise the pieces match the old words and the division writes them back over the
 * new ones. A line that is gone has no text, which nothing can match.
 */
export function withCurrentText<R extends RowToSplit>(asked: R[], now: { id: string; text: string }[]): R[] {
  const current = new Map(now.map((r) => [r.id, r.text]));
  return asked.map((r) => ({ ...r, text: current.get(r.id) ?? "" }));
}

type RowToMerge = { id: string; text: string; audioEndMs: number | null; splitOfId: string | null };

export type MergePlan = { keepId: string; text: string; audioEndMs: number | null; removeIds: string[] };

/**
 * Which lines go back together, and into what.
 *
 * Every line cut from another sits just after the line it came from — a millisecond or two
 * after it, and well before the next line — so a run of divided lines belongs to the undivided
 * line in front of it. Walking the order, rather than following each line's pointer, also
 * mends what a pointer cannot: a piece divided again points at another piece, and a piece whose
 * line was merged away points at nothing, and both still belong to the line in front of them.
 */
export function planMerges(rows: RowToMerge[]): MergePlan[] {
  const plans: MergePlan[] = [];
  let root: RowToMerge | null = null;
  let group: RowToMerge[] = [];
  const close = () => {
    if (root && group.length > 0) {
      plans.push({
        keepId: root.id,
        text: joinPieces([root.text, ...group.map((g) => g.text)]),
        audioEndMs: group.at(-1)!.audioEndMs ?? root.audioEndMs,
        removeIds: group.map((g) => g.id),
      });
    }
    group = [];
  };
  for (const row of rows) {
    if (!row.splitOfId) {
      close();
      root = row;
    } else if (root) {
      group.push(row);
    }
  }
  close();
  return plans;
}

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
 * The lines as they were recognised, from lines some of which an earlier run divided.
 *
 * Nothing is written: this is what a diarization asks about. Asked about the pieces instead, a
 * second run would divide one of them again — a piece of a piece. The transcript itself only
 * changes once the answer is in hand, so a run that fails leaves an earlier division alone.
 */
export function asRecognised<
  R extends { id: string; text: string; audioEndMs: number | null; splitOfId: string | null },
>(rows: R[]): R[] {
  const merges = new Map(planMerges(rows).map((m) => [m.keepId, m]));
  return rows
    .filter((r) => !r.splitOfId)
    .map((r) => {
      const m = merges.get(r.id);
      return m ? { ...r, text: m.text, audioEndMs: m.audioEndMs } : r;
    });
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
  const plans = planMerges(rows);
  if (plans.length === 0) return { merged: 0, removed: 0 };

  const writes = [];
  for (const plan of plans) {
    writes.push(
      prisma.transcript.update({
        where: { id: plan.keepId },
        data: { text: plan.text, audioEndMs: plan.audioEndMs, translation: null },
      }),
    );
  }
  const removed = plans.flatMap((p) => p.removeIds);
  writes.push(prisma.transcript.deleteMany({ where: { id: { in: removed } } }));

  await prisma.$transaction(writes);
  await reindexAfterWrite(meetingId);
  return { merged: plans.length, removed: removed.length };
}
