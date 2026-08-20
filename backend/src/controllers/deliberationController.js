const { Deliberation, Student, Class, Term, AcademicYear, User } = require("../models");
const ApiError = require("../utils/ApiError");
const conductScoreService = require("../services/conductScoreService");
const { logActivity } = require("../services/activityLogService");

// Deliberation is reserved for the Dean of Discipline and manager — a
// Disciplinary Officer can review/finalize day-to-day misconduct reports
// (see misconductRecordController.CAN_FINALIZE), but the actual call on
// dismissing a student is a level above that, so they can see the
// exceeded-marks list and whatever decision's already been made without
// being able to make or undo one themselves.
const CAN_DECIDE = ["dean_of_discipline", "manager"];

const DECISIONS = ["dismissed_permanently", "dismissed_term", "stained"];

const DECIDED_BY_INCLUDE = {
  model: User,
  as: "decidedBy",
  attributes: ["id", "name", "role", "disciplineRole"],
};

/** "System" for an auto-recorded row (see applySystemYearlyDismissals), the decider's name for a human one, or null. */
function decidedByDisplay(d) {
  if (d.decidedBy?.name) return d.decidedBy.name;
  if (d.decidedByRole === "system") return "System";
  return null;
}

const TERM_ORDER = { "Term 1": 1, "Term 2": 2, "Term 3": 3 };

/**
 * The system's own deliberation — auto-recorded the moment a student's
 * cumulative marks for the WHOLE academic year cross the same
 * recommended-dismissal line the Yearly Report has always computed (see
 * conductScoreService.getYearExceededStudentIds: deducted marks >= half
 * the year's total), for any student nobody has formally decided on yet.
 * This is a real Deliberation row — decidedByRole "system", a plain-
 * language reason stating the marks used — not a passive on-screen flag.
 * From the moment it's written it's indistinguishable from a staff
 * decision everywhere it's read: the Dashboard's "Deliberated students"
 * list, the notification bell (with a real reason), and the Dismissed
 * Students report — one table, one set of decision values, exactly as
 * asked ("match dismissed decision for a system and for deliberation —
 * all should be the same decision"). It's dismissed_permanently
 * specifically: the threshold it watches (half the whole year's marks
 * gone) is the most severe/final one the app tracks — the same line the
 * Yearly Report has always labeled "Dismissed". Being system-authored
 * (decidedByRole "system") is what actually makes a row immutable — see
 * undecide()'s guard — not the decision value itself, so a human-decided
 * `dismissed_permanently` row stays as changeable as any other
 * deliberation decision.
 *
 * A student who already has ANY Deliberation this year — a stained, a
 * dismissed-for-term, or a dismissed-permanently, system- or human-made
 * — is left alone. The discipline office's own call, whatever it was,
 * is what governs; the system only fills in for students nobody has
 * reviewed at all. (An earlier version of this let a low-severity human
 * call get silently superseded and hidden behind a later system row —
 * that's exactly the masking this now avoids.)
 *
 * Runs as a cheap reconciliation step at the top of every read that
 * touches this data (exceededStudents here, dismissedStudentsReport in
 * reportController) rather than on a schedule, since nothing in this
 * codebase runs background jobs — the first person to load either
 * screen after a student crosses the line is the one who triggers it.
 * It's a no-op on every call after that: already-decided students
 * (including previously auto-dismissed ones) are skipped.
 */
async function applySystemYearlyDismissals(schoolId, academicYearId) {
  const yearTerms = await Term.findAll({ where: { academicYearId }, raw: true });
  if (yearTerms.length === 0) return;

  const [computedExceeded, existingDeliberations] = await Promise.all([
    conductScoreService.getYearExceededStudentIds(schoolId, academicYearId, yearTerms.length),
    Deliberation.findAll({ where: { schoolId, academicYearId }, attributes: ["studentId", "decision"], raw: true }),
  ]);
  // Any existing human decision — stained, dismissed for term, or
  // dismissed permanently, made in any term of the year — is the
  // discipline office's actual call and stays governing; the system
  // only steps in to catch students nobody has decided on at all. This
  // still closes the original gap (a student stained early in the year
  // could otherwise go on accumulating marks past the year-end line and
  // never get caught, because the first row made it look "handled") —
  // that gap is about students with NO decision at all, not about
  // overriding a DOD/manager call that's already on record. Only a
  // *system* row itself is treated as final and left alone (findOrCreate
  // below is a no-op once one exists for a student).
  const alreadyDecidedIds = new Set(existingDeliberations.map((d) => d.studentId));
  const newIds = computedExceeded.map((e) => e.studentId).filter((id) => !alreadyDecidedIds.has(id));
  if (newIds.length === 0) return;

  const lastTerm = [...yearTerms].sort((a, b) => (TERM_ORDER[b.name] || 0) - (TERM_ORDER[a.name] || 0))[0];
  const students = await Student.findAll({ where: { id: newIds, schoolId } });

  await Promise.all(
    students.map(async (student) => {
      const year = await conductScoreService.getYearScore(student.id, academicYearId);
      // findOrCreate, not create — two requests reconciling the same
      // student at once (e.g. Dashboard and the report both loading)
      // must not both try to insert and collide on the unique
      // (student_id, term_id) index.
      await Deliberation.findOrCreate({
        where: { studentId: student.id, termId: lastTerm.id },
        defaults: {
          schoolId,
          studentId: student.id,
          classId: student.classId,
          academicYearId,
          termId: lastTerm.id,
          decision: "dismissed_permanently",
          reason: `Automatically dismissed by the system — used ${year.deducted} of ${year.maxMarks} conduct marks for the academic year.`,
          decidedByUserId: null,
          decidedByRole: "system",
          decidedAt: new Date(),
        },
      });
    })
  );
}

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

const SEVERITY = { dismissed_permanently: 3, dismissed_term: 2, stained: 1 };

/**
 * Picks the single decision that actually governs a student for the
 * academic year, out of however many Deliberation rows they have across
 * its terms (a student can be decided on in more than one term — e.g.
 * stained in Term 1, then dismissed permanently in Term 2). A human
 * decision always governs over a system one, whatever the severity —
 * the discipline office's own call is what matters, and the system's
 * auto-dismissal is only meant to catch students nobody has reviewed at
 * all (see applySystemYearlyDismissals). Among decisions of the same
 * kind (all-human, or the rare case of only a system row), same
 * severity ranking referenceController's search card and reportController's
 * yearly report also use — dismissed permanently beats dismissed-for-term
 * beats stained; ties (same decision made twice) fall back to whichever
 * was decided most recently.
 *
 * This is what makes "deliberated students" correct when a student is
 * only exceeded THIS term's/year's list because of a cumulative yearly
 * flag but was actually already decided in an earlier term — without
 * this, looking their decision up scoped to just the currently-viewed
 * term would miss it entirely and wrongly show them as still awaiting a
 * call.
 */
function pickGoverningDeliberation(deliberations) {
  const human = deliberations.filter((d) => d.decidedByRole !== "system");
  const pool = human.length > 0 ? human : deliberations;
  return pool.reduce((best, d) => {
    if (!best) return d;
    if (SEVERITY[d.decision] !== SEVERITY[best.decision]) {
      return SEVERITY[d.decision] > SEVERITY[best.decision] ? d : best;
    }
    return new Date(d.decidedAt) > new Date(best.decidedAt) ? d : best;
  }, null);
}

/**
 * Every student in the school who needs a discipline-office decision —
 * either because they've exceeded a given term's conduct marks (used up
 * all 40), or because their cumulative deductions for the whole academic
 * year have crossed the same "recommended dismissal" line the Yearly
 * Report computes (see conductScoreService.getYearExceededStudentIds).
 * The two triggers are unioned into one list so a student who's flagged
 * by the yearly computation isn't invisible to the office just because
 * no single term's 40 marks ran out — every student here goes through
 * the exact same decide()/Deliberation flow and the exact same three
 * decision values, so "exceeded per term" and "exceeded for the year"
 * always resolve to one matching kind of decision rather than two
 * different, disconnected notions of "dismissed". Each result says which
 * trigger(s) applied (exceededTerm / exceededYear) so the UI can explain
 * why a given student is on the list.
 *
 * Powers the "Exceeded marks" dashboard cards. Deliberated students stay
 * in the list (their card just shows the decision already made) rather
 * than disappearing, so the office can see who's already been handled
 * vs. who's still awaiting a call.
 */
async function exceededStudents(req, res, next) {
  try {
    const { termId, academicYearId } = req.query;
    if (!termId || !academicYearId) {
      return next(ApiError.badRequest("termId and academicYearId are required"));
    }

    const term = await Term.findByPk(termId);
    if (!term || term.academicYearId !== Number(academicYearId)) return next(ApiError.notFound("Term not found"));

    await applySystemYearlyDismissals(req.schoolId, academicYearId);

    const yearTerms = await Term.findAll({ where: { academicYearId }, raw: true });
    const termNameById = new Map(yearTerms.map((t) => [t.id, t.name]));

    const [termExceeded, yearExceeded] = await Promise.all([
      conductScoreService.getExceededStudentIds(req.schoolId, termId),
      conductScoreService.getYearExceededStudentIds(req.schoolId, academicYearId, yearTerms.length),
    ]);

    const termExceededIds = new Set(termExceeded.map((e) => e.studentId));
    const yearExceededIds = new Set(yearExceeded.map((e) => e.studentId));
    const studentIds = [...new Set([...termExceededIds, ...yearExceededIds])];
    if (studentIds.length === 0) return res.json([]);

    // Looked up across the WHOLE academic year, not just the currently
    // selected term — a student decided on in an earlier term must still
    // show as decided when viewed from a later term (see
    // pickGoverningDeliberation), rather than looking like they've never
    // been ruled on just because this particular term has no row of its
    // own for them.
    const [students, deliberations] = await Promise.all([
      Student.findAll({ where: { id: studentIds, schoolId: req.schoolId } }),
      Deliberation.findAll({ where: { studentId: studentIds, academicYearId }, include: [DECIDED_BY_INCLUDE] }),
    ]);

    const classIds = [...new Set(students.map((s) => s.classId))];
    const classes = await Class.findAll({ where: { id: classIds } });
    const classById = new Map(classes.map((c) => [c.id, c]));
    const deliberationsByStudent = new Map();
    for (const d of deliberations) {
      if (!deliberationsByStudent.has(d.studentId)) deliberationsByStudent.set(d.studentId, []);
      deliberationsByStudent.get(d.studentId).push(d);
    }

    const results = await Promise.all(
      students.map(async (student) => {
        const score = await conductScoreService.getTermScore(student.id, termId);
        const exceededYear = yearExceededIds.has(student.id);
        const yearScore = exceededYear ? await conductScoreService.getYearScore(student.id, academicYearId) : null;
        const studentDeliberations = deliberationsByStudent.get(student.id) || [];
        const deliberation = pickGoverningDeliberation(studentDeliberations);
        // True if a system row exists for this student ANYWHERE in the
        // academic year, even if a human row in some other term is the
        // one actually governing display (see pickGoverningDeliberation).
        // Belt-and-suspenders alongside the decide()/undecide() server
        // guards: this is what the frontend checks to hide "Change
        // decision", so a pre-existing human row from before those
        // guards existed can't be used to mask the button being shown
        // for a student the system has already ruled on.
        const hasSystemDeliberation = studentDeliberations.some((d) => d.decidedByRole === "system");
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
          exceededTerm: termExceededIds.has(student.id),
          exceededYear,
          yearScore,
          deliberation: deliberation
            ? {
                id: deliberation.id,
                termId: deliberation.termId,
                termName: termNameById.get(deliberation.termId) || null,
                decision: deliberation.decision,
                reason: deliberation.reason,
                decidedBy: decidedByDisplay(deliberation),
                decidedAt: deliberation.decidedAt,
                // True only for the row actually being displayed — used
                // to hide "Undo decision" entirely, since undecide()
                // rejects a system row server-side anyway.
                bySystem: deliberation.decidedByRole === "system",
                // True if ANY row for this student this year is system-
                // authored, even if a different (human) row is the one
                // being displayed above — see hasSystemDeliberation
                // comment. This, not bySystem alone, is what the
                // frontend uses to gate "Change decision".
                locked: hasSystemDeliberation,
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

    // A system-authored row for this exact student/term is a computed
    // fact, not a discretionary call — block overwriting it here too
    // (undecide() already refuses to delete it), so the immutability
    // guarantee holds at the API level and isn't just a hidden button on
    // the frontend.
    const existingForTerm = await Deliberation.findOne({ where: { studentId, termId } });
    if (existingForTerm && existingForTerm.decidedByRole === "system") {
      return next(
        ApiError.forbidden(
          "This was an automatic system dismissal — the student used up half of this academic year's conduct marks. It's a computed decision, not a discretionary one, so it can't be undone or changed."
        )
      );
    }

    // A system-authored row ANYWHERE in this academic year — whatever
    // term it landed in — is a computed fact and can never be
    // superseded by creating a fresh row in some other term (the
    // Dashboard passes whatever term happens to be selected, so this
    // has to be checked independently of the currently-selected term).
    // Checked directly against decidedByRole rather than inferred from
    // decision === "dismissed_permanently" (below), because that
    // inference only happens to work today — it would silently stop
    // protecting anything if applySystemYearlyDismissals ever recorded
    // a different decision value. This is the actual close of the gap:
    // previously only the same-term check above existed, so picking a
    // different term than the system's dismissal and hitting
    // Decide/calling the endpoint directly would upsert a brand new row
    // there, which then displayed as the "governing" decision
    // (pickGoverningDeliberation prefers human over system) — making it
    // look exactly like the system decision had been changed, even
    // though the original system row sat untouched underneath.
    const existingSystemRow = await Deliberation.findOne({
      where: { studentId, academicYearId, decidedByRole: "system" },
      include: [{ model: Term, attributes: ["id", "name"] }],
    });
    if (existingSystemRow && existingSystemRow.termId !== Number(termId)) {
      return next(
        ApiError.forbidden(
          `${student.firstName} ${student.lastName} was automatically dismissed by the system in ${existingSystemRow.Term?.name || "another term"} — that's a computed decision, not a discretionary one, and can't be changed or superseded by a decision recorded in a different term.`
        )
      );
    }

    // Once a student's been dismissed permanently anywhere in the year,
    // that's final — block re-deciding them from a different term
    // (which would otherwise upsert a brand new row there and leave the
    // original permanent dismissal sitting untouched, effectively two
    // conflicting decisions for the same student/year). Editing the
    // *actual* permanent-dismissal row itself (same studentId+termId) is
    // still allowed — e.g. to fix the reason text — only creating a
    // second, different-term row while a permanent dismissal stands is
    // blocked. Undo the original first if it needs to be reversed.
    const existingPermanent = await Deliberation.findOne({
      where: { studentId, academicYearId, decision: "dismissed_permanently" },
      include: [{ model: Term, attributes: ["id", "name"] }],
    });
    if (existingPermanent && existingPermanent.termId !== Number(termId)) {
      return next(
        ApiError.conflict(
          `${student.firstName} ${student.lastName} was already dismissed permanently in ${existingPermanent.Term?.name || "an earlier term"} — this decision is final and can't be changed. Undo it first if it was a mistake.`
        )
      );
    }

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
    const klass = await Class.findByPk(student.classId);

    logActivity({
      schoolId: req.schoolId,
      actorUserId: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.sbmsRole,
      category: "deliberations",
      action: "deliberation_decided",
      description: `${req.user.name} decided "${decision.replace(/_/g, " ")}" for ${student.firstName} ${student.lastName} (${term.name})`,
      entityType: "Deliberation",
      entityId: withDecider.id,
      studentId: student.id,
      metadata: { className: klass?.name },
    });

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
 *
 * A system-authored row (decidedByRole "system" — see
 * applySystemYearlyDismissals) can NEVER be undone through this endpoint,
 * regardless of who's asking or which role they hold. That decision isn't
 * a discretionary call staff made and might reconsider — it's a computed
 * fact (this student used up half the year's marks) that the system
 * recorded automatically. Letting staff "undo" it would effectively let
 * them override a factual threshold with a click, with no new
 * deliberation, no reason recorded, and no accountability trail — exactly
 * the mistake this guard exists to prevent. Only a genuine human
 * deliberation decision (decidedByRole is a real sbmsRole) can be undone.
 */
async function undecide(req, res, next) {
  try {
    if (!CAN_DECIDE.includes(req.user.sbmsRole)) return next(ApiError.forbidden());

    const row = await Deliberation.findByPk(req.params.id);
    if (!row || row.schoolId !== req.schoolId) return next(ApiError.notFound("Decision not found"));

    if (row.decidedByRole === "system") {
      return next(
        ApiError.forbidden(
          "This was an automatic system dismissal — the student used up half of this academic year's conduct marks. It's a computed decision, not a discretionary one, so it can't be undone or changed."
        )
      );
    }

    await assertCurrentAcademicYear(row.academicYearId);

    const { id, studentId, termId, classId } = row;
    await row.destroy();

    const klass = classId ? await Class.findByPk(classId) : null;

    logActivity({
      schoolId: req.schoolId,
      actorUserId: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.sbmsRole,
      category: "deliberations",
      action: "deliberation_undone",
      description: `${req.user.name} undid a deliberation decision`,
      entityType: "Deliberation",
      entityId: id,
      studentId,
      metadata: { termId, className: klass?.name },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * Every deliberation decision ever recorded for one student, across every
 * term and academic year — not just the current one. Powers the
 * student-history modal in Records (SBMS's "eye icon" view), which
 * already lists a student's misconduct records grouped by term; this
 * lets that same view show whether each term's exceeded marks actually
 * ended in a decision, and what it was, alongside the incidents
 * themselves. Unlike exceededStudents, this is a flat per-student list
 * with no "who currently needs review" filtering or system-dismissal
 * reconciliation — it's read-only history, so it's fine to show a term
 * that's since had its record deleted (case reopened) simply by that
 * term having no row here anymore.
 */
async function studentDeliberations(req, res, next) {
  try {
    const { studentId } = req.params;
    const student = await Student.findByPk(studentId);
    if (!student || student.schoolId !== req.schoolId) return next(ApiError.notFound("Student not found"));

    const deliberations = await Deliberation.findAll({
      where: { studentId, schoolId: req.schoolId },
      include: [DECIDED_BY_INCLUDE],
      order: [["decidedAt", "DESC"]],
    });

    res.json(
      deliberations.map((d) => ({
        id: d.id,
        studentId: d.studentId,
        classId: d.classId,
        academicYearId: d.academicYearId,
        termId: d.termId,
        decision: d.decision,
        reason: d.reason,
        decidedBy: decidedByDisplay(d),
        decidedAt: d.decidedAt,
        bySystem: d.decidedByRole === "system",
      }))
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  exceededStudents,
  decide,
  undecide,
  studentDeliberations,
  applySystemYearlyDismissals,
  decidedByDisplay,
};
