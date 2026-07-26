const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/database");

/**
 * SBMS-OWNED TABLE (sbms_misconduct_types).
 *
 * The catalog of offense categories (e.g. "Absent without permission",
 * "Fighting") so DOD/disciplinary officers pick from a list with a sensible
 * default deduction instead of typing a number from memory every time.
 * `schoolId: null` marks a global template — visible to every school as a
 * starting point — while a school can also add its own on top. SBMS has no
 * role that can create these through the API anymore; any such rows are
 * seeded directly in the database. Deduction values are always editable
 * per-record, so this is a default, not a hard rule.
 *
 * `requiresSendHome`/`sendHomeDays`: some incidents (e.g. severe ones) come
 * with an automatic send-home-for-the-weekend consequence. When set, the
 * misconduct record's sentHomeFrom/sentHomeTo get calculated automatically
 * at record time instead of being typed in by hand.
 */
class MisconductType extends Model {}

MisconductType.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: true }, // null = global template
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    defaultDeduction: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
    severity: {
      type: DataTypes.ENUM("minor", "moderate", "severe"),
      allowNull: false,
      defaultValue: "minor",
    },
    // When true, an incident of this type sends the student home (typically
    // over the weekend) for `sendHomeDays` days. Recording an incident of
    // this type then auto-calculates sentHomeFrom/sentHomeTo on the
    // MisconductRecord instead of requiring a DOD/officer to type dates by
    // hand every time.
    requiresSendHome: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sendHomeDays: { type: DataTypes.INTEGER, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  { sequelize, modelName: "MisconductType", tableName: "sbms_misconduct_types" }
);

module.exports = MisconductType;
