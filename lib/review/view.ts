import type { ReviewCriterion, ReviewRole } from "./criteria";
import type { ReviewMetrics } from "./metrics";
import type { ReviewPoint, ReviewResult } from "./prompt";

// A stored review as the page shows it: the JSON columns read back, and each criterion beside
// the score it was given. Anything unreadable reads as empty rather than failing the page.

export type ReviewView = {
  id: string;
  meetingId: string;
  role: ReviewRole;
  person: string;
  score: number;
  createdAt: string;
  model: string | null;
  metrics: ReviewMetrics | null;
  criteria: (ReviewCriterion & { score: number | null; comment: string })[];
  strengths: ReviewPoint[];
  improvements: ReviewPoint[];
  summary: string;
};

type Row = {
  id: string;
  meetingId: string;
  role: string;
  person: string;
  score: number;
  result: string;
  criteria: string;
  metrics: string;
  model: string | null;
  createdAt: Date;
};

function json<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function reviewView(row: Row): ReviewView {
  const result = json<Partial<ReviewResult>>(row.result, {});
  const scored = new Map((result.criteria ?? []).map((c) => [c.id, c]));
  return {
    id: row.id,
    meetingId: row.meetingId,
    role: row.role === "participant" ? "participant" : "facilitator",
    person: row.person,
    score: row.score,
    createdAt: row.createdAt.toISOString(),
    model: row.model,
    metrics: json<ReviewMetrics | null>(row.metrics, null),
    criteria: json<ReviewCriterion[]>(row.criteria, []).map((c) => ({
      ...c,
      score: scored.get(c.id)?.score ?? null,
      comment: scored.get(c.id)?.comment ?? "",
    })),
    strengths: result.strengths ?? [],
    improvements: result.improvements ?? [],
    summary: result.summary ?? "",
  };
}

export const REVIEW_SELECT = {
  id: true,
  meetingId: true,
  role: true,
  person: true,
  score: true,
  result: true,
  criteria: true,
  metrics: true,
  model: true,
  createdAt: true,
} as const;
