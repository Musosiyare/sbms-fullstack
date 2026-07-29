const { Deliberation, Student, Class, Term, AcademicYear, User } = require("../models");
const ApiError = require("../utils/ApiError");
const conductScoreService = require("../services/conductScoreService");

// Deliberation is reserved for the Dean of Discipline and manager — a
// Disciplinary Officer can review/finalize day-to-day misconduct reports
// (see misconductRecordController.CAN_FINALIZE), but the actual call on
// dismissing a student is a level above that, so they can see the
// exceeded-marks list and whatever decision's already been made without
// being able to make or undo one themselves.
const CAN_DECIDE = ["dean_of_discipline", "manager"];

const DECISIONS = ["dismissed_permanently", "dismissed_term", "retained"];

const DECIDED_BY_INCLUDE = {
  model: User,
  as: "decidedBy",
  attributes: ["id", "name", "role", "disciplineRole"],
};

/**
 * Mirrors misconductRecordController's assertCurrentAcademicYear — a
 * deliberation decision (dismiss/retain) is exactly as "act on right now"
 * as reporting/recording a mistake, so it's gated the same way: viewing
 * the exceeded-marks list and any past decision stays open for older
 * years (read-only history), but making or undoing a call is only ever
 * allowed against the current academic year.
 */
async function assertCurrentAcademicYear(academicYearId) {
  const year = await AcademicYear.findByPk(academicYearId);
  if (!year) throw ApiError.notFound("Academic year not found");
  if (!year.isCurrent) {
    throw ApiError.conflict(
      `${year.name} isn't the current academic year — deliberation decisions can only be made for the current year.`
    );
  }
}

/**
 * Every student in the school who has exceeded a given term's conduct
 * marks (used up all 40), with their current score and — if the
 * discipline office has already ruled on them this term — that decision
 * too. Powers the "Exceeded termly marks" dashboard cards. Deliberated
 * students stay in the list (their card just shows the decision already
 * made) rather than disappearing, so the office can see who's already
 * been handled vs. who's still awaiting a call.
 */
async function exceededStudents(req, res, next) {
  try {
    const { termId, academicYearId } = req.query;
    if (!termId || !academicYearId) {
      return next(ApiError.badRequest("termId and academicYearId are required"));
    }

    const term = await Term.findByPk(termId);
    if (!term || term.academicYearId !== Number(academicYearId)) return next(ApiError.notFound("Term not found"));

    const exceeded = await conductScoreService.getExceededStudentIds(req.schoolId, termId);
    if (exceeded.length === 0) return res.json([]);

    const studentIds = exceeded.map((e) => e.studentId);
    const [students, deliberations] = await Promise.all([
      Student.findAll({ where: { id: studentIds, schoolId: req.schoolId } }),
      Deliberation.findAll({ where: { studentId: studentIds, termId }, include: [DECIDED_BY_INCLUDE] }),
    ]);

    const classIds = [...new Set(students.map((s) => s.classId))];
    const classes = await Class.findAll({ where: { id: classIds } });
    const classById = new Map(classes.map((c) => [c.id, c]));
    const deliberationByStudent = new Map(deliberations.map((d) => [d.studentId, d]));

    const results = await Promise.all(
      students.map(async (student) => {
        const score = await conductScoreService.getTermScore(student.id, termId);
        const deliberation = deliberationByStudent.get(student.id) || null;
        return {
          studentId: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          admissionNumber: student.admissionNumber,
          guardianName: student.guardianName,
          guardianPhone: student.guardianPhone,
          status: student.status,
          classId: student.classId,
          className: classById.get(student.classId)?.name || null,
          score,
          deliberation: deliberation
            ? {
                id: deliberation.id,
                decision: deliberation.decision,
                reason: deliberation.reason,
                decidedBy: deliberation.decidedBy?.name || null,
                decidedAt: deliberation.decidedAt,
              }
            : null,
        };
      })
    );

    // Undecided students first — the ones actually needing attention —
    // then whoever's already been ruled on, most recently deducted first.
    results.sort((a, b) => {
      if (!a.deliberation && b.deliberation) return -1;
      if (a.deliberation && !b.deliberation) return 1;
      return b.score.deducted - a.score.deducted;
    });

    res.json(results);
  } catch (err) {
    next(err);
  }
}

/**
 * Records (or overwrites) the discipline office's decision for one
 * student's exceeded term. Upsert on studentId+termId — deciding again
 * replaces the prior call rather than stacking duplicate rows, since only
 * the current decision is meaningful (see Deliberation model doc).
 */
async function decide(req, res, next) {
  try {
    if (!CAN_DECIDE.includes(req.user.sbmsRole)) return next(ApiError.forbidden());

    const { studentId, termId, academicYearId, decision, reason } = req.body;
    if (!studentId || !termId || !academicYearId) {
      return next(ApiError.badRequest("studentId, termId and academicYearId are required"));
    }
    if (!DECISIONS.includes(decision)) {
      return next(ApiError.badRequest(`decision must be one of: ${DECISIONS.join(", ")}`, "decision"));
    }

    const student = await Student.findByPk(studentId);
    if (!student || student.schoolId !== req.schoolId) return next(ApiError.notFound("Student not found"));

    const term = await Term.findByPk(termId);
    if (!term || term.academicYearId !== Number(academicYearId)) return next(ApiError.notFound("Term not found"));

    await assertCurrentAcademicYear(academicYearId);

    const [row] = await Deliberation.findOrCreate({
      where: { studentId, termId },
      defaults: {
        schoolId: req.schoolId,
        studentId,
        classId: student.classId,
        academicYearId,
        termId,
        decision,
        reason: reason?.trim() || null,
        decidedByUserId: req.user.id,
        decidedByRole: req.user.sbmsRole,
        decidedAt: new Date(),
      },
    });

    await row.update({
      decision,
      reason: reason?.trim() || null,
      classId: student.classId,
      decidedByUserId: req.user.id,
      decidedByRole: req.user.sbmsRole,
      decidedAt: new Date(),
    });

    const withDecider = await Deliberation.findByPk(row.id, { include: [DECIDED_BY_INCLUDE] });
    res.json({
      id: withDecider.id,
      studentId: withDecider.studentId,
      termId: withDecider.termId,
      decision: withDecider.decision,
      reason: withDecider.reason,
      decidedBy: withDecider.decidedBy?.name || null,
      decidedAt: withDecider.decidedAt,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Undoes a decision — the student goes back to "awaiting deliberation" on
 * the dashboard instead of being represented by some other enum value.
 */
async function undecide(req, res, next) {
  try {
    if (!CAN_DECIDE.includes(req.user.sbmsRole)) return next(ApiError.forbidden());

    const row = await Deliberation.findByPk(req.params.id);
    if (!row || row.schoolId !== req.schoolId) return next(ApiError.notFound("Decision not found"));

    await assertCurrentAcademicYear(row.academicYearId);

    await row.destroy();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { exceededStudents, decide, undecide };
