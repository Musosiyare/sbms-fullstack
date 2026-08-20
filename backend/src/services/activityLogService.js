const ActivityLog = require("../models/ActivityLog");

/**
 * Central place every controller action calls after it succeeds, so
 * "add a new loggable action" always means one call here instead of
 * hand-rolling ActivityLog.create in a dozen places with slightly
 * different shapes.
 *
 * Deliberately swallows its own errors: a broken activity log must
 * never take down the actual action it's describing — a report still
 * gets approved even if, say, the log write itself fails. Logged to
 * the console instead, so a persistent problem isn't silently invisible.
 */
async function logActivity({
  schoolId,
  actorUserId,
  actorName,
  actorRole,
  relatedUserId = null,
  category,
  action,
  description,
  entityType = null,
  entityId = null,
  studentId = null,
  metadata = null,
}) {
  try {
    await ActivityLog.create({
      schoolId,
      actorUserId,
      actorName,
      actorRole,
      relatedUserId,
      category,
      action,
      description,
      entityType,
      entityId,
      studentId,
      metadata,
    });
  } catch (err) {
    console.error("Failed to write activity log:", err.message);
  }
}

/**
 * Which categories of activity each SBMS role is allowed to see at all,
 * in activityLogController.list — kept in the service (next to the
 * writer) rather than the controller so the two can never drift apart:
 * every category a role can be shown here is also a category of action
 * that role can actually take or otherwise view elsewhere in SBMS.
 *
 * A plain teacher (reporter) can only report mistakes and join
 * discussions on their own reports, so those are the only two
 * categories they get — never deliberations or misconduct-type
 * management, which they have no part in.
 */
const CATEGORY_ACCESS = {
  manager: ["reports", "deliberations", "discussions", "misconduct_types"],
  dean_of_discipline: ["reports", "deliberations", "discussions", "misconduct_types"],
  disciplinary_officer: ["reports", "deliberations", "discussions", "misconduct_types"],
  reporter: ["reports", "discussions"],
};

module.exports = { logActivity, CATEGORY_ACCESS };
