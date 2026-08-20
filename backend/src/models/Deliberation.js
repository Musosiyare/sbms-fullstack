const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/database");

/**
 * SBMS-OWNED TABLE (sbms_deliberations).
 *
 * Records the discipline office's actual decision once a student has
 * exceeded their termly conduct marks (see conductScoreService.isTermExceeded
 * — remaining <= 0 out of the 40-per-term budget). Everything in
 * conductScoreService is a computed, on-demand READING of the numbers;
 * nothing in it ever writes a decision anywhere. This table is the one
 * place that decision actually gets recorded, separate from the
 * misconduct records themselves so the incident trail (who did what,
 * when) is never mixed up with the staff decision about what happens to
 * the student as a result.
 *
 * One row per student per term (unique on studentId+termId) — deciding
 * again for the same student/term overwrites the previous decision rather
 * than piling up duplicates, since only the current call matters. Deleting
 * a row reopens the case (student goes back to "awaiting deliberation" on
 * the dashboard) rather than trying to represent "undecided" as its own
 * enum value.
 *
 * `classId`, `academicYearId` captured alongside `termId`/`studentId` for
 * the same reason MisconductRecord captures them: a student's history
 * stays accurate even if they're later moved to a different class.
 */
class Deliberation extends Model {}

Deliberation.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    classId: { type: DataTypes.INTEGER, allowNull: false },
    academicYearId: { type: DataTypes.INTEGER, allowNull: false },
    termId: { type: DataTypes.INTEGER, allowNull: false },

    // dismissed_permanently: expelled outright.
    // dismissed_term: dismissed for the remainder of this term only.
    // stained: reviewed and kept enrolled despite exceeding marks, but the
    // case is recorded on their record rather than cleared outright.
    decision: {
      type: DataTypes.ENUM("dismissed_permanently", "dismissed_term", "stained"),
      allowNull: false,
    },
    reason: { type: DataTypes.TEXT, allowNull: true },

    decidedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    decidedByRole: { type: DataTypes.STRING, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "Deliberation",
    tableName: "sbms_deliberations",
    indexes: [{ unique: true, fields: ["student_id", "term_id"] }],
  }
);

module.exports = Deliberation;
