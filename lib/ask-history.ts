import { asUser } from "./db/scope";
import { LOCKED } from "./crypto/field";
import { prisma } from "./prisma";

// Questions asked about meetings, and their answers, kept to be read again (AskTurn).
//
// Saved as the answer is sent, on the meeting the question was asked on — or on the series, when
// it was asked on the series page. The question and the answer are one encrypted field, as the
// minutes are: an answer quotes what was said, and somebody with the database should read no
// more of it than of the transcript it came from.
//
// The owner is given explicitly rather than read from the request: the answer is kept from inside
// a stream, and a write there must not depend on the request still being in reach.

type Turn = {
  ownerId: string | null;
  meetingId?: string;
  seriesId?: string;
  source: string;
  question: string;
};

const META = ["used", "omitted", "withoutMinutes", "condensed", "parts"] as const;

/** Keep a question and its answer. The id and time go back to the page; nothing on failure. */
export async function keepTurn(
  turn: Turn,
  result: Record<string, unknown>,
): Promise<{ id?: string; createdAt?: string }> {
  const answer = typeof result.answer === "string" ? result.answer : "";
  if (!answer) return {};
  const meta = Object.fromEntries(META.filter((k) => result[k] !== undefined).map((k) => [k, result[k]]));
  const write = () =>
    prisma.askTurn.create({
      data: {
        ...(turn.meetingId ? { meetingId: turn.meetingId } : turn.seriesId ? { seriesId: turn.seriesId } : {}),
        source: turn.source,
        body: JSON.stringify({ question: turn.question, answer }),
        meta: JSON.stringify(meta),
      },
      select: { id: true, createdAt: true },
    });
  try {
    const row = turn.ownerId ? await asUser(turn.ownerId, write) : await write();
    return { id: row.id, createdAt: row.createdAt.toISOString() };
  } catch (e) {
    // An answer that could not be kept is still an answer.
    console.error("[ask] could not keep the answer", (e as Error).message);
    return {};
  }
}

export type KeptTurn = {
  id: string;
  source: string;
  question: string;
  answer: string;
  meta: Record<string, unknown>;
  createdAt: string;
  /** The owner's key is not open: there is a turn here, but it cannot be read now. */
  locked?: boolean;
};

/** The history where the panel was opened, oldest first, the latest 200. */
export async function turnsFor(where: { meetingId: string } | { seriesId: string }): Promise<KeptTurn[]> {
  const rows = await prisma.askTurn.findMany({
    where: "meetingId" in where ? { meetingId: where.meetingId } : { seriesId: where.seriesId, meetingId: null },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, source: true, body: true, meta: true, createdAt: true },
  });
  return rows.reverse().map((r) => {
    let question = "";
    let answer = "";
    let locked = false;
    if (r.body === LOCKED) {
      locked = true;
    } else {
      try {
        const b = JSON.parse(r.body) as { question?: string; answer?: string };
        question = b.question ?? "";
        answer = b.answer ?? "";
      } catch {
        locked = true;
      }
    }
    let meta: Record<string, unknown> = {};
    try {
      meta = r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : {};
    } catch {
      meta = {};
    }
    return { id: r.id, source: r.source, question, answer, meta, createdAt: r.createdAt.toISOString(), ...(locked ? { locked } : {}) };
  });
}

/** Clear the history where the panel was opened. */
export async function clearTurns(where: { meetingId: string } | { seriesId: string }): Promise<number> {
  const { count } = await prisma.askTurn.deleteMany({
    where: "meetingId" in where ? { meetingId: where.meetingId } : { seriesId: where.seriesId, meetingId: null },
  });
  return count;
}
