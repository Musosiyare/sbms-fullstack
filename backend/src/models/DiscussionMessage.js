const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/database");

/**
 * SBMS-OWNED TABLE (sbms_discussion_messages).
 *
 * A single post in a Discussion thread. `authorRole` is stamped at post
 * time (the same effective SBMS role captured elsewhere — 'manager',
 * 'dean_of_discipline', 'disciplinary_officer', 'reporter') so the thread
 * still reads correctly even if someone's role changes later.
 */
class DiscussionMessage extends Model {}

DiscussionMessage.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    discussionId: { type: DataTypes.INTEGER, allowNull: false },
    authorUserId: { type: DataTypes.INTEGER, allowNull: false },
    authorRole: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
  },
  { sequelize, modelName: "DiscussionMessage", tableName: "sbms_discussion_messages", updatedAt: false }
);

module.exports = DiscussionMessage;
