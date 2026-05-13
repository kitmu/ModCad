// Hand-rolled fuzzy ranker for the command palette (T065).
//
// Why hand-rolled: the candidate set is tiny (~20 commands) and the
// ranking rules need to know about *aliases* — e.g. typing "REC"
// must surface `draw.rectangle` ahead of `edit.redo`, because the
// rectangle command's alias starts with "REC" exactly. A generic
// subsequence scorer keyed on `name` alone would tie those two on
// "re" and lean toward the shorter `edit.redo`.
//
// Scoring (higher is better):
//   - Exact alias / name match            : 10_000
//   - Alias prefix (case-insensitive)     : 5_000 - lengthDiff
//   - Name prefix (after dot or at start) :   800 - lengthDiff
//   - Contiguous substring                :   500 - position
//   - Subsequence match                   :   100 + bonuses for
//                                            * contiguous runs
//                                            * word-boundary jumps
// Subsequence-failure → discarded.
//
// Match spans (for highlighting) reflect the alias if the alias
// ranked the candidate; otherwise the name.

export interface PaletteCandidate {
  /** Canonical command name (`draw.rectangle`). */
  name: string;
  /** One-line description shown to the right of the name. */
  summary: string;
  /** Default keybinding string, e.g. `"REC"`. Display-only. */
  binding?: string;
  /** Alternate strings the ranker may match against (`REC`, `RECTANGLE`). */
  aliases?: string[];
}

export interface Ranked extends PaletteCandidate {
  score: number;
  /** Character ranges within `name` (or alias when `matchedAlias` set). */
  matchSpans: [number, number][];
  /** Alias string that produced the ranking, if any. */
  matchedAlias?: string;
}

interface Match {
  score: number;
  spans: [number, number][];
  alias?: string;
}

const SCORE_FLOOR = 0;

export function rank(query: string, candidates: PaletteCandidate[]): Ranked[] {
  const q = query.trim();
  if (q === "") {
    return candidates
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ ...c, score: 0, matchSpans: [] }));
  }
  const qLower = q.toLowerCase();
  const out: Ranked[] = [];
  for (const c of candidates) {
    const best = bestMatch(qLower, c);
    if (best.score <= SCORE_FLOOR) continue;
    const ranked: Ranked = {
      ...c,
      score: best.score,
      matchSpans: best.spans,
    };
    if (best.alias !== undefined) ranked.matchedAlias = best.alias;
    out.push(ranked);
  }
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
  return out;
}

function bestMatch(qLower: string, c: PaletteCandidate): Match {
  let best: Match = { score: 0, spans: [] };
  // Name match first — match spans on the name string are the default.
  const nameMatch = scoreOne(qLower, c.name);
  if (nameMatch.score > best.score) best = nameMatch;
  // Alias matches: prefix / exact on an alias get a higher weight band
  // than a name-anywhere match because "REC" → rectangle is exactly the
  // AutoCAD muscle-memory case the palette has to honour.
  for (const alias of c.aliases ?? []) {
    const m = scoreOne(qLower, alias);
    if (m.score === 0) continue;
    // Aliases get a small flat boost because matching the user-facing
    // shorthand is the user's stated intent.
    const boosted: Match = { score: m.score + 200, spans: m.spans, alias };
    if (boosted.score > best.score) best = boosted;
  }
  return best;
}

function scoreOne(qLower: string, target: string): Match {
  const tLower = target.toLowerCase();
  // Exact match.
  if (tLower === qLower) {
    return { score: 10_000, spans: [[0, target.length]] };
  }
  // Prefix match.
  if (tLower.startsWith(qLower)) {
    // Differentiate alias-prefix vs name-prefix at the caller (we add
    // the alias boost there); here we encode "shorter target wins" so
    // that "L" prefix of "LINE" beats "L" prefix of "LINEWEIGHT".
    return {
      score: 5_000 - (target.length - qLower.length),
      spans: [[0, qLower.length]],
    };
  }
  // Word-boundary prefix (after '.' or '-' or '_'): "rec" matches
  // `draw.rectangle` because "rectangle" starts a word.
  const wb = findWordBoundaryPrefix(qLower, tLower);
  if (wb !== -1) {
    return {
      score: 800 - (target.length - qLower.length),
      spans: [[wb, wb + qLower.length]],
    };
  }
  // Contiguous substring anywhere.
  const idx = tLower.indexOf(qLower);
  if (idx !== -1) {
    return {
      score: 500 - idx,
      spans: [[idx, idx + qLower.length]],
    };
  }
  // Subsequence match.
  return scoreSubsequence(qLower, tLower);
}

function findWordBoundaryPrefix(q: string, t: string): number {
  // Look for q starting at any position immediately after a boundary
  // character (".", "-", "_") in t.
  let i = 0;
  while (i < t.length) {
    const ch = t[i]!;
    if (ch === "." || ch === "-" || ch === "_") {
      const start = i + 1;
      if (t.startsWith(q, start)) return start;
    }
    i++;
  }
  return -1;
}

function scoreSubsequence(q: string, t: string): Match {
  const spans: [number, number][] = [];
  let qi = 0;
  let lastMatch = -2;
  let contigBonus = 0;
  let boundaryBonus = 0;
  let spanStart = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (ti === lastMatch + 1) {
        contigBonus += 5;
        // Extend the current span instead of opening a new one.
      } else {
        // Close prior span if any.
        if (spanStart !== -1) spans.push([spanStart, lastMatch + 1]);
        spanStart = ti;
        const prev = t[ti - 1];
        if (ti === 0 || prev === "." || prev === "-" || prev === "_") {
          boundaryBonus += 4;
        }
      }
      lastMatch = ti;
      qi++;
    }
  }
  if (qi < q.length) return { score: 0, spans: [] };
  if (spanStart !== -1) spans.push([spanStart, lastMatch + 1]);
  // Base 100 + bonuses; longer targets penalised slightly so ties
  // resolve toward the more specific command.
  const score = 100 + contigBonus + boundaryBonus - Math.max(0, t.length - q.length);
  return { score, spans };
}
