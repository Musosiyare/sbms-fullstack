const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/database");

/**
 * SBMS-OWNED TABLE (sbms_misconduct_evidence).
 *
 * A proof file attached to a MisconductRecord — a teacher raising a
 * report, or a DOD/officer recording a mistake directly, can attach
 * evidence (a photo of the damage, a scanned incident note, a PDF, a
 * Word write-up, etc). Purely supporting material: it never drives any
 * scoring/workflow logic, unlike the record itself.
 *
 * The actual file lives on disk (see middleware/upload.js); this row just
 * tracks where it landed (`storedName`, unique on disk) alongside the
 * name the uploader knows it by (`fileName`), so downloads can restore
 * the original filename instead of exposing the generated one.
 *
 * `uploadedByUserId` is nullable (not a FK-enforced requirement) the same
 * way MisconductRecord's own `reportedByUserId` is — mirrors that
 * pattern rather than inventing a new one.
 */
class MisconductEvidence extends Model {}

MisconductEvidence.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    misconductRecordId: { type: DataTypes.INTEGER, allowNull: false },
    schoolId: { type: DataTypes.INTEGER, allowNull: false },

    fileName: { type: DataTypes.STRING, allowNull: false }, // original name, shown in the UI / used on download
    storedName: { type: DataTypes.STRING, allowNull: false }, // unique generated name, actual filename on disk
    mimeType: { type: DataTypes.STRING, allowNull: false },
    fileSize: { type: DataTypes.INTEGER, allowNull: false }, // bytes

    uploadedByUserId: { type: DataTypes.INTEGER, allowNull: true },
  },
  { sequelize, modelName: "MisconductEvidence", tableName: "sbms_misconduct_evidence" }
);

module.exports = MisconductEvidence;
