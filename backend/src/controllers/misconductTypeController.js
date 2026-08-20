const { MisconductType, MisconductRecord, School } = require("../models");
const { Op, fn, col } = require("sequelize");
const ApiError = require("../utils/ApiError");
const { MARKS_PER_TERM } = require("../services/conductScoreService");
const { logActivity } = require("../services/activityLogService");

/**
 * Global templates (schoolId null) plus this school's own types. Each type
 * is annotated with recordsCount — how many MisconductRecords reference it
 * — so the frontend can explain/skip the delete confirmation up front
 * instead of only finding out it's blocked after confirming.
 */
async function list(req, res, next) {
  try {
    const where = req.schoolId
      ? { [Op.or]: [{ schoolId: req.schoolId }, { schoolId: null }] }
      : { schoolId: null };
    const types = await MisconductType.findAll({
      where,
      include: [{ model: School, attributes: ["id", "name"] }],
      order: [["title", "ASC"]],
    });

    const counts = types.length
      ? await MisconductRecord.findAll({
          attributes: ["misconductTypeId", [fn("COUNT", col("id")), "count"]],
          where: { misconductTypeId: { [Op.in]: types.map((t) => t.id) } },
          group: ["misconductTypeId"],
          raw: true,
        })
      : [];
    const countByTypeId = new Map(counts.map((c) => [c.misconductTypeId, Number(c.count)]));

    res.json(types.map((t) => ({ ...t.toJSON(), recordsCount: countByTypeId.get(t.id) || 0 })));
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { title, description, defaultDeduction, severity, requiresSendHome, sendHomeDays } = req.body;
    if (!title) return next(ApiError.badRequest("Title is required", "title"));

    // A single incident type can't be configured to outweigh an entire
    // term's conduct marks — that would let one incident alone decide a
    // student's termly outcome, which is exactly the kind of call the
    // yearly-combined decision (see conductScoreService) is meant to make
    // instead of any one record.
    if (defaultDeduction !== undefined && (Number(defaultDeduction) <= 0 || Number(defaultDeduction) > MARKS_PER_TERM)) {
      return next(
        ApiError.badRequest(`Default deduction must be between 1 and ${MARKS_PER_TERM} (a term's total conduct marks)`, "defaultDeduction")
      );
    }

    const sendHome = Boolean(requiresSendHome);
    if (sendHome && (!sendHomeDays || Number(sendHomeDays) <= 0)) {
      return next(ApiError.badRequest("Enter how many days the student is sent home for", "sendHomeDays"));
    }

    const type = await MisconductType.create({
      schoolId: req.schoolId,
      title,
      description,
      defaultDeduction: defaultDeduction ?? 5,
      severity: severity || "minor",
      requiresSendHome: sendHome,
      sendHomeDays: sendHome ? Number(sendHomeDays) : null,
    });

    logActivity({
      schoolId: req.schoolId,
      actorUserId: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.sbmsRole,
      category: "misconduct_types",
      action: "misconduct_type_created",
      description: `${req.user.name} added misconduct type "${type.title}"`,
      entityType: "MisconductType",
      entityId: type.id,
    });

    res.status(201).json(type);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const type = await MisconductType.findByPk(req.params.id);
    if (!type) return next(ApiError.notFound("Misconduct type not found"));
    if (type.schoolId !== req.schoolId) {
      return next(ApiError.forbidden("You can't edit another school's misconduct type"));
    }

    const { title, description, defaultDeduction, severity, isActive, requiresSendHome, sendHomeDays } = req.body;

    // A deactivated type is frozen — the only change allowed on it is
    // reactivating (isActive: true). Any other field change has to wait
    // until it's active again, so nobody edits a type's title/deduction/
    // etc. while it's sitting hidden from the picker.
    const onlyTogglingActive =
      isActive !== undefined &&
      title === undefined &&
      description === undefined &&
      defaultDeduction === undefined &&
      severity === undefined &&
      requiresSendHome === undefined &&
      sendHomeDays === undefined;
    if (!type.isActive && !(isActive === true && onlyTogglingActive)) {
      return next(
        ApiError.badRequest("This misconduct type is deactivated — reactivate it before making any other changes.")
      );
    }

    if (defaultDeduction !== undefined && (Number(defaultDeduction) <= 0 || Number(defaultDeduction) > MARKS_PER_TERM)) {
      return next(
        ApiError.badRequest(`Default deduction must be between 1 and ${MARKS_PER_TERM} (a term's total conduct marks)`, "defaultDeduction")
      );
    }

    const nextRequiresSendHome = requiresSendHome !== undefined ? Boolean(requiresSendHome) : type.requiresSendHome;
    const nextSendHomeDays = requiresSendHome !== undefined ? sendHomeDays : (sendHomeDays !== undefined ? sendHomeDays : type.sendHomeDays);
    if (nextRequiresSendHome && (!nextSendHomeDays || Number(nextSendHomeDays) <= 0)) {
      return next(ApiError.badRequest("Enter how many days the student is sent home for", "sendHomeDays"));
    }

    await type.update({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(defaultDeduction !== undefined && { defaultDeduction }),
      ...(severity !== undefined && { severity }),
      ...(isActive !== undefined && { isActive }),
      ...(requiresSendHome !== undefined && {
        requiresSendHome: nextRequiresSendHome,
        sendHomeDays: nextRequiresSendHome ? Number(nextSendHomeDays) : null,
      }),
    });

    logActivity({
      schoolId: req.schoolId,
      actorUserId: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.sbmsRole,
      category: "misconduct_types",
      action: "misconduct_type_updated",
      description: onlyTogglingActive
        ? `${req.user.name} ${isActive ? "reactivated" : "deactivated"} misconduct type "${type.title}"`
        : `${req.user.name} updated misconduct type "${type.title}"`,
      entityType: "MisconductType",
      entityId: type.id,
    });

    res.json(type);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const type = await MisconductType.findByPk(req.params.id);
    if (!type) return next(ApiError.notFound("Misconduct type not found"));
    if (type.schoolId !== req.schoolId) {
      return next(ApiError.forbidden("You can't delete another school's misconduct type"));
    }

    // A real, permanent delete — but only when it's safe to do so. If any
    // record (pending or finalized, any year) already references this
    // type, removing the row would leave that record with no title/history
    // to show. In that case, deactivating (isActive: false) is the right
    // move instead — it disappears from the picker but existing records
    // keep their title intact.
    const inUse = await MisconductRecord.count({ where: { misconductTypeId: type.id } });
    if (inUse > 0) {
      return next(
        ApiError.conflict(
          `"${type.title}" is used by ${inUse} existing record${inUse === 1 ? "" : "s"} and can't be deleted — deactivate it instead so it stops appearing in the picker while keeping those records intact.`,
          "MISCONDUCT_TYPE_IN_USE"
        )
      );
    }

    await type.destroy();

    logActivity({
      schoolId: req.schoolId,
      actorUserId: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.sbmsRole,
      category: "misconduct_types",
      action: "misconduct_type_deleted",
      description: `${req.user.name} deleted misconduct type "${type.title}"`,
      entityType: "MisconductType",
      entityId: type.id,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
