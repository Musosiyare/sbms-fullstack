// Shared across the Dashboard's deliberation cards and the teacher
// notification bell, so a decision reads the same way everywhere.

export const DECISION_TONE = {
  dismissed_permanently: "danger",
  dismissed_term: "warning",
  stained: "ok",
};

// Dismissals (permanent or termly) get a heavier, distinct treatment
// wherever they're shown — a serif display face at a bolder weight —
// so they read as a serious, final decision rather than just another
// status pill. Stained records stay in the normal typeface since the
// student is still enrolled.
export const DECISION_EMPHASIS = {
  dismissed_permanently: "font-display font-extrabold tracking-wide",
  dismissed_term: "font-display font-extrabold tracking-wide",
  stained: "",
};

/**
 * "Dismissed for the term" alone doesn't say which term — a teacher
 * reading it weeks later, or comparing two terms, can't tell if it's
 * still in effect. Names the actual term ("Dismissed for Term 2,
 * 2025") whenever a label is available; falls back to the generic
 * phrasing only if it isn't.
 */
/**
 * Why a student landed on the exceeded-marks / deliberation queue —
 * either they used up a single term's 40 marks (exceededTerm), their
 * cumulative deductions crossed half the whole year's total even without
 * any one term running out (exceededYear), or both. Shared between the
 * Dashboard cards and the notification bells so a student flagged only
 * by the yearly computation ("the system") reads the same way everywhere
 * instead of silently looking like an ordinary termly case.
 */
export function exceededReasonLabel(s) {
  if (s.exceededTerm && s.exceededYear) return "Exceeded marks for the term and the year";
  if (s.exceededYear) return "Exceeded cumulative marks for the year";
  return "Exceeded conduct marks for the term";
}

export function decisionLabel(decision, termLabel) {
  if (decision === "dismissed_term") {
    return termLabel ? `Dismissed for ${termLabel}` : "Dismissed for the term";
  }
  if (decision === "dismissed_permanently") return "Dismissed permanently";
  if (decision === "stained") return "Stained (retained)";
  return decision;
}
