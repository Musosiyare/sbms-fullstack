const { Op } = require("sequelize");
const { ActivityLog } = require("../models");
const { CATEGORY_ACCESS } = require("../services/activityLogService");

/**
 * Each SBMS role sees an activity log scoped to what it's actually
 * capable of doing in the system, not a raw school-wide audit dump:
 *
 *   - manager / dean_of_discipline / disciplinary_officer see every
 *     logged action in the categories their role has access to
 *     elsewhere in SBMS — reports, deliberations, discussions,
 *     misconduct types (see CATEGORY_ACCESS).
 *   - reporter (a plain teacher) only ever reports mistakes and joins
 *     discussions on their own reports, so they only see rows where
 *     they're the actor or the report/discussion concerns them
 *     (relatedUserId) — never another teacher's activity, and never a
 *     discipline-office-only action like an approval or a misconduct
 *     type change.
 *
 * ?mine=true narrows any role's view down to just their own actions —
 * for a teacher that means "just what I did", vs the full "my activity
 * + what happened to my reports/discussions" view when mine isn't set.
 * ?actorUserId lets discipline-side roles narrow the school-wide view
 * to one staff member. ?category / ?action / ?studentId / ?from / ?to
 * further filter within whatever the role is already allowed to see.
 */
async function list(req, res, next) {
  try {
    const role = req.user.sbmsRole;
    const allowedCategories = CATEGORY_ACCESS[role] || [];
    if (allowedCategories.length === 0) return res.json([]);

    const { category, action, studentId, from, to, mine, actorUserId } = req.query;

    const where = { schoolId: req.schoolId };
    where.category = category && allowedCategories.includes(category) ? category : { [Op.in]: allowedCategories };
    if (action) where.action = action;
    if (studentId) where.studentId = studentId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = end;
      }
    }

    if (role === "reporter") {
      if (mine === "true") {
        // Just what this teacher themselves did — narrower than their
        // full footprint below.
        where.actorUserId = req.user.id;
      } else {
        // A teacher's own footprint only — whatever they did themselves,
        // or whatever happened to a report/discussion of theirs. Still
        // never another teacher's activity.
        where[Op.or] = [{ actorUserId: req.user.id }, { relatedUserId: req.user.id }];
      }
    } else if (mine === "true") {
      where.actorUserId = req.user.id;
    } else if (actorUserId) {
      where.actorUserId = actorUserId;
    }

    const logs = await ActivityLog.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: 500,
    });

    res.json(logs);
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
