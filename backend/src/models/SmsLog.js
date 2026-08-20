const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/database");

/**
 * SBMS-OWNED TABLE (sbms_sms_logs).
 *
 * One row per guardian-notification attempt, fired whenever a
 * MisconductRecord becomes 'finalized' (direct record, approved report,
 * or class-wide bulk record) and the student has a guardianPhone on file.
 *
 * Kept even for failures (status: 'failed') so discipline staff can see
 * *why* a guardian wasn't reached — bad number, provider down, missing
 * phone — from the Records page, instead of the SMS silently vanishing.
 * `providerResponse` stores whatever MTN's API returned (or the error
 * message) for debugging, kept as TEXT since payload shape can vary.
 */
class SmsLog extends Model {}

SmsLog.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    misconductRecordId: { type: DataTypes.INTEGER, allowNull: true },

    phone: { type: DataTypes.STRING, allowNull: false }, // normalized number actually dialed
    message: { type: DataTypes.TEXT, allowNull: false },

    status: {
      type: DataTypes.ENUM("sent", "failed", "skipped_no_phone"),
      allowNull: false,
    },
    providerResponse: { type: DataTypes.TEXT, allowNull: true },
  },
  { sequelize, modelName: "SmsLog", tableName: "sbms_sms_logs" }
);

module.exports = SmsLog;
