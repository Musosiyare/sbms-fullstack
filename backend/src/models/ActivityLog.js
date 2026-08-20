const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/database");

/**
 * SBMS-OWNED TABLE (sbms_activity_logs).
 *
 * One row per meaningful action taken in SBMS — a report submitted,
 * approved, rejected, edited, or withdrawn; a class-wide record or
 * report; evidence added or removed; a deliberation decided or undone;
 * a discussion opened, messaged, closed, or reopened; a misconduct type
 * created, edited, or removed. Written by activityLogService.logActivity,
 * called from the relevant controller action right after the mutation
 * succeeds — a logging failure never blocks the action itself (see the
 * service).
 *
 * `category` is what activityLogController.list uses to decide which
 * rows a given SBMS role is even allowed to see — it mirrors the same
 * role boundaries already enforced on the underlying actions elsewhere
 * (CAN_FINALIZE / CAN_DECIDE / CAN_MANAGE in the respective
 * controllers), so a role never sees a log entry for an action it isn't
 * itself permitted to take or be shown anywhere else in the app.
 *
 * actorName/actorRole are snapshotted at write time (not just a live
 * join to `users`) so a log entry still reads sensibly even if the
 * actor's name later changes, their discipline role is reassigned, or
 * their account is deactivated — history shouldn't silently reshape
 * itself underneath a past entry.
 *
 * relatedUserId is the "this concerns you" user for ownership-scoped
 * viewing — the reporter of the underlying record, for report/evidence/
 * discussion actions; null for deliberations and misconduct types
 * (nobody "owns" those the way a reporter owns their own report). A
 * plain teacher (sbmsRole 'reporter') only ever sees rows where they're
 * the actor or the related user — see activityLogController.
 */
class ActivityLog extends Model {}

ActivityLog.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false },

    actorUserId: { type: DataTypes.INTEGER, allowNull: true },
    actorName: { type: DataTypes.STRING, allowNull: false },
    actorRole: { type: DataTypes.STRING, allowNull: false },

    relatedUserId: { type: DataTypes.INTEGER, allowNull: true },

    category: {
      type: DataTypes.ENUM("reports", "deliberations", "discussions", "misconduct_types"),
      allowNull: false,
    },
    action: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },

    entityType: { type: DataTypes.STRING, allowNull: true },
    entityId: { type: DataTypes.INTEGER, allowNull: true },
    studentId: { type: DataTypes.INTEGER, allowNull: true },

    metadata: { type: DataTypes.JSON, allowNull: true },
  },
  { sequelize, modelName: "ActivityLog", tableName: "sbms_activity_logs" }
);

module.exports = ActivityLog;
