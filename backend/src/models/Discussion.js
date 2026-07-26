const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/database");

/**
 * SBMS-OWNED TABLE (sbms_discussions).
 *
 * A case-conference thread attached to a single MisconductRecord — the
 * place teachers, the Dean of Discipline, a Disciplinary Officer, and the
 * manager talk through a mistake before (or instead of) a straight
 * approve/reject, e.g. "is this a first offense?" or "does this warrant
 * a send-home?". The discussion itself never moves marks or changes the
 * record's status — approve/reject on the record is still the only thing
 * that does that. This is deliberately just the conversation.
 *
 * Lifecycle is owned by the Dean of Discipline only:
 *   - OPEN: created the moment the Dean starts a discussion on a record.
 *     Only one discussion can ever exist per record (unique
 *     misconductRecordId) — closing and reopening reuses the same row
 *     rather than spawning a new thread, so history never fragments.
 *   - CLOSED: the Dean ends it, optionally leaving a closing note (e.g.
 *     "Decision: two-day send-home, see record"). Nobody can post once
 *     closed.
 *   - The Dean can reopen a closed discussion if something new comes up;
 *     the message history is untouched either way.
 */
class Discussion extends Model {}

Discussion.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false },
    misconductRecordId: { type: DataTypes.INTEGER, allowNull: false, unique: true },

    status: {
      type: DataTypes.ENUM("open", "closed"),
      allowNull: false,
      defaultValue: "open",
    },

    openedByUserId: { type: DataTypes.INTEGER, allowNull: false },
    openedByRole: { type: DataTypes.STRING, allowNull: false },
    openedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },

    closedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    closedByRole: { type: DataTypes.STRING, allowNull: true },
    closedAt: { type: DataTypes.DATE, allowNull: true },
    closingNote: { type: DataTypes.TEXT, allowNull: true },
  },
  { sequelize, modelName: "Discussion", tableName: "sbms_discussions" }
);

module.exports = Discussion;
