const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/database");

/**
 * SBMS-OWNED TABLE (sbms_notification_read).
 *
 * Per-item read state, one row per user per notification item they've
 * marked read — the counterpart to NotificationSeen's "bulk cursor"
 * model. Where NotificationSeen just remembers the last time someone
 * opened a feed (so "did they see this at all" can be inferred from a
 * timestamp), this table lets a person toggle a *specific* notification
 * back and forth between read and unread, the way an email inbox works.
 *
 * `feed` + `itemId` identify the notification. Currently three feeds
 * exist — "deliberations" (teacher bell: a sbms_deliberations.id),
 * "discipline_reports" (Dean of Discipline / manager bell: a
 * sbms_misconduct_records.id), and "discipline_queue" (same bell: a
 * student id awaiting a deliberation call) — kept generic so more bells
 * can reuse this table later without a schema change. A row existing = read; deleting it = unread. There's
 * nothing worth keeping about *when* something was marked unread, so
 * unread is represented by absence rather than a status column.
 */
class NotificationRead extends Model {}

NotificationRead.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    feed: { type: DataTypes.STRING, allowNull: false },
    itemId: { type: DataTypes.INTEGER, allowNull: false },
    readAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "NotificationRead",
    tableName: "sbms_notification_read",
    indexes: [{ unique: true, fields: ["user_id", "feed", "item_id"] }],
  }
);

module.exports = NotificationRead;
