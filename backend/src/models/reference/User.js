const { DataTypes, Model } = require("sequelize");
const sequelize = require("../../config/database");

/**
 * MOSTLY READ-ONLY REFERENCE MODEL, WITH ONE DELIBERATE EXCEPTION.
 *
 * `users` belongs to the main school-system backend and is the single
 * source of login credentials shared by both apps — SBMS checks `email` +
 * `passwordHash` against this table to log a person in. SBMS never
 * inserts, deletes, or touches identity/permission fields here: not
 * `role`, not `schoolId`, not `disciplineRole` (that's assigned from the
 * main system's Disciplinary Staff page — SBMS only reads it).
 *
 * The one exception is password self-service (see authController.
 * changePassword): SBMS DOES update `passwordHash`, `mustChangePassword`,
 * `tokenVersion`, `passwordChangedAt`, and the temp-password fields, for
 * the person who owns that row, when they change their own password. This
 * isn't a crack in the boundary — it's necessary: a `role: "discipline"`
 * account can only ever log into SBMS (the main system blocks it), so
 * SBMS is the *only* place such a person can ever act on their own
 * temporary password. The main system remains the only place anyone
 * else's password gets reset, and `role` itself is still never written
 * from here.
 */
class User extends Model {}

User.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    schoolId: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM("superuser", "manager", "teacher", "discipline"), allowNull: false },
    disciplineRole: {
      type: DataTypes.ENUM("dean_of_discipline", "disciplinary_officer"),
      allowNull: true,
    },
    status: { type: DataTypes.ENUM("active", "suspended"), defaultValue: "active" },
    mustChangePassword: { type: DataTypes.BOOLEAN, defaultValue: false },
    tempPasswordEncrypted: { type: DataTypes.STRING, allowNull: true },
    tempPasswordSetAt: { type: DataTypes.DATE, allowNull: true },
    tempPasswordSetBy: { type: DataTypes.INTEGER, allowNull: true },
    passwordChangedAt: { type: DataTypes.DATE, allowNull: true },
    tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { sequelize, modelName: "User", tableName: "users" }
);

module.exports = User;
