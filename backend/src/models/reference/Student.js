const { DataTypes, Model } = require("sequelize");
const sequelize = require("../../config/database");

/** READ-ONLY REFERENCE MODEL. See School.js for why. */
class Student extends Model {}

Student.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: false },
    classId: { type: DataTypes.INTEGER, allowNull: false },
    firstName: { type: DataTypes.STRING, allowNull: false },
    lastName: { type: DataTypes.STRING, allowNull: false },
    admissionNumber: { type: DataTypes.STRING, allowNull: true },
    guardianName: { type: DataTypes.STRING, allowNull: true },
    guardianPhone: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.ENUM("active", "inactive"), defaultValue: "active" },
  },
  { sequelize, modelName: "Student", tableName: "students" }
);

module.exports = Student;
