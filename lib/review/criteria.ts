// Meeting feedback (an extension): what a good meeting looks like, as criteria a review scores
// against. Two sets, because running a meeting and taking part in one are different jobs: the
// facilitator's and a participant's.
//
// Each person keeps their own (Settings → Meeting feedback). Empty means the defaults below, so
// a change to the defaults reaches everybody who never edited theirs. A review stores the set
// it was scored with, so editing the criteria later does not rewrite old scores.

export const REVIEW_ROLES = ["facilitator", "participant"] as const;
export type ReviewRole = (typeof REVIEW_ROLES)[number];

export type ReviewCriterion = {
  id: string;
  name: string;
  description: string;
  /** 1–3: how much it counts toward the score. */
  weight: number;
};

export const MAX_CRITERIA = 12;

export function isReviewRole(v: unknown): v is ReviewRole {
  return typeof v === "string" && (REVIEW_ROLES as readonly string[]).includes(v);
}

/** The criteria a new account starts with, in the language its reviews will be written in. */
export function defaultCriteria(role: ReviewRole, locale: "ja" | "en"): ReviewCriterion[] {
  const ja = locale === "ja";
  const c = (id: string, weight: number, jaName: string, jaDesc: string, enName: string, enDesc: string) => ({
    id,
    weight,
    name: ja ? jaName : enName,
    description: ja ? jaDesc : enDesc,
  });
  if (role === "facilitator") {
    return [
      c("purpose", 2, "目的とゴールの共有", "冒頭で会議の目的と、終わるときに何が決まっていればよいかを示したか", "Purpose and goal", "Said at the start what the meeting is for and what should be settled by its end"),
      c("agenda", 1, "議題と時間配分", "議題の順番と時間の使い方が適切で、脱線を戻せたか", "Agenda and time", "Kept to a sensible order and pace, and brought digressions back"),
      c("inclusion", 2, "発言の引き出し", "発言の少ない人に振る・質問するなど、全員が話せたか", "Drawing people in", "Asked quieter people, so everybody could speak"),
      c("summary", 2, "論点の整理と要約", "議論の節目で要点をまとめ、論点を明確にしたか", "Summing up", "Summed up at turning points and made the open questions clear"),
      c("decision", 2, "合意と意思決定", "結論を明確にし、決まったことを確認したか", "Decisions", "Made conclusions explicit and confirmed what was decided"),
      c("actions", 2, "次のアクション", "担当者と期限を確認して終えたか", "Next steps", "Ended with who does what by when"),
      c("neutrality", 1, "中立性", "自分の意見で議論を支配せず、進行に徹したか", "Neutrality", "Ran the discussion rather than dominating it"),
      c("timekeeping", 1, "時間どおりの終了", "予定の時間内に終えたか", "Ending on time", "Finished within the time it had"),
    ];
  }
  return [
    c("clarity", 2, "発言の明確さ", "結論から簡潔に、根拠を添えて話したか", "Clarity", "Spoke briefly, conclusion first, with reasons"),
    c("contribution", 2, "建設的な貢献", "他の意見に乗る・代案を出すなど、議論を前に進めたか", "Contribution", "Moved the discussion on: built on others' points, offered alternatives"),
    c("listening", 1, "傾聴と質問", "他者の発言を踏まえ、確認や質問をしたか", "Listening", "Built on what others said, and asked to check or clarify"),
    c("preparation", 1, "準備", "議題に沿って必要な情報を持って臨んだか", "Preparation", "Came with what the agenda needed"),
    c("focus", 1, "時間と場への配慮", "長すぎる発言や脱線を避けたか", "Focus", "Kept turns short and on topic"),
    c("ownership", 1, "自分のアクションの確認", "自分の担当と期限を確認・引き受けたか", "Ownership", "Took on and confirmed their own tasks and dates"),
  ];
}

/**
 * Criteria as stored in settings, made safe: what is not a criterion is dropped, names and
 * descriptions are trimmed and bounded, weights kept to 1–3, ids made unique. Null when the
 * value is not a list at all.
 */
export function cleanCriteria(v: unknown): ReviewCriterion[] | null {
  if (!Array.isArray(v)) return null;
  const out: ReviewCriterion[] = [];
  const ids = new Set<string>();
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 60) : "";
    if (!name) continue;
    const description = typeof r.description === "string" ? r.description.trim().slice(0, 300) : "";
    const weight = typeof r.weight === "number" && Number.isFinite(r.weight) ? Math.min(3, Math.max(1, Math.round(r.weight))) : 1;
    let id = typeof r.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(r.id) ? r.id : `c${out.length + 1}`;
    while (ids.has(id)) id = `${id}_`;
    ids.add(id);
    out.push({ id, name, description, weight });
    if (out.length >= MAX_CRITERIA) break;
  }
  return out;
}

/**
 * The score out of 100: each criterion's 1–5, weighted. 1 everywhere is 0 and 5 everywhere is
 * 100, so the number reads as a percentage of the way there rather than starting at 20.
 */
export function overallScore(criteria: ReviewCriterion[], scores: Record<string, number>): number {
  let sum = 0;
  let weights = 0;
  for (const c of criteria) {
    const s = scores[c.id];
    if (typeof s !== "number") continue;
    sum += c.weight * ((Math.min(5, Math.max(1, s)) - 1) / 4);
    weights += c.weight;
  }
  return weights > 0 ? Math.round((sum / weights) * 100) : 0;
}
