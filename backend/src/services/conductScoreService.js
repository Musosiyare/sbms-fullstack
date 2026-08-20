const { Op } = require("sequelize");
const { MisconductRecord, Term, sequelize } = require("../models");

// Per Theo: 40 marks per term, 3 terms per year.
const MARKS_PER_TERM = 40;
const TERMS_PER_YEAR = 3;
const MARKS_PER_YEAR = MARKS_PER_TERM * TERMS_PER_YEAR;

/**
 * Deliberately computed on demand rather than stored in a column/table.
 * Same reasoning as the main system's report-card averages: a stored score
 * goes stale the moment a record is added, edited, or deleted, and keeping
 * it in sync everywhere is exactly the kind of bug that's easy to
 * introduce. Only 'finalized' records count — a 'pending' report hasn't
 * had marks applied yet.
 */
async function sumDeductions(where) {
  const result = await MisconductRecord.findOne({
    where: { ...where, status: "finalized" },
    attributes: [[sequelize.fn("SUM", sequelize.col("marks_deducted")), "total"]],
    raw: true,
  });
  return Number(result?.total || 0);
}

/**
 * How many reports for a student (in whatever scope is passed — a term or
 * a whole academic year) are still sitting at `pending`, i.e. reported but
 * not yet approved/rejected by discipline staff. Used to flag a student on
 * the class/yearly report screens so staff notice an open report hasn't
 * been actioned yet, separate from the finalized-only score math above.
 */
async function countPending(where) {
  return MisconductRecord.count({ where: { ...where, status: "pending" } });
}

/**
 * A single term's conduct score for one student.
 * remaining < 20 (i.e. more than half of 40 lost) is the "at risk" flag —
 * an early warning shown during the term itself, not a dismissal decision.
 */
async function getTermScore(studentId, termId) {
  const deducted = await sumDeductions({ studentId, termId });
  const remaining = MARKS_PER_TERM - deducted;
  return {
    termId,
    maxMarks: MARKS_PER_TERM,
    deducted,
    remaining,
    atRisk: remaining < MARKS_PER_TERM / 2,
  };
}

/**
 * A full academic year's conduct score for one student, summed across
 * whichever terms exist for that year (normally 3, out of 120 total).
 * remaining < 60 is the actual "recommended dismissal" flag Theo described
 * — the one checked at year end, matching the manual process where staff
 * total up all three terms' books before deciding.
 */
async function getYearScore(studentId, academicYearId) {
  const terms = await Term.findAll({ where: { academicYearId }, raw: true });
  const maxMarks = MARKS_PER_TERM * (terms.length || TERMS_PER_YEAR);
  const deducted = await sumDeductions({ studentId, academicYearId });
  const remaining = maxMarks - deducted;
  return {
    academicYearId,
    maxMarks,
    deducted,
    remaining,
    recommendedDismissal: remaining < maxMarks / 2,
    // "Promoted" at >= 50% of the year's total marks, "Dismissed" below —
    // the actual end-of-year decision, as opposed to atRisk/recommendedDismissal
    // which are early-warning flags checked per term or on demand.
    decision: remaining >= maxMarks / 2 ? "promoted" : "dismissed",
  };
}

/**
 * The finalized incidents behind a student's yearly score, one row per
 * record — title, which term it fell in (both id and name, so callers can
 * group/count by term as well as just display it), the date it was
 * finalized (marks actually applied), and how many marks it cost. Only
 * 'finalized' records, same as the score sums above, so this always
 * reconciles with the per-term/yearly totals on the same report.
 */
async function getYearlyIncidents(studentId, academicYearId) {
  const { MisconductType } = require("../models");
  const records = await MisconductRecord.findAll({
    where: { studentId, academicYearId, status: "finalized" },
    include: [{ model: MisconductType }, { model: Term }],
    order: [["finalizedAt", "ASC"], ["createdAt", "ASC"]],
  });
  return records.map((r) => ({
    id: r.id,
    title: r.MisconductType?.title || r.customTitle || "Misconduct",
    termId: r.termId,
    termName: r.Term?.name || "",
    date: r.finalizedAt || r.createdAt,
    marksDeducted: r.marksDeducted,
  }));
}

/**
 * The full yearly picture for one student: every term in the academic year
 * with its own score (plus how many finalized incidents fell in it), the
 * combined yearly total, and the promotion/dismissal decision, plus the
 * flat incidents list itself (each already tagged with its term — see
 * getYearlyIncidents) so a report can show both "how many per term" and
 * "the full list" from one payload. Powers the printable yearly conduct
 * report — Theo's "combine all three terms and decide" process laid out
 * on paper.
 */
async function getYearlyReport(studentId, academicYearId) {
  const terms = await Term.findAll({ where: { academicYearId }, order: [["id", "ASC"]], raw: true });
  const incidents = await getYearlyIncidents(studentId, academicYearId);
  const termScores = await Promise.all(
    terms.map(async (term) => ({
      termId: term.id,
      termName: term.name,
      ...(await getTermScore(studentId, term.id)),
      incidentsCount: incidents.filter((i) => i.termId === term.id).length,
    }))
  );
  const year = await getYearScore(studentId, academicYearId);
  return { terms: termScores, year, incidents, incidentsCount: incidents.length };
}

/**
 * Every active student in a class with their yearly score, decision, and
 * incidents (both the full finalized list and a per-term/overall count) —
 * the year-end counterpart to classConductReport. The incidents/counts
 * mirror getYearlyReport exactly, just gathered for a whole class in one
 * pass so the class-wide "Incidents" column and the bulk "Yearly reports"
 * PDF (which needs the same per-student incident detail as the single-
 * student view) don't each have to re-fetch it separately.
 */
async function getClassYearlyReport(classId, academicYearId) {
  const { Student } = require("../models");
  const students = await Student.findAll({ where: { classId, status: "active" }, raw: true });
  const terms = await Term.findAll({ where: { academicYearId }, order: [["id", "ASC"]], raw: true });

  return Promise.all(
    students.map(async (student) => {
      const incidents = await getYearlyIncidents(student.id, academicYearId);
      const termScores = await Promise.all(
        terms.map(async (term) => ({
          termId: term.id,
          termName: term.name,
          ...(await getTermScore(student.id, term.id)),
          incidentsCount: incidents.filter((i) => i.termId === term.id).length,
        }))
      );
      const year = await getYearScore(student.id, academicYearId);
      const pendingCount = await countPending({ studentId: student.id, academicYearId });
      return {
        studentId: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNumber: student.admissionNumber,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
        terms: termScores,
        year,
        incidents,
        incidentsCount: incidents.length,
        pendingCount,
      };
    })
  );
}

/**
 * Termly and yearly scores for every student in a class at once — powers
 * the class-level report screen (list of students with both numbers side
 * by side, as Theo described: termly for early warning, yearly for the
 * actual decision).
 */
async function getClassScores(classId, termId, academicYearId) {
  const { Student } = require("../models");
  const students = await Student.findAll({ where: { classId, status: "active" }, raw: true });

  return Promise.all(
    students.map(async (student) => {
      const term = await getTermScore(student.id, termId);
      const year = await getYearScore(student.id, academicYearId);
      const pendingCount = await countPending({ studentId: student.id, termId });
      return {
        studentId: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNumber: student.admissionNumber,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
        term,
        year,
        pendingCount,
      };
    })
  );
}

/**
 * Caps how many marks a new finalized record is actually allowed to take,
 * so a student's termly balance never goes negative. Once a term's 40
 * marks are already gone, further incidents still get recorded (the
 * paper trail matters even after the marks run out) — they just can't
 * pull `remaining` below zero. Only 'finalized' records count toward the
 * existing balance (see getTermScore), matching how every other score in
 * this file is computed.
 */
async function capDeductionToRemaining(studentId, termId, requestedDeduction) {
  const { remaining } = await getTermScore(studentId, termId);
  if (remaining <= 0) return 0;
  return Math.min(requestedDeduction, remaining);
}

/**
 * Checked right after a deduction is applied (create/approve/class-wide),
 * so whoever just recorded it is told in that same response — rather than
 * having to separately open the student's conduct report to notice their
 * termly marks have run out. Distinct from the atRisk (<50%) early
 * warning: this is specifically "there is nothing left to deduct this
 * term", the point at which further incidents can only be logged for the
 * paper trail (see capDeductionToRemaining) and the case is really a
 * staff decision (deliberation/dismissal) rather than another deduction.
 */
async function isTermExceeded(studentId, termId) {
  const { remaining } = await getTermScore(studentId, termId);
  return remaining <= 0;
}

/**
 * Every student in a school who has used up all of a given term's 40
 * marks (deducted >= MARKS_PER_TERM, i.e. remaining <= 0) — the school-wide
 * "needs deliberation" list the dashboard cards are built from, as opposed
 * to getClassScores/getTermScore which need a specific class or student
 * already picked. Grouped straight in SQL rather than looping every
 * student in the school through getTermScore, since a school-wide scan
 * only needs the ones that actually crossed the line.
 */
async function getExceededStudentIds(schoolId, termId) {
  const rows = await MisconductRecord.findAll({
    where: { schoolId, termId, status: "finalized" },
    attributes: ["studentId", [sequelize.fn("SUM", sequelize.col("marks_deducted")), "deducted"]],
    group: ["studentId"],
    having: sequelize.where(sequelize.fn("SUM", sequelize.col("marks_deducted")), { [Op.gte]: MARKS_PER_TERM }),
    raw: true,
  });
  return rows.map((r) => ({ studentId: r.studentId, deducted: Number(r.deducted) }));
}

/**
 * The yearly counterpart to getExceededStudentIds — every student in a
 * school whose *cumulative* deductions across the whole academic year
 * have crossed the same "recommended dismissal" line getYearScore uses
 * (remaining < half the year's total marks), even if they never used up
 * a single term's 40 on its own. Without this, a student who loses a
 * little each term (say 15/40, 15/40, 15/40 — never hitting a term's
 * cap) crosses the yearly threshold but was previously invisible to the
 * whole deliberation pipeline: never on the awaiting-deliberation queue,
 * never decided, never in the notification feed. This is what powers
 * the "computed dismissed" signal on the Yearly Report — surfaced here
 * so the discipline office can actually act on it through the same
 * decide()/Deliberation flow as a termly exceed, instead of it only
 * ever being a passive line on a report.
 */
async function getYearExceededStudentIds(schoolId, academicYearId, termsCount) {
  const maxMarks = MARKS_PER_TERM * (termsCount || TERMS_PER_YEAR);
  const rows = await MisconductRecord.findAll({
    where: { schoolId, academicYearId, status: "finalized" },
    attributes: ["studentId", [sequelize.fn("SUM", sequelize.col("marks_deducted")), "deducted"]],
    group: ["studentId"],
    having: sequelize.where(sequelize.fn("SUM", sequelize.col("marks_deducted")), { [Op.gte]: maxMarks / 2 }),
    raw: true,
  });
  return rows.map((r) => ({ studentId: r.studentId, deducted: Number(r.deducted) }));
}

module.exports = {
  MARKS_PER_TERM,
  MARKS_PER_YEAR,
  getTermScore,
  getYearScore,
  getClassScores,
  getYearlyReport,
  getClassYearlyReport,
  capDeductionToRemaining,
  isTermExceeded,
  getExceededStudentIds,
  getYearExceededStudentIds,
  countPending,
};
