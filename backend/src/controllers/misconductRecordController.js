const fs = require("fs");
const path = require("path");
const { Op } = require("sequelize");
const {
  MisconductRecord,
  MisconductType,
  MisconductEvidence,
  Student,
  Class,
  User,
  TeacherModuleAssignment,
  Term,
  AcademicYear,
  Discussion,
  DiscussionMessage,
  Deliberation,
  sequelize,
} = require("../models");
const ApiError = require("../utils/ApiError");
const { EVIDENCE_DIR } = require("../middleware/upload");
const conductScoreService = require("../services/conductScoreService");

const CAN_FINALIZE = ["dean_of_discipline", "disciplinary_officer"];

const EVIDENCE_INCLUDE = {
  model: MisconductEvidence,
  as: "evidence",
  include: [{ model: User, as: "uploadedBy", attributes: ["id", "name", "role", "disciplineRole"] }],
};

/**
 * Persists whatever files multer already wrote to disk (see
 * middleware/upload.js) as MisconductEvidence rows against a record.
 * Called right after a report/record is created, and from the standalone
 * "add more evidence" endpoint — same shape either way, so this is the
 * one place that turns req.files into database rows.
 */
async function saveEvidenceFiles(files, record, userId) {
  if (!files || files.length === 0) return;
  await MisconductEvidence.bulkCreate(
    files.map((file) => ({
      misconductRecordId: record.id,
      schoolId: record.schoolId,
      fileName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      fileSize: file.size,
      uploadedByUserId: userId,
    }))
  );
}

const { toDateOnly, findActiveSendHome } = require("../services/sendHomeService");

/**
 * When a misconduct type is flagged `requiresSendHome`, the send-home date
 * range is calculated automatically instead of being typed in by hand:
 * `sentHomeFrom` defaults to today, and `sentHomeTo` is `sendHomeDays - 1`
 * days after that (so "3 days" means a 3-day span starting from the from
 * date). Anything the caller explicitly provided is respected as-is; only
 * the missing side(s) get filled in.
 */
function resolveSendHomeRange(type, providedFrom, providedTo) {
  if (!type || !type.requiresSendHome) {
    return { sentHomeFrom: providedFrom || null, sentHomeTo: providedTo || null };
  }

  const fromDate = providedFrom ? new Date(providedFrom) : new Date();
  const sentHomeFrom = providedFrom || toDateOnly(fromDate);

  let sentHomeTo = providedTo || null;
  if (!sentHomeTo) {
    const days = Number(type.sendHomeDays) || 1;
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + Math.max(days - 1, 0));
    sentHomeTo = toDateOnly(toDate);
  }

  return { sentHomeFrom, sentHomeTo };
}

/**
 * A plain teacher (sbmsRole 'reporter') may only report a student in a
 * class they're actually assigned to teach — checked against the main
 * system's own teacher_module_assignments table (read-only reference
 * model), scoped to the report's academic year. Managers and discipline
 * staff aren't "teaching" a class in this sense, so this check only
 * applies to 'reporter'.
 */
async function assertTeacherTeachesClass(teacherId, classId, academicYearId) {
  const assignment = await TeacherModuleAssignment.findOne({
    where: { teacherId, classId, academicYearId },
  });
  if (!assignment) {
    throw ApiError.forbidden("You can only report students in a class you teach");
  }
}

async function loadStudentContext(studentId) {
  const student = await Student.findByPk(studentId);
  if (!student || student.status !== "active") throw ApiError.notFound("Student not found");
  const klass = await Class.findByPk(student.classId);
  if (!klass) throw ApiError.notFound("Student's class not found");
  return { student, klass };
}

/**
 * SBMS shares the `terms` table with the main mid-term reporting system,
 * which is the one place `isLocked` actually gets flipped (e.g. Term 1
 * open, Term 2/3 locked until the school rolls forward). SBMS never
 * writes to that table — it only has to respect it: nobody should be able
 * to report or record a mistake against a term that isn't the currently
 * open one. This only gates *creating* a new report/record; it
 * deliberately doesn't block reviewing (approve/reject) an
 * already-submitted report, since the term could roll over between
 * someone reporting a mistake and a DOD/officer getting to review it.
 */
async function assertTermOpen(termId, academicYearId) {
  const term = await Term.findByPk(termId);
  if (!term || term.academicYearId !== Number(academicYearId)) {
    throw ApiError.notFound("Term not found");
  }
  if (term.isLocked) {
    throw ApiError.conflict(
      `${term.name} is locked in the reporting system — only the currently open term can be selected.`
    );
  }
}

/**
 * Reporting/recording a mistake is only ever meant to happen against
 * "right now" — the academic year the school is currently in. Older
 * years stick around in the picker purely so their existing history can
 * still be browsed (Records, ClassReport, Dashboard), but nobody should
 * be able to raise a brand-new report or record against a year that
 * isn't the current one.
 */
async function assertCurrentAcademicYear(academicYearId) {
  const year = await AcademicYear.findByPk(academicYearId);
  if (!year) throw ApiError.notFound("Academic year not found");
  if (!year.isCurrent) {
    throw ApiError.conflict(
      `${year.name} isn't the current academic year — reports and records can only be created for the current year.`
    );
  }
}

async function assertNoActiveSendHome(studentId, excludeRecordId) {
  const active = await findActiveSendHome(studentId, excludeRecordId);
  if (active) {
    const label = active.MisconductType?.title || active.customTitle || "another incident";
    throw ApiError.conflict(
      `This student is already sent home (${label}) until ${active.sentHomeTo} — they can't be sent home again until that period ends.`
    );
  }
}

/**
 * A student the discipline office has already dismissed can't have a new
 * incident recorded against them — either at all (dismissed_permanently)
 * or for the specific term they were dismissed from (dismissed_term).
 * Mirrors findActiveSendHome/assertNoActiveSendHome just above: one
 * lookup helper, one throwing wrapper, reused by every record-creation
 * path (single report, single record, and — filtered rather than thrown
 * — the class-wide bulk path).
 */
async function findDismissal(studentId, termId) {
  return Deliberation.findOne({
    where: {
      studentId,
      [Op.or]: [{ decision: "dismissed_permanently" }, { decision: "dismissed_term", termId }],
    },
  });
}

async function assertNotDismissed(studentId, termId) {
  const dismissal = await findDismissal(studentId, termId);
  if (dismissal) {
    const label = dismissal.decision === "dismissed_permanently" ? "dismissed permanently" : "dismissed for this term";
    throw ApiError.conflict(`This student has been ${label} — no new incident can be recorded against them.`);
  }
}

/**
 * Anyone who can log into SBMS can report a mistake (teacher, manager,
 * disciplinary staff) — this mirrors "when other leader like school
 * manager or teacher found a student with mistakes report to discipline."
 * No marks move yet; status stays 'pending' until a DOD/disciplinary
 * officer finalizes it.
 *
 * One restriction on top of that: a plain teacher (sbmsRole 'reporter')
 * can only report a student in a class they're actually assigned to
 * teach (see assertTeacherTeachesClass) — managers and discipline staff
 * aren't subject to this since they aren't "teaching" a class.
 *
 * The reporter picks an incident from the catalog the Dean of Discipline
 * maintains (misconductTypeId) — deduction values are set there, not
 * typed in by whoever reports it. A free-text description is optional
 * extra context, never required; customTitle stays available as a
 * fallback for the rare case nothing in the catalog fits.
 */
async function createReport(req, res, next) {
  try {
    const { studentId, termId, academicYearId, misconductTypeId, customTitle, description } = req.body;
    if (!studentId || !termId || !academicYearId) {
      return next(ApiError.badRequest("studentId, termId and academicYearId are required"));
    }
    if (!misconductTypeId && !customTitle && !description) {
      return next(ApiError.badRequest("Pick an incident from the list", "misconductTypeId"));
    }
    if (misconductTypeId) {
      const type = await MisconductType.findByPk(misconductTypeId);
      if (!type) return next(ApiError.notFound("Misconduct type not found"));
      // A Disciplinary Officer can already record every other incident type
      // directly (see createRecord) — the report pathway exists for them
      // only so a weekend/send-home incident can reach the Dean of
      // Discipline for review. Anything else submitted here from that role
      // would just be routing around their own "New record" tool.
      if (req.user.sbmsRole === "disciplinary_officer" && !type.requiresSendHome) {
        return next(
          ApiError.forbidden(
            "Disciplinary Officers report only incidents that require sending a student home for the weekend — record any other incident directly instead."
          )
        );
      }
    }
    await assertCurrentAcademicYear(academicYearId);
    await assertTermOpen(termId, academicYearId);

    const { student, klass } = await loadStudentContext(studentId);
    if (student.schoolId !== req.schoolId) return next(ApiError.forbidden());

    // A student already serving a weekend/send-home period is, for SBMS
    // purposes, not currently at school — no new mistake can be reported
    // against them until that period ends, whether or not this particular
    // incident would itself send them home.
    await assertNoActiveSendHome(studentId);
    await assertNotDismissed(studentId, termId);

    if (req.user.sbmsRole === "reporter") {
      await assertTeacherTeachesClass(req.user.id, klass.id, academicYearId);
    }

    const record = await MisconductRecord.create({
      schoolId: req.schoolId,
      studentId: student.id,
      classId: klass.id,
      academicYearId,
      termId,
      misconductTypeId: misconductTypeId || null,
      customTitle: customTitle || null,
      description,
      status: "pending",
      marksDeducted: 0,
      reportedByUserId: req.user.id,
      reportedByRole: req.user.sbmsRole,
    });

    await saveEvidenceFiles(req.files, record, req.user.id);
    await record.reload({ include: [EVIDENCE_INCLUDE] });
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
}

/**
 * DOD / disciplinary officer records a mistake directly — they caught the
 * student themselves, so it's finalized immediately with marks deducted,
 * exactly like the old paper-book entry.
 */
async function createRecord(req, res, next) {
  try {
    if (!CAN_FINALIZE.includes(req.user.sbmsRole)) return next(ApiError.forbidden());

    const {
      studentId,
      termId,
      academicYearId,
      misconductTypeId,
      customTitle,
      description,
      marksDeducted,
      sentHomeFrom,
      sentHomeTo,
    } = req.body;

    if (!studentId || !termId || !academicYearId) {
      return next(ApiError.badRequest("studentId, termId and academicYearId are required"));
    }
    if (!misconductTypeId && !customTitle) {
      return next(ApiError.badRequest("Pick a misconduct type or enter a custom title", "misconductTypeId"));
    }
    await assertCurrentAcademicYear(academicYearId);
    await assertTermOpen(termId, academicYearId);

    let type = null;
    if (misconductTypeId) {
      type = await MisconductType.findByPk(misconductTypeId);
      if (!type) return next(ApiError.notFound("Misconduct type not found"));
    }

    let deduction;
    if (type) {
      // Catalog-backed incidents always use the type's own deduction —
      // it's set once by the Dean of Discipline, not re-typed per record.
      deduction = type.defaultDeduction;
    } else {
      deduction = marksDeducted;
    }
    if (!deduction || deduction <= 0) {
      return next(ApiError.badRequest("Marks deducted must be a positive number", "marksDeducted"));
    }
    if (deduction > conductScoreService.MARKS_PER_TERM) {
      return next(
        ApiError.badRequest(
          `Marks deducted can't exceed ${conductScoreService.MARKS_PER_TERM} — a term's total conduct marks`,
          "marksDeducted"
        )
      );
    }

    const { student, klass } = await loadStudentContext(studentId);
    if (student.schoolId !== req.schoolId) return next(ApiError.forbidden());

    // Same rule as createReport: a student already serving a weekend/
    // send-home period can't have a new mistake recorded against them
    // until that period ends, regardless of whether this incident itself
    // sends them home again.
    await assertNoActiveSendHome(studentId);
    await assertNotDismissed(studentId, termId);

    const sendHome = resolveSendHomeRange(type, sentHomeFrom, sentHomeTo);

    // Mirrors the restriction on approveOneRecord: sending a student home
    // is a judgment call reserved for the Dean of Discipline. A
    // Disciplinary Officer catching this kind of incident themselves
    // can't finalize it on the spot — they have to submit it as a report
    // (createReport) so the Dean of Discipline reviews and approves it.
    if (req.user.sbmsRole === "disciplinary_officer" && sendHome.sentHomeFrom) {
      return next(
        ApiError.forbidden(
          "This incident sends a student home — Disciplinary Officers can't record it directly. Submit it as a report instead so the Dean of Discipline can review it."
        )
      );
    }

    // Never let a single record push the term's remaining marks below
    // zero — cap what's actually deducted to whatever's left, even
    // though the incident itself still gets recorded at its full
    // configured value for the history/paper trail.
    const appliedDeduction = await conductScoreService.capDeductionToRemaining(studentId, termId, deduction);

    const record = await MisconductRecord.create({
      schoolId: req.schoolId,
      studentId: student.id,
      classId: klass.id,
      academicYearId,
      termId,
      misconductTypeId: misconductTypeId || null,
      customTitle: customTitle || null,
      description,
      marksDeducted: appliedDeduction,
      status: "finalized",
      sentHomeFrom: sendHome.sentHomeFrom,
      sentHomeTo: sendHome.sentHomeTo,
      // Recorded and finalized in the same action, by the same person —
      // stamp both so "Reported by" isn't blank for these on the Records
      // page (unlike a report, which comes in via a different reporter).
      reportedByUserId: req.user.id,
      reportedByRole: req.user.sbmsRole,
      finalizedByUserId: req.user.id,
      finalizedByRole: req.user.sbmsRole,
      finalizedAt: new Date(),
    });

    await saveEvidenceFiles(req.files, record, req.user.id);
    await record.reload({ include: [EVIDENCE_INCLUDE] });

    // Tell whoever just recorded this immediately if it used up (or had
    // already used up) the student's conduct marks for the term, so it
    // doesn't quietly go unnoticed until someone later opens the conduct
    // report — this is the point where the case is a staff decision
    // (deliberation/dismissal), not just another deduction.
    const payload = record.toJSON();
    if (await conductScoreService.isTermExceeded(student.id, termId)) {
      payload.marksExceeded = true;
      payload.marksExceededMessage = `${student.firstName} ${student.lastName} has used up all conduct marks allowed for this term — refer this student for deliberation.`;
    }
    res.status(201).json(payload);
  } catch (err) {
    next(err);
  }
}

/**
 * Dean of Discipline / Disciplinary Officer deducts the same conduct
 * marks from every active student in a class at once — e.g. "the whole
 * class refused to clean the classroom" — instead of creating one record
 * per student by hand.
 *
 * Open to both roles in CAN_FINALIZE, but a Disciplinary Officer is still
 * bound by the same requiresSendHome check just below as everywhere else:
 * an incident that sends students home can never go through this
 * class-wide path for anyone (Dean of Discipline included — see the
 * check below), which in practice means an officer only ever gets to use
 * this for incidents that don't need a weekend.
 *
 * Records are created already finalized (marks move immediately), same
 * as createRecord — there's no "whole-class report -> review" pathway,
 * since a pile of 30+ pending reports from one review step wouldn't be
 * any lighter than doing it one by one.
 *
 * Incidents flagged requiresSendHome are refused outright: sending an
 * entire class home in one click is exactly the kind of call that needs
 * to happen per student, not in bulk. Use createRecord/createReport for
 * those instead.
 *
 * `excludeStudentIds` lets the Dean of Discipline leave specific students
 * out of an otherwise class-wide action — e.g. two students who were
 * absent that day, or who did clean up while the rest of the class didn't.
 *
 * Evidence upload isn't supported here (unlike createReport/createRecord)
 * — a single photo/file would end up attached to every student's separate
 * record, and deleting or replacing it later from any one student's
 * record would pull it out from under all the others. Attach evidence to
 * individual records afterward with addEvidence if needed.
 */
async function bulkClassRecord(req, res, next) {
  try {
    if (!CAN_FINALIZE.includes(req.user.sbmsRole)) return next(ApiError.forbidden());

    const {
      classId,
      termId,
      academicYearId,
      misconductTypeId,
      customTitle,
      description,
      marksDeducted,
      excludeStudentIds,
    } = req.body;

    if (!classId || !termId || !academicYearId) {
      return next(ApiError.badRequest("classId, termId and academicYearId are required"));
    }
    if (!misconductTypeId && !customTitle) {
      return next(ApiError.badRequest("Pick a misconduct type or enter a custom title", "misconductTypeId"));
    }
    await assertCurrentAcademicYear(academicYearId);
    await assertTermOpen(termId, academicYearId);

    let type = null;
    if (misconductTypeId) {
      type = await MisconductType.findByPk(misconductTypeId);
      if (!type) return next(ApiError.notFound("Misconduct type not found"));
      if (type.requiresSendHome) {
        return next(
          ApiError.badRequest(
            "This incident sends students home — it can't be applied to a whole class at once. Record it for each student individually.",
            "misconductTypeId"
          )
        );
      }
    }

    const deduction = type ? type.defaultDeduction : Number(marksDeducted);
    if (!deduction || deduction <= 0) {
      return next(ApiError.badRequest("Marks deducted must be a positive number", "marksDeducted"));
    }
    if (deduction > conductScoreService.MARKS_PER_TERM) {
      return next(
        ApiError.badRequest(
          `Marks deducted can't exceed ${conductScoreService.MARKS_PER_TERM} — a term's total conduct marks`,
          "marksDeducted"
        )
      );
    }

    const klass = await Class.findByPk(classId);
    if (!klass || klass.schoolId !== req.schoolId) return next(ApiError.notFound("Class not found"));

    const excludeSet = new Set((Array.isArray(excludeStudentIds) ? excludeStudentIds : []).map(Number));
    const students = await Student.findAll({ where: { classId: klass.id, status: "active" } });
    const candidates = students.filter((s) => !excludeSet.has(s.id));

    // Same rule as createRecord/createReport: a student already serving a
    // weekend/send-home period sits out of a class-wide action too — auto-
    // skipped here (rather than failing the whole batch) since this is a
    // "whole class except a few" tool by design.
    const sendHomeChecks = await Promise.all(candidates.map((s) => findActiveSendHome(s.id)));
    const afterSendHome = candidates.filter((_, i) => !sendHomeChecks[i]);
    const skippedSendHome = candidates.filter((_, i) => sendHomeChecks[i]);

    // Same again for dismissed students — permanently dismissed, or
    // dismissed for this specific term — auto-skipped rather than
    // failing the whole batch, same reasoning as send-home above.
    const dismissalChecks = await Promise.all(afterSendHome.map((s) => findDismissal(s.id, termId)));
    const targets = afterSendHome.filter((_, i) => !dismissalChecks[i]);
    const skippedDismissed = afterSendHome.filter((_, i) => dismissalChecks[i]);

    if (targets.length === 0) {
      return next(ApiError.badRequest("No students to apply this to — check the class roster, your exclusions, or active send-home/dismissal periods"));
    }

    // Never let this push any one student's termly remaining marks below
    // zero — each student's deduction is capped independently to whatever
    // they actually have left this term.
    // Collected alongside record creation so the response can tell the
    // Dean of Discipline exactly which students in the batch have now
    // used up their termly conduct marks — same signal as the single-
    // record path, just gathered across the whole class in one pass.
    const exceededStudents = [];
    const records = await Promise.all(
      targets.map(async (student) => {
        const appliedDeduction = await conductScoreService.capDeductionToRemaining(student.id, termId, deduction);
        const record = await MisconductRecord.create({
          schoolId: req.schoolId,
          studentId: student.id,
          classId: klass.id,
          academicYearId,
          termId,
          misconductTypeId: misconductTypeId || null,
          customTitle: customTitle || null,
          description,
          marksDeducted: appliedDeduction,
          status: "finalized",
          reportedByUserId: req.user.id,
          reportedByRole: req.user.sbmsRole,
          finalizedByUserId: req.user.id,
          finalizedByRole: req.user.sbmsRole,
          finalizedAt: new Date(),
        });
        if (await conductScoreService.isTermExceeded(student.id, termId)) {
          exceededStudents.push({ id: student.id, firstName: student.firstName, lastName: student.lastName });
        }
        return record;
      })
    );

    res.status(201).json({
      classId: klass.id,
      className: klass.name,
      marksDeducted: deduction,
      count: records.length,
      excluded: excludeSet.size,
      skippedSendHome: skippedSendHome.map((s) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName })),
      skippedDismissed: skippedDismissed.map((s) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName })),
      exceededStudents,
      records,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Teacher (sbmsRole 'reporter') or manager equivalent of bulkClassRecord:
 * raises one *pending* report per active student in a class in a single
 * action — "the whole class was late back from break" — instead of
 * submitting one report per student through createReport. Gives a
 * teacher the same whole-class convenience the Dean of Discipline has
 * with bulkClassRecord, but stays true to the report pathway: nothing is
 * finalized and no marks move here — every report still lands in the
 * discipline office's review queue exactly like an individual report
 * would, to be approved or rejected one at a time (or via bulk-approve).
 *
 * Not opened up to dean_of_discipline/disciplinary_officer — they already
 * have bulkClassRecord for a class-wide action, and that one finalizes
 * immediately instead of adding 30+ pending reports to their own queue.
 *
 * Same restriction as bulkClassRecord: an incident flagged
 * requiresSendHome is refused outright — deciding to send an entire
 * class home for the weekend is a per-student judgment call for the
 * discipline office, not something a class-wide report should even
 * suggest.
 *
 * `excludeStudentIds` mirrors bulkClassRecord too — leave specific
 * students out of an otherwise class-wide report (e.g. students who were
 * absent that day).
 *
 * Evidence upload isn't supported here, same reasoning as bulkClassRecord.
 */
async function bulkClassReport(req, res, next) {
  try {
    if (!["reporter", "manager"].includes(req.user.sbmsRole)) return next(ApiError.forbidden());

    const {
      classId,
      termId,
      academicYearId,
      misconductTypeId,
      customTitle,
      description,
      excludeStudentIds,
    } = req.body;

    if (!classId || !termId || !academicYearId) {
      return next(ApiError.badRequest("classId, termId and academicYearId are required"));
    }
    if (!misconductTypeId && !customTitle && !description) {
      return next(ApiError.badRequest("Pick an incident from the list", "misconductTypeId"));
    }
    await assertCurrentAcademicYear(academicYearId);
    await assertTermOpen(termId, academicYearId);

    let type = null;
    if (misconductTypeId) {
      type = await MisconductType.findByPk(misconductTypeId);
      if (!type) return next(ApiError.notFound("Misconduct type not found"));
      if (type.requiresSendHome) {
        return next(
          ApiError.badRequest(
            "This incident sends students home — it can't be reported for a whole class at once. Report it for each student individually.",
            "misconductTypeId"
          )
        );
      }
    }

    const klass = await Class.findByPk(classId);
    if (!klass || klass.schoolId !== req.schoolId) return next(ApiError.notFound("Class not found"));

    // Same restriction as the single-student createReport: a plain
    // teacher can only report a class they actually teach.
    if (req.user.sbmsRole === "reporter") {
      await assertTeacherTeachesClass(req.user.id, klass.id, academicYearId);
    }

    const excludeSet = new Set((Array.isArray(excludeStudentIds) ? excludeStudentIds : []).map(Number));
    const students = await Student.findAll({ where: { classId: klass.id, status: "active" } });
    const candidates = students.filter((s) => !excludeSet.has(s.id));

    // Same rule as createReport: a student already serving a weekend/
    // send-home period sits out of a class-wide report too — auto-
    // skipped here rather than failing the whole batch, same "whole
    // class except a few" design as bulkClassRecord.
    const sendHomeChecks = await Promise.all(candidates.map((s) => findActiveSendHome(s.id)));
    const afterSendHome = candidates.filter((_, i) => !sendHomeChecks[i]);
    const skippedSendHome = candidates.filter((_, i) => sendHomeChecks[i]);

    // Same again for dismissed students, auto-skipped rather than
    // failing the whole batch.
    const dismissalChecks = await Promise.all(afterSendHome.map((s) => findDismissal(s.id, termId)));
    const targets = afterSendHome.filter((_, i) => !dismissalChecks[i]);
    const skippedDismissed = afterSendHome.filter((_, i) => dismissalChecks[i]);

    if (targets.length === 0) {
      return next(
        ApiError.badRequest(
          "No students to report — check the class roster, your exclusions, or active send-home/dismissal periods"
        )
      );
    }

    const records = await Promise.all(
      targets.map((student) =>
        MisconductRecord.create({
          schoolId: req.schoolId,
          studentId: student.id,
          classId: klass.id,
          academicYearId,
          termId,
          misconductTypeId: misconductTypeId || null,
          customTitle: customTitle || null,
          description,
          status: "pending",
          marksDeducted: 0,
          reportedByUserId: req.user.id,
          reportedByRole: req.user.sbmsRole,
        })
      )
    );

    res.status(201).json({
      classId: klass.id,
      className: klass.name,
      count: records.length,
      excluded: excludeSet.size,
      skippedSendHome: skippedSendHome.map((s) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName })),
      skippedDismissed: skippedDismissed.map((s) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName })),
      records,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Core of approving a single pending report — shared by the single
 * PATCH /:id/approve endpoint and bulkApprove below, so "approve" only
 * has one real implementation. Mutates `record` and returns it.
 * `manualMarksDeducted` is only ever supplied by the single-record
 * endpoint (the old custom-report fallback); bulk approval never passes
 * it, so a custom/no-type report in a batch fails loudly instead of
 * silently guessing a number.
 */
async function approveOneRecord(record, req, { sentHomeFrom, sentHomeTo, manualMarksDeducted } = {}) {
  if (record.status !== "pending") throw ApiError.conflict("This report has already been reviewed");

  let deduction;
  let type = null;
  if (record.misconductTypeId) {
    type = await MisconductType.findByPk(record.misconductTypeId);
    if (!type) throw ApiError.notFound("Misconduct type not found");
    deduction = type.defaultDeduction;
  } else if (manualMarksDeducted) {
    // Fallback for an older/custom report that was never tied to a
    // catalog entry — the only case where a number still has to be
    // supplied by hand.
    deduction = manualMarksDeducted;
    if (deduction > conductScoreService.MARKS_PER_TERM) {
      throw ApiError.badRequest(
        `Marks deducted can't exceed ${conductScoreService.MARKS_PER_TERM} — a term's total conduct marks`,
        "marksDeducted"
      );
    }
  } else {
    throw ApiError.badRequest("This report has no incident type on file — reject it and ask for it to be resubmitted.");
  }

  const sendHome = resolveSendHomeRange(type, sentHomeFrom, sentHomeTo);

  // Disciplinary Officers can approve the straightforward stuff — no
  // heavier review needed. Anything that sends a student home (whether
  // that comes from the incident type's own requiresSendHome flag, or a
  // manual sentHomeFrom typed in for a custom report) is judgment-call
  // territory reserved for the Dean of Discipline.
  if (req.user.sbmsRole === "disciplinary_officer" && sendHome.sentHomeFrom) {
    throw ApiError.forbidden(
      "Disciplinary Officers can only approve incidents that don't send a student home — this one needs the Dean of Discipline's review."
    );
  }

  if (sendHome.sentHomeFrom) await assertNoActiveSendHome(record.studentId, record.id);

  // Same termly floor as createRecord/bulkClassRecord: approving a report
  // still records the incident, but can't take remaining marks below zero.
  const appliedDeduction = await conductScoreService.capDeductionToRemaining(record.studentId, record.termId, deduction);

  await record.update({
    marksDeducted: appliedDeduction,
    sentHomeFrom: sendHome.sentHomeFrom,
    sentHomeTo: sendHome.sentHomeTo,
    status: "finalized",
    finalizedByUserId: req.user.id,
    finalizedByRole: req.user.sbmsRole,
    finalizedAt: new Date(),
  });
  return record;
}

/**
 * DOD / disciplinary officer reviews a pending report and approves it —
 * marks are deducted automatically from the incident's own catalog entry
 * (its defaultDeduction), never re-typed by whoever's reviewing. The only
 * override room left is the optional sent-home date range, since that's
 * a case-by-case call the catalog can't predict. Only reports actually
 * need this step; a record a DOD/officer created directly (createRecord)
 * is already finalized the moment it's created.
 *
 * A Disciplinary Officer can only approve incidents that don't send a
 * student home — anything requiring a weekend/send-home is reserved for
 * the Dean of Discipline (see approveOneRecord). This lets an officer
 * clear the straightforward pending reports off the queue without
 * needing the DOD for every single one.
 */
async function approve(req, res, next) {
  try {
    if (!CAN_FINALIZE.includes(req.user.sbmsRole)) return next(ApiError.forbidden());

    const record = await MisconductRecord.findByPk(req.params.id);
    if (!record || record.schoolId !== req.schoolId) return next(ApiError.notFound("Report not found"));

    await approveOneRecord(record, req, {
      sentHomeFrom: req.body.sentHomeFrom,
      sentHomeTo: req.body.sentHomeTo,
      manualMarksDeducted: req.body.marksDeducted,
    });

    const payload = record.toJSON();
    if (await conductScoreService.isTermExceeded(record.studentId, record.termId)) {
      payload.marksExceeded = true;
    }
    res.json(payload);
  } catch (err) {
    next(err);
  }
}

/**
 * Core of rejecting a single pending report — shared by the single
 * PATCH /:id/reject endpoint and bulkReject below. Mutates `record`.
 *
 * Mirrors the same restriction as approveOneRecord: a Disciplinary
 * Officer can only review (approve OR reject) incidents that don't send
 * a student home. Anything requiring a weekend/send-home — whether from
 * the catalog's requiresSendHome flag — is reserved for the Dean of
 * Discipline, on both sides of the decision.
 */
async function rejectOneRecord(record, req, reason) {
  if (record.status !== "pending") throw ApiError.conflict("This report has already been reviewed");
  if (!reason || !reason.trim()) {
    throw ApiError.badRequest("A reason is required to reject a report", "reason");
  }

  if (req.user.sbmsRole === "disciplinary_officer" && record.misconductTypeId) {
    const type = await MisconductType.findByPk(record.misconductTypeId);
    if (type?.requiresSendHome) {
      throw ApiError.forbidden(
        "Disciplinary Officers can only review incidents that don't send a student home — this one needs the Dean of Discipline's review."
      );
    }
  }

  await record.update({
    status: "rejected",
    rejectionReason: reason.trim(),
    rejectedByUserId: req.user.id,
    rejectedByRole: req.user.sbmsRole,
    rejectedAt: new Date(),
  });
  return record;
}

/**
 * DOD / disciplinary officer declines a pending report — no marks ever
 * move. A reason is required so the teacher who reported it (and anyone
 * reviewing history later) knows why.
 */
async function reject(req, res, next) {
  try {
    if (!CAN_FINALIZE.includes(req.user.sbmsRole)) return next(ApiError.forbidden());

    const record = await MisconductRecord.findByPk(req.params.id);
    if (!record || record.schoolId !== req.schoolId) return next(ApiError.notFound("Report not found"));

    await rejectOneRecord(record, req, req.body.reason);
    res.json(record);
  } catch (err) {
    next(err);
  }
}

/**
 * Bulk review, for time management when a batch of reports piled up —
 * approves every id it can and reports the rest as failures instead of
 * failing the whole batch on the first bad one (e.g. one report with no
 * incident type on file, or one student already serving a send-home
 * period, shouldn't block the other 19 from going through). Processed
 * sequentially, not in parallel, so two records for the same student
 * can't race each other past assertNoActiveSendHome.
 */
async function bulkApprove(req, res, next) {
  try {
    if (!CAN_FINALIZE.includes(req.user.sbmsRole)) return next(ApiError.forbidden());

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return next(ApiError.badRequest("ids must be a non-empty array", "ids"));
    }

    const approved = [];
    const failed = [];
    const exceededStudents = [];
    for (const id of ids) {
      try {
        const record = await MisconductRecord.findByPk(id);
        if (!record || record.schoolId !== req.schoolId) throw ApiError.notFound("Report not found");
        await approveOneRecord(record, req);
        approved.push(id);
        if (await conductScoreService.isTermExceeded(record.studentId, record.termId)) {
          const student = await Student.findByPk(record.studentId);
          exceededStudents.push({ id: record.studentId, firstName: student?.firstName, lastName: student?.lastName });
        }
      } catch (err) {
        failed.push({ id, error: err.message || "Could not approve" });
      }
    }
    res.json({ approved, failed, exceededStudents });
  } catch (err) {
    next(err);
  }
}

/**
 * Bulk reject counterpart — same reason applied to every report in the
 * batch (a single textarea covers "these were all duplicates", "class
 * was cancelled that day", etc.), same per-id success/failure reporting
 * as bulkApprove.
 */
async function bulkReject(req, res, next) {
  try {
    if (!CAN_FINALIZE.includes(req.user.sbmsRole)) return next(ApiError.forbidden());

    const { ids, reason } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return next(ApiError.badRequest("ids must be a non-empty array", "ids"));
    }
    if (!reason || !reason.trim()) {
      return next(ApiError.badRequest("A reason is required to reject reports", "reason"));
    }

    const rejected = [];
    const failed = [];
    for (const id of ids) {
      try {
        const record = await MisconductRecord.findByPk(id);
        if (!record || record.schoolId !== req.schoolId) throw ApiError.notFound("Report not found");
        await rejectOneRecord(record, req, reason);
        rejected.push(id);
      } catch (err) {
        failed.push({ id, error: err.message || "Could not reject" });
      }
    }
    res.json({ rejected, failed });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { studentId, classId, termId, academicYearId, status, mine } = req.query;
    const where = { schoolId: req.schoolId };
    if (studentId) where.studentId = studentId;
    if (classId) where.classId = classId;
    if (termId) where.termId = termId;
    if (academicYearId) where.academicYearId = academicYearId;
    if (status) where.status = status;
    // A teacher fetching just what they personally reported (e.g. the
    // teacher-facing "My Reports" view) rather than the full queue.
    if (mine === "true") where.reportedByUserId = req.user.id;

    const records = await MisconductRecord.findAll({
      where,
      include: [
        { model: MisconductType },
        { model: Student, attributes: ["id", "firstName", "lastName"] },
        { model: Class, attributes: ["id", "name"] },
        { model: User, as: "reportedBy", attributes: ["id", "name", "role", "disciplineRole"] },
        { model: User, as: "finalizedBy", attributes: ["id", "name", "role", "disciplineRole"] },
        { model: User, as: "rejectedBy", attributes: ["id", "name", "role", "disciplineRole"] },
        EVIDENCE_INCLUDE,
      ],
      order: [["createdAt", "DESC"]],
    });
    res.json(records);
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const record = await MisconductRecord.findByPk(req.params.id, {
      include: [
        { model: MisconductType },
        { model: Student },
        { model: User, as: "reportedBy", attributes: ["id", "name", "role", "disciplineRole"] },
        { model: User, as: "finalizedBy", attributes: ["id", "name", "role", "disciplineRole"] },
        { model: User, as: "rejectedBy", attributes: ["id", "name", "role", "disciplineRole"] },
        EVIDENCE_INCLUDE,
      ],
    });
    if (!record || record.schoolId !== req.schoolId) return next(ApiError.notFound("Record not found"));
    res.json(record);
  } catch (err) {
    next(err);
  }
}

/**
 * Lets whoever raised a report fix a mistake in it — wrong incident type
 * or a typo in the description — while it's still `pending`. Blocked once
 * the discipline office has acted on it either way: `finalized` (marks
 * have already moved on the strength of what was submitted, so it becomes
 * part of the historical record) or `rejected` (the office has already
 * reviewed and made a call on it — a correction at that point should be
 * raised as a fresh report, not silently reopen a decided one).
 */
async function updateReport(req, res, next) {
  try {
    const record = await MisconductRecord.findByPk(req.params.id);
    if (!record || record.schoolId !== req.schoolId) return next(ApiError.notFound("Report not found"));
    if (record.reportedByUserId !== req.user.id) {
      return next(ApiError.forbidden("You can only edit a report you submitted"));
    }
    if (record.status === "finalized") {
      return next(ApiError.conflict("A report can't be edited once it's been approved"));
    }
    if (record.status === "rejected") {
      return next(ApiError.conflict("A rejected report can't be edited — raise a new report instead"));
    }

    const { misconductTypeId, description } = req.body;
    if (misconductTypeId !== undefined) {
      const type = await MisconductType.findByPk(misconductTypeId);
      if (!type || type.schoolId !== req.schoolId) {
        return next(ApiError.badRequest("Pick a valid incident from the list", "misconductTypeId"));
      }
      record.misconductTypeId = misconductTypeId;
    }
    if (description !== undefined) record.description = description || null;

    await record.save();
    await record.reload({ include: [EVIDENCE_INCLUDE] });
    res.json(record);
  } catch (err) {
    next(err);
  }
}

/**
 * Lets whoever raised a report withdraw it entirely — blocked once the
 * discipline office has acted on it, same reasoning as updateReport:
 * `finalized` records are the historical, mark-affecting record, and a
 * `rejected` one has already been reviewed and decided on.
 */
async function deleteReport(req, res, next) {
  try {
    const record = await MisconductRecord.findByPk(req.params.id, { include: [EVIDENCE_INCLUDE] });
    if (!record || record.schoolId !== req.schoolId) return next(ApiError.notFound("Report not found"));
    if (record.reportedByUserId !== req.user.id) {
      return next(ApiError.forbidden("You can only delete a report you submitted"));
    }
    if (record.status === "finalized") {
      return next(ApiError.conflict("A report can't be deleted once it's been approved"));
    }
    if (record.status === "rejected") {
      return next(ApiError.conflict("A rejected report can't be deleted — it stays on file as reviewed"));
    }

    const evidenceFiles = record.evidence.map((e) => path.join(EVIDENCE_DIR, e.storedName));

    await sequelize.transaction(async (t) => {
      const discussion = await Discussion.findOne({ where: { misconductRecordId: record.id }, transaction: t });
      if (discussion) {
        await DiscussionMessage.destroy({ where: { discussionId: discussion.id }, transaction: t });
        await discussion.destroy({ transaction: t });
      }
      await MisconductEvidence.destroy({ where: { misconductRecordId: record.id }, transaction: t });
      await record.destroy({ transaction: t });
    });

    evidenceFiles.forEach((filePath) => fs.unlink(filePath, () => {})); // best-effort cleanup

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * Attaches more evidence to an already-existing record — e.g. the Dean of
 * Discipline asks for another photo, or a teacher forgot one at report
 * time. Anyone who could have created the record in the first place can
 * add to it; unlike deleteEvidence, this isn't restricted to 'pending'
 * only, since adding context is harmless even after a record is decided.
 */
async function addEvidence(req, res, next) {
  try {
    const record = await MisconductRecord.findByPk(req.params.id);
    if (!record || record.schoolId !== req.schoolId) return next(ApiError.notFound("Record not found"));
    if (!req.files || req.files.length === 0) {
      return next(ApiError.badRequest("Attach at least one file", "evidence"));
    }

    await saveEvidenceFiles(req.files, record, req.user.id);
    await record.reload({ include: [EVIDENCE_INCLUDE] });
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
}

/**
 * Streams an evidence file back to whoever's authenticated and in the
 * same school as the record it's attached to — never served statically,
 * so a file can never leak across schools just by guessing a URL.
 * Content-Disposition stays "inline" so images/PDFs preview in the
 * browser instead of forcing a download; the original filename is
 * restored either way.
 */
async function downloadEvidence(req, res, next) {
  try {
    const record = await MisconductRecord.findByPk(req.params.id);
    if (!record || record.schoolId !== req.schoolId) return next(ApiError.notFound("Record not found"));

    const evidence = await MisconductEvidence.findByPk(req.params.evidenceId);
    if (!evidence || evidence.misconductRecordId !== record.id) {
      return next(ApiError.notFound("Evidence not found"));
    }

    const filePath = path.join(EVIDENCE_DIR, evidence.storedName);
    if (!fs.existsSync(filePath)) return next(ApiError.notFound("Evidence file is missing on the server"));

    res.setHeader("Content-Type", evidence.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(evidence.fileName)}"`);
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
}

/**
 * Removes an evidence file — blocked only once the record has been
 * approved/finalized (marks have moved on the strength of that evidence,
 * so it becomes part of the historical record and can't be pulled out
 * from under it). A pending or rejected report can still have its
 * evidence removed. Only whoever uploaded a given file can remove it —
 * discipline staff review the report but didn't create the evidence, so
 * they can't delete someone else's.
 */
async function deleteEvidence(req, res, next) {
  try {
    const record = await MisconductRecord.findByPk(req.params.id);
    if (!record || record.schoolId !== req.schoolId) return next(ApiError.notFound("Record not found"));

    const evidence = await MisconductEvidence.findByPk(req.params.evidenceId);
    if (!evidence || evidence.misconductRecordId !== record.id) {
      return next(ApiError.notFound("Evidence not found"));
    }

    if (record.status === "finalized") {
      return next(ApiError.conflict("Evidence can't be removed once a report has been approved"));
    }
    if (evidence.uploadedByUserId !== req.user.id) {
      return next(ApiError.forbidden("You can only remove evidence you uploaded"));
    }

    const filePath = path.join(EVIDENCE_DIR, evidence.storedName);
    await evidence.destroy();
    fs.unlink(filePath, () => {}); // best-effort; a dangling file on disk is harmless once the row is gone

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createReport,
  createRecord,
  bulkClassRecord,
  bulkClassReport,
  approve,
  reject,
  bulkApprove,
  bulkReject,
  list,
  getOne,
  updateReport,
  deleteReport,
  addEvidence,
  downloadEvidence,
  deleteEvidence,
};
