const { DataTypes, Model } = require("sequelize");
const sequelize = require("../../config/database");

/** READ-ONLY REFERENCE MODEL. See School.js for why. */
class Term extends Model {}

Term.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    academicYearId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.ENUM("Term 1", "Term 2", "Term 3"), allowNull: false },
    isLocked: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { sequelize, modelName: "Term", tableName: "terms" }
);

module.exports = Term;
