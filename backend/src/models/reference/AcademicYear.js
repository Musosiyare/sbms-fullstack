const { DataTypes, Model } = require("sequelize");
const sequelize = require("../../config/database");

/** READ-ONLY REFERENCE MODEL. See School.js for why. */
class AcademicYear extends Model {}

AcademicYear.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false }, // e.g. "2026-2027"
    isCurrent: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { sequelize, modelName: "AcademicYear", tableName: "academic_years" }
);

module.exports = AcademicYear;
