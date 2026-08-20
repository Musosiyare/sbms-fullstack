const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/database");

/**
 * SBMS-OWNED TABLE (sbms_notification_seen).
 *
 * One row per user per notification feed, storing the last time that
 * person opened that feed. `feed` is kept as a free-text key (rather than
 * one column per feed) so more read/unread bells can be added later
 * without a schema change — currently only "deliberations" exists (the
 * teacher-facing bell listing every deliberation decision made
 * school-wide). Anything with a decidedAt/createdAt after `lastSeenAt` is
 * unread; opening the bell bumps `lastSeenAt` to now.
 */
class NotificationSeen extends Model {}

NotificationSeen.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    feed: { type: DataTypes.STRING, allowNull: false },
    lastSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "NotificationSeen",
    tableName: "sbms_notification_seen",
    indexes: [{ unique: true, fields: ["user_id", "feed"] }],
  }
);

module.exports = NotificationSeen;
