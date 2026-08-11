const { Op } = require("sequelize");
const { MisconductRecord, MisconductType } = require("../models");

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * A student can't be sent home again (or reported/punished at all, on the
 * class-wide paths) while they're still serving an existing send-home
 * period — find any other finalized record for this student whose
 * [sentHomeFrom, sentHomeTo] range covers today.
 * `excludeRecordId` lets approve() re-check a record against itself
 * without tripping on its own (not-yet-saved) range.
 *
 * Shared by misconductRecordController (report/record creation, both
 * single-student and class-wide) and referenceController (the class
 * roster picker, so the frontend can grey these students out up front
 * instead of only finding out after submission).
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

module.exports = { toDateOnly, findActiveSendHome };
