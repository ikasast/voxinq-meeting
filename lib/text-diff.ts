// What a fix changes in a line, for showing it before it is made: the line once, with what goes
// struck through and what comes in marked, rather than the line twice to compare by eye.
//
// By character, because Japanese has no spaces to split words at, with what goes out put before
// what comes in at each place. Lines are short; one long enough to make the table expensive
// falls back to the changed middle between the common start and end, which is still right, only
// coarser.

export type DiffPart = { kind: "same" | "del" | "ins"; text: string };

/** Above this many cells, compare by common start and end instead. */
const MAX_CELLS = 400_000;

export function diffText(before: string, after: string): DiffPart[] {
  if (before === after) return before ? [{ kind: "same", text: before }] : [];
  const a = Array.from(before);
  const b = Array.from(after);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const head = a.slice(0, start).join("");
  const tail = a.slice(a.length - end).join("");
  const midA = a.slice(start, a.length - end);
  const midB = b.slice(start, b.length - end);

  const middle =
    (midA.length + 1) * (midB.length + 1) > MAX_CELLS
      ? [
          { kind: "del" as const, text: midA.join("") },
          { kind: "ins" as const, text: midB.join("") },
        ]
      : tidy(lcsDiff(midA, midB));

  return merge([{ kind: "same", text: head }, ...middle, { kind: "same", text: tail }]);
}

function lcsDiff(a: string[], b: string[]): DiffPart[] {
  const n = a.length;
  const m = b.length;
  // Lengths of the longest common subsequence of a[i..] and b[j..].
  const w = m + 1;
  const len = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      len[i * w + j] = a[i] === b[j] ? len[(i + 1) * w + j + 1] + 1 : Math.max(len[(i + 1) * w + j], len[i * w + j + 1]);
    }
  }
  const out: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (len[(i + 1) * w + j] >= len[i * w + j + 1]) {
      out.push({ kind: "del", text: a[i++] });
    } else {
      out.push({ kind: "ins", text: b[j++] });
    }
  }
  while (i < n) out.push({ kind: "del", text: a[i++] });
  while (j < m) out.push({ kind: "ins", text: b[j++] });
  return merge(out);
}

/** Deletions first, then insertions, within each changed stretch. */
function tidy(out: DiffPart[]): DiffPart[] {
  const grouped: DiffPart[] = [];
  let del = "";
  let ins = "";
  const flush = () => {
    if (del) grouped.push({ kind: "del", text: del });
    if (ins) grouped.push({ kind: "ins", text: ins });
    del = "";
    ins = "";
  };
  for (const p of out) {
    if (p.kind === "del") del += p.text;
    else if (p.kind === "ins") ins += p.text;
    else {
      flush();
      grouped.push(p);
    }
  }
  flush();
  return grouped;
}

function merge(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  for (const p of parts) {
    if (!p.text) continue;
    const last = out[out.length - 1];
    if (last && last.kind === p.kind) last.text += p.text;
    else out.push({ ...p });
  }
  return out;
}
