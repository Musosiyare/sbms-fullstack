const { Op } = require("sequelize");
const { MisconductRecord, MisconductType, Student, Class, User, TeacherModuleAssignment, Term } = require("../models");
const ApiError = require("../utils/ApiError");

const CAN_FINALIZE = ["dean_of_discipline", "disciplinary_officer"];

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

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
 * A student can't be sent home again while they're still serving an
 * existing send-home period — find any other finalized record for this
 * student whose [sentHomeFrom, sentHomeTo] range covers today.
 * `excludeRecordId` lets approve() re-check a record against itself
 * without tripping on its own (not-yet-saved) range.
 */
async function findActiveSendHome(studentId, excludeRecordId) {
  const today = toDateOnly(new Date());
  const where = {
    studentId,
    status: "finalized",
    sentHomeFrom: { [Op.ne]: null, [Op.lte]: today },
    sentHomeTo: { [Op.ne]: null, [Op.gte]: today },
  };
  if (excludeRecordId) where.id = { [Op.ne]: excludeRecordId };
  return MisconductRecord.findOne({ where, include: [{ model: MisconductType }] });
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
    }
    await assertTermOpen(termId, academicYearId);

    const { student, klass } = await loadStudentContext(studentId);
    if (student.schoolId !== req.schoolId) return next(ApiError.forbidden());

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

    const { student, klass } = await loadStudentContext(studentId);
    if (student.schoolId !== req.schoolId) return next(ApiError.forbidden());

    const sendHome = resolveSendHomeRange(type, sentHomeFrom, sentHomeTo);
    if (sendHome.sentHomeFrom) await assertNoActiveSendHome(studentId);

    const record = await MisconductRecord.create({
      schoolId: req.schoolId,
      studentId: student.id,
      classId: klass.id,
      academicYearId,
      termId,
      misconductTypeId: misconductTypeId || null,
      customTitle: customTitle || null,
      description,
      marksDeducted: deduction,
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
    res.status(201).json(record);
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

  await record.update({
    marksDeducted: deduction,
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
    res.json(record);
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
    for (const id of ids) {
      try {
        const record = await MisconductRecord.findByPk(id);
        if (!record || record.schoolId !== req.schoolId) throw ApiError.notFound("Report not found");
        await approveOneRecord(record, req);
        approved.push(id);
      } catch (err) {
        failed.push({ id, error: err.message || "Could not approve" });
      }
    }
    res.json({ approved, failed });
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
    const { studentId, classId, termId, academicYearId, status } = req.query;
    const where = { schoolId: req.schoolId };
    if (studentId) where.studentId = studentId;
    if (classId) where.classId = classId;
    if (termId) where.termId = termId;
    if (academicYearId) where.academicYearId = academicYearId;
    if (status) where.status = status;

    const records = await MisconductRecord.findAll({
      where,
      include: [
        { model: MisconductType },
        { model: Student, attributes: ["id", "firstName", "lastName"] },
        { model: User, as: "reportedBy", attributes: ["id", "name", "role", "disciplineRole"] },
        { model: User, as: "finalizedBy", attributes: ["id", "name", "role", "disciplineRole"] },
        { model: User, as: "rejectedBy", attributes: ["id", "name", "role", "disciplineRole"] },
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
      ],
    });
    if (!record || record.schoolId !== req.schoolId) return next(ApiError.notFound("Record not found"));
    res.json(record);
  } catch (err) {
    next(err);
  }
}

module.exports = { createReport, createRecord, approve, reject, bulkApprove, bulkReject, list, getOne };
