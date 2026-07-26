const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/database");

/**
 * SBMS-OWNED TABLE (sbms_misconduct_records).
 *
 * Mirrors the two-stage manual workflow Theo described:
 *
 *   1. REPORT (status: 'pending') — a teacher or manager who isn't
 *      themselves a disciplinary authority flags a mistake, picking an
 *      incident from the Dean of Discipline's catalog. No marks are
 *      deducted yet; `reportedByUserId`/`reportedByRole` capture who
 *      raised it. `marksDeducted` stays 0 until reviewed.
 *
 *   2. REVIEW — a Dean of Discipline or Disciplinary Officer reviews a
 *      pending report and either:
 *        - APPROVES it (status: 'finalized') — marks are deducted
 *          automatically, using the reported incident's own default
 *          deduction (no re-entering numbers). `finalizedByUserId`/
 *          `finalizedByRole`/`finalizedAt` capture who approved it.
 *        - REJECTS it (status: 'rejected') — no marks move, ever.
 *          `rejectionReason` is required; `rejectedByUserId`/
 *          `rejectedByRole`/`rejectedAt` capture who declined it and why.
 *
 *   Records the DOD/Disciplinary Officer create directly (they caught the
 *   student themselves) skip review entirely — created straight into
 *   status: 'finalized', same finalizedBy* fields, no separate approval
 *   step, since they *are* the authority the review step exists to reach.
 *
 * Only 'finalized' records count toward a student's conduct score (see
 * conductScoreService) — 'pending' and 'rejected' never affect marks.
 *
 * `classId`, `academicYearId`, and `termId` are captured at record time
 * (not looked up live from the student) so a student's history stays
 * accurate even if they're later moved to a different class.
 *
 * `acknowledgedAt` is reserved for a future "student signs digitally" step
 * (explicitly deferred for now) — left nullable so adding that later is a
 * pure addition, not a migration headache.
 */
class MisconductRecord extends Model {}

MisconductRecord.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    classId: { type: DataTypes.INTEGER, allowNull: false },
    academicYearId: { type: DataTypes.INTEGER, allowNull: false },
    termId: { type: DataTypes.INTEGER, allowNull: false },

    misconductTypeId: { type: DataTypes.INTEGER, allowNull: true },
    customTitle: { type: DataTypes.STRING, allowNull: true }, // used when not from the catalog
    description: { type: DataTypes.TEXT, allowNull: true },

    marksDeducted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: {
      type: DataTypes.ENUM("pending", "finalized", "rejected"),
      allowNull: false,
      defaultValue: "pending",
    },

    sentHomeFrom: { type: DataTypes.DATEONLY, allowNull: true },
    sentHomeTo: { type: DataTypes.DATEONLY, allowNull: true },

    reportedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    reportedByRole: { type: DataTypes.STRING, allowNull: true },

    finalizedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    finalizedByRole: { type: DataTypes.STRING, allowNull: true },
    finalizedAt: { type: DataTypes.DATE, allowNull: true },

    rejectionReason: { type: DataTypes.TEXT, allowNull: true },
    rejectedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    rejectedByRole: { type: DataTypes.STRING, allowNull: true },
    rejectedAt: { type: DataTypes.DATE, allowNull: true },

    acknowledgedAt: { type: DataTypes.DATE, allowNull: true }, // reserved for future student sign-off
  },
  { sequelize, modelName: "MisconductRecord", tableName: "sbms_misconduct_records" }
);

module.exports = MisconductRecord;
