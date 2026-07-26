const { DataTypes, Model } = require("sequelize");
const sequelize = require("../../config/database");

/** READ-ONLY REFERENCE MODEL. See School.js for why. */
class Class extends Model {}

Class.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false },
    academicYearId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false }, // e.g. "S1A"
    isSuspended: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { sequelize, modelName: "Class", tableName: "classes" }
);

module.exports = Class;
