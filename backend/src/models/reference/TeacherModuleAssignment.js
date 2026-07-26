const { DataTypes, Model } = require("sequelize");
const sequelize = require("../../config/database");

/**
 * READ-ONLY REFERENCE MODEL. See School.js for why.
 *
 * Mirrors the main system's `teacher_module_assignments` table — the
 * source of truth for which teacher is assigned to teach which module
 * in which class (per academic year). SBMS uses this only to check
 * "is this teacher actually assigned to this class?" before letting
 * them file a misconduct report — it never creates/edits assignments.
 */
class TeacherModuleAssignment extends Model {}

TeacherModuleAssignment.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    teacherId: { type: DataTypes.INTEGER, allowNull: false },
    moduleId: { type: DataTypes.INTEGER, allowNull: false },
    classId: { type: DataTypes.INTEGER, allowNull: false },
    academicYearId: { type: DataTypes.INTEGER, allowNull: false },
  },
  { sequelize, modelName: "TeacherModuleAssignment", tableName: "teacher_module_assignments" }
);

module.exports = TeacherModuleAssignment;
