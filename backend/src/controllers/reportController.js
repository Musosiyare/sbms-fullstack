const conductScoreService = require("../services/conductScoreService");
const { MARKS_PER_TERM } = conductScoreService;
const {
  Student,
  Class,
  School,
  AcademicYear,
  Term,
  MisconductRecord,
  MisconductType,
  User,
  Deliberation,
} = require("../models");
const ApiError = require("../utils/ApiError");
const { Op } = require("sequelize");
const deliberationController = require("./deliberationController");

const DISCIPLINE_ROLE_LABEL = { dean_of_discipline: "Dean of Discipline", disciplinary_officer: "Disciplinary Officer" };
const ROLE_LABEL = { manager: "Manager", teacher: "Teacher", superuser: "Superuser", discipline: "Discipline Staff" };

/** Human-readable role for a user on a printed report — discipline role (Dean/Officer) takes priority when set. */
function roleLabel(u) {
  if (!u) return null;
  return DISCIPLINE_ROLE_LABEL[u.disciplineRole] || ROLE_LABEL[u.role] || null;
}

/**
 * Whether the system has already auto-dismissed a student ANYWHERE in
 * this academic year (see applySystemYearlyDismissals in
 * deliberationController — always recorded against the year's LAST
 * term). Used so a term viewed BEFORE that term — where
 * getDeliberationForTerm finds nothing and getPermanentDismissalForYear's
 * carry-over only looks forward — doesn't fall back to showing a
 * per-term "At Risk"/"Good" judgment that's already moot: the system's
 * year-level call has been made, so the class report should just show
 * the plain marks number for that term instead of a status pill.
 */
async function hasSystemDeliberationForYear(studentId, academicYearId) {
  const row = await Deliberation.findOne({
    where: { studentId, academicYearId, decidedByRole: "system" },
    attributes: ["id"],
  });
  return Boolean(row);
}

/** Every student in a class, with both their termly and yearly score, plus their recorded deliberation decision for this term (if any). */
async function classReport(req, res, next) {
  try {
    const { classId, termId, academicYearId } = req.query;
    if (!classId || !termId || !academicYearId) {
      return next(ApiError.badRequest("classId, termId and academicYearId are required"));
    }
    const scores = await conductScoreService.getClassScores(classId, termId, academicYearId);
    const withDeliberations = await Promise.all(
      scores.map(async (s) => {
        const deliberation = await getDeliberationForTerm(s.studentId, termId);
        const permanentDismissal = await getPermanentDismissalForYear(s.studentId, academicYearId);
        const carriedOverDismissal = dismissalCarriesIntoTerm(permanentDismissal, termId);
        const systemDeliberationThisYear = await hasSystemDeliberationForYear(s.studentId, academicYearId);
        return {
          ...s,
          deliberation,
          carriedOverDismissal,
          systemDeliberationThisYear,
          term: carriedOverDismissal
            ? { ...s.term, maxMarks: null, deducted: null, remaining: null, atRisk: null, notApplicable: true }
            : s.term,
        };
      })
    );
    res.json(withDeliberations);
  } catch (err) {
    next(err);
  }
}

/** One student's full picture: this term's score plus the year-to-date score. */
async function studentReport(req, res, next) {
  try {
    const { termId, academicYearId } = req.query;
    const student = await Student.findByPk(req.params.studentId);
    if (!student || student.schoolId !== req.schoolId) return next(ApiError.notFound("Student not found"));
    if (!termId || !academicYearId) {
      return next(ApiError.badRequest("termId and academicYearId are required"));
    }

    const rawTerm = await conductScoreService.getTermScore(student.id, termId);
    const year = await conductScoreService.getYearScore(student.id, academicYearId);
    const deliberation = await getDeliberationForTerm(student.id, termId);
    const permanentDismissal = await getPermanentDismissalForYear(student.id, academicYearId);
    const carriedOverDismissal = dismissalCarriesIntoTerm(permanentDismissal, termId);
    const term = carriedOverDismissal
      ? { ...rawTerm, maxMarks: null, deducted: null, remaining: null, atRisk: null, notApplicable: true }
      : rawTerm;
    res.json({
      student: { id: student.id, firstName: student.firstName, lastName: student.lastName },
      term,
      year,
      deliberation,
      carriedOverDismissal,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * The discipline office's actual recorded call for one student/term, if
 * any — dismissed permanently, dismissed for the term, or stained (kept
 * enrolled but the case stays on their record). Pulled from the same
 * Deliberation table the dashboard's exceeded-marks deliberation flow
 * writes to, so a report always reflects the real decision rather than
 * just the computed marks percentage.
 */
async function getDeliberationForTerm(studentId, termId) {
  const row = await Deliberation.findOne({
    where: { studentId, termId },
    include: [{ model: User, as: "decidedBy", attributes: ["id", "name", "role", "disciplineRole"] }],
  });
  if (!row) return null;
  return {
    id: row.id,
    decision: row.decision,
    reason: row.reason,
    decidedBy: row.decidedBy?.name || null,
    decidedByRole: roleLabel(row.decidedBy),
    decidedAt: row.decidedAt,
  };
}

/**
 * Every deliberation decision recorded across a student's whole academic
 * year (one per term at most), plus whichever one counts as "the" decision
 * for the year: a permanent dismissal in any term overrides everything
 * else, a term dismissal beats a stained record, and a stained record
 * beats having no decision at all. Powers the yearly conduct report so it
 * shows the discipline office's actual call rather than only the
 * computed promoted/dismissed marks percentage.
 */
async function getDeliberationsForYear(studentId, academicYearId) {
  const rows = await Deliberation.findAll({
    where: { studentId, academicYearId },
    include: [
      { model: Term },
      { model: User, as: "decidedBy", attributes: ["id", "name", "role", "disciplineRole"] },
    ],
    order: [["termId", "ASC"]],
  });

  const list = rows.map((row) => ({
    id: row.id,
    termId: row.termId,
    termName: row.Term?.name || null,
    decision: row.decision,
    reason: row.reason,
    decidedBy: row.decidedBy?.name || null,
    decidedByRole: roleLabel(row.decidedBy),
    decidedAt: row.decidedAt,
  }));

  const SEVERITY = { dismissed_permanently: 3, dismissed_term: 2, stained: 1 };
  // A human decision governs over a system one whenever both exist — see
  // applySystemYearlyDismissals in deliberationController for why the
  // system shouldn't normally create a competing row once a human has
  // already decided the student, but this stays defensive for older data.
  const humanRows = rows.filter((row) => row.decidedByRole !== "system");
  const pool = humanRows.length > 0 ? humanRows : rows;
  const finalRow = pool.reduce((best, d) => (!best || SEVERITY[d.decision] > SEVERITY[best.decision] ? d : best), null);
  const final = finalRow ? list.find((d) => d.id === finalRow.id) : null;

  return { deliberations: list, finalDeliberation: final };
}

/**
 * The earliest permanent-dismissal decision in a student's list of
 * deliberations for the year, if any. `list` is already ordered by
 * termId ASC (see getDeliberationsForYear), which matches how a school's
 * terms are actually created — Term 1, 2, 3 — so `.find` naturally
 * returns the one from the earliest term rather than whichever happens
 * to be most recent.
 */
function findPermanentDismissal(deliberations) {
  return deliberations.find((d) => d.decision === "dismissed_permanently") || null;
}

/**
 * A student who's been permanently dismissed doesn't stay enrolled for
 * the rest of the year, so a later term's "score" is really just an
 * empty, untouched 40/40 — nobody is filing misconduct reports against a
 * student who's no longer there. Left as-is, that reads as a clean
 * record and quietly dilutes the yearly total back toward "promoted",
 * which is exactly backwards. This replaces every term strictly after
 * the dismissal with an explicit "not applicable" marker instead of a
 * real score, and leaves the dismissal's own term (and anything before
 * it) untouched.
 */
function applyPermanentDismissalCutoff(termScores, permanentDismissal) {
  if (!permanentDismissal) return { terms: termScores, cutoffIndex: -1 };

  const cutoffIndex = termScores.findIndex((t) => t.termId === permanentDismissal.termId);
  if (cutoffIndex === -1) return { terms: termScores, cutoffIndex: -1 };

  const terms = termScores.map((t, i) => {
    if (i <= cutoffIndex) return t;
    return {
      ...t,
      maxMarks: null,
      deducted: null,
      remaining: null,
      atRisk: null,
      incidentsCount: null,
      notApplicable: true,
      notApplicableReason: `Dismissed permanently in ${permanentDismissal.termName}`,
    };
  });

  return { terms, cutoffIndex };
}

/**
 * Re-totals the yearly figure using only the terms that actually counted
 * (up to and including the term a permanent dismissal was recorded in),
 * so the year's "remaining / maxMarks" reflects the real budget the
 * student was ever scored against instead of the full 120 diluted by
 * terms they weren't enrolled for. No-op when there's no cutoff.
 */
function recomputeYearAfterDismissal(year, termScores, cutoffIndex) {
  if (cutoffIndex === -1) return year;
  const countedTerms = termScores.slice(0, cutoffIndex + 1);
  const maxMarks = MARKS_PER_TERM * countedTerms.length;
  const deducted = countedTerms.reduce((sum, t) => sum + (t.deducted || 0), 0);
  const remaining = maxMarks - deducted;
  return {
    ...year,
    maxMarks,
    deducted,
    remaining,
    recommendedDismissal: true,
    decision: "dismissed",
  };
}

/**
 * The earliest permanent-dismissal Deliberation recorded for a student
 * this academic year, if any — used by the termly (single-term) reports
 * so a term viewed *after* the one a student was permanently dismissed in
 * shows them as no longer enrolled rather than with a fresh, empty-looking
 * score. Ordered by termId ASC to match Term 1/2/3 creation order, same
 * assumption used everywhere else in this file.
 */
async function getPermanentDismissalForYear(studentId, academicYearId) {
  const row = await Deliberation.findOne({
    where: { studentId, academicYearId, decision: "dismissed_permanently" },
    include: [{ model: Term }],
    order: [["termId", "ASC"]],
  });
  if (!row) return null;
  return { termId: row.termId, termName: row.Term?.name || null, decidedAt: row.decidedAt };
}

/**
 * Whether a permanent dismissal recorded earlier in the year should carry
 * over into the given term — i.e. the dismissal happened in a strictly
 * earlier term than the one being viewed. The dismissal's own term keeps
 * showing its real score; only later terms are affected.
 */
function dismissalCarriesIntoTerm(permanentDismissal, termId) {
  return Boolean(permanentDismissal) && Number(permanentDismissal.termId) < Number(termId) ? permanentDismissal : null;
}

/** Score + incident list for one student, for a given term — shared by the single and bulk conduct-report endpoints. */
async function buildStudentConductData(student, termId, academicYearId) {
  const rawScore = await conductScoreService.getTermScore(student.id, termId);
  const permanentDismissal = await getPermanentDismissalForYear(student.id, academicYearId);
  const carriedOverDismissal = dismissalCarriesIntoTerm(permanentDismissal, termId);
  const score = carriedOverDismissal
    ? { ...rawScore, maxMarks: null, deducted: null, remaining: null, atRisk: null, notApplicable: true }
    : rawScore;
  // Termly status only — "good" or "at risk" against the 50% mark. The
  // actual promote/dismiss call is made at year end by combining all three
  // terms (see conductScoreService.getYearScore), not here. The recorded
  // deliberation decision (if any) is a separate, real staff call and is
  // attached below rather than derived from this percentage. A student
  // already permanently dismissed in an earlier term isn't "good" or "at
  // risk" this term — they're simply not enrolled, so that gets its own
  // status instead of a misleading computed one.
  const status = carriedOverDismissal ? "dismissed_permanently" : score.atRisk ? "at_risk" : "good";
  const deliberation = await getDeliberationForTerm(student.id, termId);
  const systemDeliberationThisYear = await hasSystemDeliberationForYear(student.id, academicYearId);

  const records = await MisconductRecord.findAll({
    where: { studentId: student.id, termId, academicYearId },
    include: [
      { model: MisconductType },
      { model: User, as: "reportedBy", attributes: ["id", "name", "role", "disciplineRole"] },
      { model: User, as: "finalizedBy", attributes: ["id", "name", "role", "disciplineRole"] },
    ],
    order: [["createdAt", "ASC"]],
  });

  return {
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
    },
    score,
    status,
    deliberation,
    carriedOverDismissal,
    systemDeliberationThisYear,
    incidents: records.map((r) => ({
      id: r.id,
      date: r.finalizedAt || r.createdAt,
      title: r.MisconductType?.title || r.customTitle || "Untitled incident",
      severity: r.MisconductType?.severity || null,
      description: r.description,
      marksDeducted: r.marksDeducted,
      status: r.status,
      sentHomeFrom: r.sentHomeFrom,
      sentHomeTo: r.sentHomeTo,
      reportedBy: r.reportedBy?.name || null,
      reportedByRole: roleLabel(r.reportedBy),
      finalizedBy: r.finalizedBy?.name || null,
      finalizedByRole: roleLabel(r.finalizedBy),
    })),
  };
}

/**
 * Everything needed to print a single student's termly conduct report on
 * paper: school/class/term header info, every incident recorded against
 * them for that term (whatever its status, so the Dean of Discipline sees
 * the full picture — not just the ones that ended up counting), and the
 * term's remaining marks with a "good" / "at risk" status against the 50%
 * threshold. This is deliberately termly (matches the report's own title)
 * and deliberately NOT a promote/dismiss call — that's only made at year
 * end once all three terms are combined; the class report screen surfaces
 * the yearly figure separately for that.
 */
async function studentConductReport(req, res, next) {
  try {
    const { termId, academicYearId } = req.query;
    if (!termId || !academicYearId) {
      return next(ApiError.badRequest("termId and academicYearId are required"));
    }

    const student = await Student.findByPk(req.params.studentId);
    if (!student || student.schoolId !== req.schoolId) return next(ApiError.notFound("Student not found"));

    const [klass, school, academicYear, term] = await Promise.all([
      Class.findByPk(student.classId),
      School.findByPk(req.schoolId),
      AcademicYear.findByPk(academicYearId),
      Term.findByPk(termId),
    ]);
    if (!klass || klass.schoolId !== req.schoolId) return next(ApiError.notFound("Class not found"));
    if (!academicYear || academicYear.schoolId !== req.schoolId) return next(ApiError.notFound("Academic year not found"));
    if (!term || term.academicYearId !== Number(academicYearId)) return next(ApiError.notFound("Term not found"));

    // The Dean of Discipline signs the printed report — pull whoever
    // currently holds that role for this school as the footer contact.
    const dean = await User.findOne({
      where: { schoolId: req.schoolId, disciplineRole: "dean_of_discipline", status: "active" },
      attributes: ["id", "name", "email", "phone"],
      order: [["id", "ASC"]],
    });

    const conduct = await buildStudentConductData(student, termId, academicYearId);

    res.json({
      school: { id: school.id, name: school.name },
      class: { id: klass.id, name: klass.name },
      academicYear: { id: academicYear.id, name: academicYear.name },
      term: { id: term.id, name: term.name },
      ...conduct,
      deanOfDiscipline: dean ? { name: dean.name, phone: dean.phone } : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Same report as studentConductReport, but for every active student in a
 * class at once — powers the "Conduct report" and "Conduct marks" downloads
 * on the Class Report screen so the Dean of Discipline can generate the
 * whole class's termly reports in one pass instead of opening each student
 * individually. School/class/term/dean info is fetched once and shared;
 * only the per-student score + incident list differs.
 */
async function classConductReport(req, res, next) {
  try {
    const { termId, academicYearId } = req.query;
    const { classId } = req.params;
    if (!termId || !academicYearId) {
      return next(ApiError.badRequest("termId and academicYearId are required"));
    }

    const [klass, school, academicYear, term] = await Promise.all([
      Class.findByPk(classId),
      School.findByPk(req.schoolId),
      AcademicYear.findByPk(academicYearId),
      Term.findByPk(termId),
    ]);
    if (!klass || klass.schoolId !== req.schoolId) return next(ApiError.notFound("Class not found"));
    if (!academicYear || academicYear.schoolId !== req.schoolId) return next(ApiError.notFound("Academic year not found"));
    if (!term || term.academicYearId !== Number(academicYearId)) return next(ApiError.notFound("Term not found"));

    const dean = await User.findOne({
      where: { schoolId: req.schoolId, disciplineRole: "dean_of_discipline", status: "active" },
      attributes: ["id", "name", "email", "phone"],
      order: [["id", "ASC"]],
    });

    const students = await Student.findAll({ where: { classId, status: "active" }, order: [["firstName", "ASC"]] });
    const reports = await Promise.all(students.map((s) => buildStudentConductData(s, termId, academicYearId)));

    res.json({
      school: { id: school.id, name: school.name },
      class: { id: klass.id, name: klass.name },
      academicYear: { id: academicYear.id, name: academicYear.name },
      term: { id: term.id, name: term.name },
      deanOfDiscipline: dean ? { name: dean.name, phone: dean.phone } : null,
      generatedAt: new Date().toISOString(),
      students: reports,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Everything needed to print one student's yearly conduct report: header
 * info, every term's score, the combined yearly total, and the promotion/
 * dismissal decision. This is the year-end counterpart to
 * studentConductReport, which is deliberately termly-only.
 */
async function studentYearlyConductReport(req, res, next) {
  try {
    const { academicYearId } = req.query;
    if (!academicYearId) return next(ApiError.badRequest("academicYearId is required"));

    const student = await Student.findByPk(req.params.studentId);
    if (!student || student.schoolId !== req.schoolId) return next(ApiError.notFound("Student not found"));

    const [klass, school, academicYear] = await Promise.all([
      Class.findByPk(student.classId),
      School.findByPk(req.schoolId),
      AcademicYear.findByPk(academicYearId),
    ]);
    if (!klass || klass.schoolId !== req.schoolId) return next(ApiError.notFound("Class not found"));
    if (!academicYear || academicYear.schoolId !== req.schoolId) return next(ApiError.notFound("Academic year not found"));

    const dean = await User.findOne({
      where: { schoolId: req.schoolId, disciplineRole: "dean_of_discipline", status: "active" },
      attributes: ["id", "name", "email", "phone"],
      order: [["id", "ASC"]],
    });

    const { terms, year, incidents } = await conductScoreService.getYearlyReport(student.id, academicYearId);
    const { deliberations, finalDeliberation } = await getDeliberationsForYear(student.id, academicYearId);
    const permanentDismissal = findPermanentDismissal(deliberations);
    const { terms: adjustedTerms, cutoffIndex } = applyPermanentDismissalCutoff(terms, permanentDismissal);
    const adjustedYear = recomputeYearAfterDismissal(year, terms, cutoffIndex);

    res.json({
      school: { id: school.id, name: school.name },
      class: { id: klass.id, name: klass.name },
      academicYear: { id: academicYear.id, name: academicYear.name },
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNumber: student.admissionNumber,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
      },
      terms: adjustedTerms,
      year: { ...adjustedYear, deliberation: finalDeliberation },
      deliberations,
      incidents,
      deanOfDiscipline: dean ? { name: dean.name, phone: dean.phone } : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Every active student in a class with their yearly score and promotion/
 * dismissal decision — the year-end counterpart to classConductReport.
 * Each student's real Deliberation decision (if any was recorded this
 * year) is attached the same way as the single-student yearly report, so
 * both stay consistent.
 */
async function classYearlyConductReport(req, res, next) {
  try {
    const { academicYearId } = req.query;
    const { classId } = req.params;
    if (!academicYearId) return next(ApiError.badRequest("academicYearId is required"));

    const [klass, school, academicYear] = await Promise.all([
      Class.findByPk(classId),
      School.findByPk(req.schoolId),
      AcademicYear.findByPk(academicYearId),
    ]);
    if (!klass || klass.schoolId !== req.schoolId) return next(ApiError.notFound("Class not found"));
    if (!academicYear || academicYear.schoolId !== req.schoolId) return next(ApiError.notFound("Academic year not found"));

    const dean = await User.findOne({
      where: { schoolId: req.schoolId, disciplineRole: "dean_of_discipline", status: "active" },
      attributes: ["id", "name", "email", "phone"],
      order: [["id", "ASC"]],
    });

    const students = await conductScoreService.getClassYearlyReport(classId, academicYearId);
    const withDeliberations = await Promise.all(
      students.map(async (s) => {
        const { deliberations, finalDeliberation } = await getDeliberationsForYear(s.studentId, academicYearId);
        const permanentDismissal = findPermanentDismissal(deliberations);
        const { terms: adjustedTerms, cutoffIndex } = applyPermanentDismissalCutoff(s.terms, permanentDismissal);
        const adjustedYear = recomputeYearAfterDismissal(s.year, s.terms, cutoffIndex);
        return {
          ...s,
          terms: adjustedTerms,
          year: { ...adjustedYear, deliberation: finalDeliberation },
          deliberations,
        };
      })
    );

    res.json({
      school: { id: school.id, name: school.name },
      class: { id: klass.id, name: klass.name },
      academicYear: { id: academicYear.id, name: academicYear.name },
      deanOfDiscipline: dean ? { name: dean.name, phone: dean.phone } : null,
      generatedAt: new Date().toISOString(),
      students: withDeliberations,
    });
  } catch (err) {
    next(err);
  }
}

const DISMISSAL_DECISIONS = ["dismissed_permanently", "dismissed_term"];

/**
 * Every dismissed student in the school for a given academic year —
 * "dismissed permanently" (expelled outright, any term — including every
 * student the system itself has auto-dismissed for crossing half the
 * year's cumulative marks; see
 * deliberationController.applySystemYearlyDismissals) and "dismissed for
 * the term" (out for the remainder of whichever term they were decided
 * in). All pulled from the same Deliberation table the dashboard's
 * exceeded-marks deliberation flow writes to — a system decision and a
 * staff decision are stored, and shown, exactly the same way here,
 * distinguished only by "Decided by" reading "System" instead of a
 * person's name. This is the read side: a school-wide list rather than
 * one class/term at a time, so the discipline office can see everyone
 * dismissed across the whole year at a glance.
 *
 * Filters:
 * - academicYearId (required): which year's decisions to pull.
 * - termId (optional): narrows to one term's decisions. Left blank ("all
 *   terms"), every term's dismissals for the year are combined.
 * - decision (optional): "dismissed_permanently" or "dismissed_term" to
 *   see just one kind; left blank (or "all"), both kinds are included.
 */
async function dismissedStudentsReport(req, res, next) {
  try {
    const { academicYearId, termId, decision } = req.query;
    if (!academicYearId) return next(ApiError.badRequest("academicYearId is required"));

    const academicYear = await AcademicYear.findByPk(academicYearId);
    if (!academicYear || academicYear.schoolId !== req.schoolId) {
      return next(ApiError.notFound("Academic year not found"));
    }

    if (termId) {
      const term = await Term.findByPk(termId);
      if (!term || term.academicYearId !== Number(academicYearId)) {
        return next(ApiError.notFound("Term not found"));
      }
    }

    // Reconcile any student who's newly crossed the yearly threshold into
    // a real dismissed_permanently row before reading, so this report is
    // never stale relative to the numbers.
    await deliberationController.applySystemYearlyDismissals(req.schoolId, academicYearId);

    let decisions = DISMISSAL_DECISIONS;
    if (decision && decision !== "all") {
      if (!DISMISSAL_DECISIONS.includes(decision)) {
        return next(ApiError.badRequest("decision must be 'dismissed_permanently', 'dismissed_term', or 'all'"));
      }
      decisions = [decision];
    }

    const where = {
      schoolId: req.schoolId,
      academicYearId,
      decision: { [Op.in]: decisions },
    };
    if (termId) where.termId = termId;

    const [school, dean, deliberations] = await Promise.all([
      School.findByPk(req.schoolId),
      User.findOne({
        where: { schoolId: req.schoolId, disciplineRole: "dean_of_discipline", status: "active" },
        attributes: ["id", "name", "email", "phone"],
        order: [["id", "ASC"]],
      }),
      Deliberation.findAll({
        where,
        include: [
          { model: Student },
          { model: Class },
          { model: Term },
          { model: User, as: "decidedBy", attributes: ["id", "name", "role", "disciplineRole"] },
        ],
        order: [["decidedAt", "DESC"]],
      }),
    ]);

    const results = deliberations
      // A student record may since have been removed/reassigned schools —
      // guard defensively rather than let a stale row 500 the whole list.
      .filter((d) => d.Student)
      .map((d) => ({
        deliberationId: d.id,
        studentId: d.studentId,
        firstName: d.Student.firstName,
        lastName: d.Student.lastName,
        admissionNumber: d.Student.admissionNumber,
        guardianName: d.Student.guardianName,
        guardianPhone: d.Student.guardianPhone,
        classId: d.classId,
        className: d.Class?.name || null,
        termId: d.termId,
        termName: d.Term?.name || null,
        decision: d.decision,
        reason: d.reason,
        decidedBy: deliberationController.decidedByDisplay(d),
        decidedByRole: d.decidedByRole === "system" ? "System" : roleLabel(d.decidedBy),
        decidedAt: d.decidedAt,
      }));

    res.json({
      school: { id: school.id, name: school.name },
      academicYear: { id: academicYear.id, name: academicYear.name },
      deanOfDiscipline: dean ? { name: dean.name, phone: dean.phone } : null,
      generatedAt: new Date().toISOString(),
      students: results,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Everything needed to print the "Weekend Permission" slip for one
 * finalized, send-home record: school header (name/address/phone/email),
 * student name, the reason (misconduct type title or custom title), the
 * send-home date range, and the Dean of Discipline's name for the
 * signature line. Only finalized records with both send-home dates set
 * qualify — anything else means the student was never actually sent
 * home, so there's nothing to hand them proof of.
 *
 * Disciplinary Officers don't get this slip — approving a send-home
 * incident is reserved for the Dean of Discipline (see
 * misconductRecordController), so the permission it produces stays out
 * of the Officer's hands too.
 */
async function weekendPermission(req, res, next) {
  try {
    if (req.user.sbmsRole === "disciplinary_officer") {
      return next(ApiError.forbidden("Disciplinary Officers don't have access to the weekend permission slip."));
    }

    const record = await MisconductRecord.findByPk(req.params.recordId, {
      include: [
        { model: Student },
        { model: MisconductType },
        { model: User, as: "finalizedBy", attributes: ["id", "name", "email", "phone", "disciplineRole"] },
      ],
    });
    if (!record || record.schoolId !== req.schoolId) return next(ApiError.notFound("Record not found"));
    if (record.status !== "finalized" || !record.sentHomeFrom || !record.sentHomeTo) {
      return next(ApiError.badRequest("This record isn't an approved send-home incident — nothing to print."));
    }

    // Once the return date has passed, the slip no longer proves an
    // ongoing authorized absence — but it's still a legitimate record of
    // one that happened, so it stays downloadable. It just gets stamped
    // EXPIRED instead of VALID so it's never mistaken for a live pass.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const returnDate = new Date(record.sentHomeTo);
    returnDate.setHours(0, 0, 0, 0);
    const isExpired = returnDate < today;

    const school = await School.findByPk(req.schoolId);

    // The Dean of Discipline signs the slip. Whoever finalized this
    // particular record is the natural signer if they hold that role;
    // otherwise fall back to whoever currently holds it at the school, the
    // same way the conduct reports do.
    let dean = record.finalizedBy?.disciplineRole === "dean_of_discipline" ? record.finalizedBy : null;
    if (!dean) {
      dean = await User.findOne({
        where: { schoolId: req.schoolId, disciplineRole: "dean_of_discipline", status: "active" },
        attributes: ["id", "name", "email", "phone"],
        order: [["id", "ASC"]],
      });
    }

    res.json({
      school: {
        id: school.id,
        name: school.name,
        address: school.address,
        phone: school.phone,
        email: school.email,
      },
      student: {
        id: record.Student.id,
        firstName: record.Student.firstName,
        lastName: record.Student.lastName,
        admissionNumber: record.Student.admissionNumber,
      },
      reason: record.MisconductType?.title || record.customTitle || "Untitled incident",
      sentHomeFrom: record.sentHomeFrom,
      sentHomeTo: record.sentHomeTo,
      isExpired,
      deanOfDiscipline: dean ? { name: dean.name, phone: dean.phone } : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  classReport,
  studentReport,
  studentConductReport,
  classConductReport,
  studentYearlyConductReport,
  classYearlyConductReport,
  dismissedStudentsReport,
  weekendPermission,
};
