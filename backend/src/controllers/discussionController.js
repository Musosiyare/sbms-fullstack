const { Discussion, DiscussionMessage, MisconductRecord, Student, MisconductType, User, AcademicYear } = require("../models");
const ApiError = require("../utils/ApiError");

const CAN_MANAGE = ["dean_of_discipline", "manager"]; // Dean of Discipline and the school Manager can start, close, and reopen a thread
const AUTHOR_INCLUDE = { model: User, as: "author", attributes: ["id", "name", "role", "disciplineRole"] };

/**
 * A plain teacher (sbmsRole 'reporter') may only see/join a discussion on
 * a record they themselves reported — they don't get a school-wide view
 * of every conversation, just the ones they were pulled into. Manager,
 * Dean of Discipline, and Disciplinary Officer can see any discussion in
 * their school, mirroring their visibility over Records generally.
 */
function assertCanAccess(req, record) {
  if (req.user.sbmsRole === "reporter" && record.reportedByUserId !== req.user.id) {
    throw ApiError.forbidden("You can only join discussions on reports you submitted");
  }
}

async function loadRecordInSchool(recordId, schoolId) {
  const record = await MisconductRecord.findByPk(recordId);
  if (!record || record.schoolId !== schoolId) throw ApiError.notFound("Record not found");
  return record;
}

/**
 * Mirrors misconductRecordController's assertCurrentAcademicYear: a
 * discussion is a live, in-progress conversation, so starting one,
 * posting to it, or reopening it only makes sense against "right now" —
 * the school's current academic year. Older years' discussions remain
 * fully readable (and can still be closed if one was left open), but
 * nobody should be able to keep a case-conference going on a record from
 * a year that's already wrapped up.
 */
async function assertCurrentAcademicYear(academicYearId) {
  const year = await AcademicYear.findByPk(academicYearId);
  if (!year) throw ApiError.notFound("Academic year not found");
  if (!year.isCurrent) {
    throw ApiError.conflict(
      `${year.name} isn't the current academic year — discussions can only be started, posted to, or reopened for the current year.`
    );
  }
}

const DISCUSSION_INCLUDE = [
  {
    model: MisconductRecord,
    include: [
      { model: Student, attributes: ["id", "firstName", "lastName"] },
      { model: MisconductType, attributes: ["id", "title", "severity"] },
    ],
  },
  { model: User, as: "openedBy", attributes: ["id", "name", "role", "disciplineRole"] },
  { model: User, as: "closedBy", attributes: ["id", "name", "role", "disciplineRole"] },
];

/**
 * Dean of Discipline or the school Manager starts a case-conference
 * thread on a record. Fails if one already exists (open or closed) —
 * reopen() is the way back into an existing thread, so history never
 * forks into two threads for the same record.
 */
async function open(req, res, next) {
  try {
    if (!CAN_MANAGE.includes(req.user.sbmsRole)) return next(ApiError.forbidden());

    const { misconductRecordId, message } = req.body;
    if (!misconductRecordId) return next(ApiError.badRequest("misconductRecordId is required"));

    const record = await loadRecordInSchool(misconductRecordId, req.schoolId);
    await assertCurrentAcademicYear(record.academicYearId);

    const existing = await Discussion.findOne({ where: { misconductRecordId: record.id } });
    if (existing) {
      return next(
        ApiError.conflict(
          existing.status === "open"
            ? "A discussion is already open on this record"
            : "This record already has a discussion — reopen it instead of starting a new one"
        )
      );
    }

    const discussion = await Discussion.create({
      schoolId: req.schoolId,
      misconductRecordId: record.id,
      status: "open",
      openedByUserId: req.user.id,
      openedByRole: req.user.sbmsRole,
      openedAt: new Date(),
    });

    if (message && message.trim()) {
      await DiscussionMessage.create({
        discussionId: discussion.id,
        authorUserId: req.user.id,
        authorRole: req.user.sbmsRole,
        message: message.trim(),
      });
    }

    const full = await Discussion.findByPk(discussion.id, { include: DISCUSSION_INCLUDE });
    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
}

/** Dean of Discipline or the school Manager ends a discussion — no more messages can be posted until it's reopened. */
async function close(req, res, next) {
  try {
    if (!CAN_MANAGE.includes(req.user.sbmsRole)) return next(ApiError.forbidden());

    const discussion = await Discussion.findByPk(req.params.id);
    if (!discussion || discussion.schoolId !== req.schoolId) return next(ApiError.notFound("Discussion not found"));
    if (discussion.status !== "open") return next(ApiError.conflict("This discussion is already closed"));

    await discussion.update({
      status: "closed",
      closedByUserId: req.user.id,
      closedByRole: req.user.sbmsRole,
      closedAt: new Date(),
      closingNote: (req.body.note || "").trim() || null,
    });

    const full = await Discussion.findByPk(discussion.id, { include: DISCUSSION_INCLUDE });
    res.json(full);
  } catch (err) {
    next(err);
  }
}

/** Dean of Discipline or the school Manager reopens a closed thread — same row, same history, just live again. */
async function reopen(req, res, next) {
  try {
    if (!CAN_MANAGE.includes(req.user.sbmsRole)) return next(ApiError.forbidden());

    const discussion = await Discussion.findByPk(req.params.id, { include: [{ model: MisconductRecord }] });
    if (!discussion || discussion.schoolId !== req.schoolId) return next(ApiError.notFound("Discussion not found"));
    if (discussion.status !== "closed") return next(ApiError.conflict("This discussion is already open"));
    await assertCurrentAcademicYear(discussion.MisconductRecord.academicYearId);

    await discussion.update({
      status: "open",
      closedByUserId: null,
      closedByRole: null,
      closedAt: null,
      closingNote: null,
    });

    const full = await Discussion.findByPk(discussion.id, { include: DISCUSSION_INCLUDE });
    res.json(full);
  } catch (err) {
    next(err);
  }
}

/** Anyone with access to the underlying record can post — while the thread is still open. */
async function addMessage(req, res, next) {
  try {
    const discussion = await Discussion.findByPk(req.params.id, { include: [{ model: MisconductRecord }] });
    if (!discussion || discussion.schoolId !== req.schoolId) return next(ApiError.notFound("Discussion not found"));
    if (discussion.status !== "open") return next(ApiError.conflict("This discussion is closed"));

    assertCanAccess(req, discussion.MisconductRecord);
    await assertCurrentAcademicYear(discussion.MisconductRecord.academicYearId);

    const { message } = req.body;
    if (!message || !message.trim()) return next(ApiError.badRequest("message is required", "message"));

    const created = await DiscussionMessage.create({
      discussionId: discussion.id,
      authorUserId: req.user.id,
      authorRole: req.user.sbmsRole,
      message: message.trim(),
    });

    const full = await DiscussionMessage.findByPk(created.id, { include: [AUTHOR_INCLUDE] });
    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/discussions?misconductRecordId=X — the single discussion tied
 * to one record (or null if none exists yet), full thread included.
 * GET /api/discussions?status=open — every discussion in the school this
 * user can see, newest first, for a general "what's being discussed"
 * view. A reporter only gets threads on records they reported.
 * ?academicYearId=Y further narrows that overview to threads on records
 * from one academic year — the frontend defaults this to the current
 * year, same as Records/Dashboard, so past years' threads don't show up
 * by default.
 */
async function list(req, res, next) {
  try {
    const { misconductRecordId, status, academicYearId } = req.query;

    if (misconductRecordId) {
      const record = await loadRecordInSchool(misconductRecordId, req.schoolId);
      assertCanAccess(req, record);
      const discussion = await Discussion.findOne({
        where: { misconductRecordId: record.id },
        include: [...DISCUSSION_INCLUDE, { model: DiscussionMessage, as: "messages", include: [AUTHOR_INCLUDE] }],
        order: [[{ model: DiscussionMessage, as: "messages" }, "createdAt", "ASC"]],
      });
      return res.json(discussion || null);
    }

    const where = { schoolId: req.schoolId };
    if (status) where.status = status;

    let discussions = await Discussion.findAll({
      where,
      include: DISCUSSION_INCLUDE,
      order: [["updatedAt", "DESC"]],
    });

    if (req.user.sbmsRole === "reporter") {
      discussions = discussions.filter((d) => d.MisconductRecord?.reportedByUserId === req.user.id);
    }

    if (academicYearId) {
      discussions = discussions.filter((d) => String(d.MisconductRecord?.academicYearId) === String(academicYearId));
    }

    res.json(discussions);
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const discussion = await Discussion.findByPk(req.params.id, {
      include: [...DISCUSSION_INCLUDE, { model: DiscussionMessage, as: "messages", include: [AUTHOR_INCLUDE] }],
      order: [[{ model: DiscussionMessage, as: "messages" }, "createdAt", "ASC"]],
    });
    if (!discussion || discussion.schoolId !== req.schoolId) return next(ApiError.notFound("Discussion not found"));

    assertCanAccess(req, discussion.MisconductRecord);
    res.json(discussion);
  } catch (err) {
    next(err);
  }
}

module.exports = { open, close, reopen, addMessage, list, getOne };
