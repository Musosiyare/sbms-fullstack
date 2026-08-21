const { DataTypes, Model } = require("sequelize");
const sequelize = require("../../config/database");

/**
 * READ-ONLY REFERENCE MODEL.
 *
 * `schools` belongs to the main school-system backend. SBMS shares the same
 * MySQL database and reads this table to know which school a record
 * belongs to, but never creates, updates, or deletes rows here, and never
 * runs sync()/alter on it. Only the fields SBMS actually needs are mapped —
 * the main system's model is the source of truth for the full schema.
 */
class School extends Model {}

School.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    logoUrl: { type: DataTypes.STRING, allowNull: true },
    address: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.ENUM("active", "suspended"), defaultValue: "active" },
  },
  { sequelize, modelName: "School", tableName: "schools" }
);

module.exports = School;
