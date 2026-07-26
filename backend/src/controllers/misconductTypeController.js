const { MisconductType, School } = require("../models");
const { Op } = require("sequelize");
const ApiError = require("../utils/ApiError");

/** Global templates (schoolId null) plus this school's own types. */
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
    res.json(types);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { title, description, defaultDeduction, severity, requiresSendHome, sendHomeDays } = req.body;
    if (!title) return next(ApiError.badRequest("Title is required", "title"));

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
    // Soft-disable rather than hard delete — existing records reference this
    // type and should keep showing its title/history correctly.
    await type.update({ isActive: false });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
