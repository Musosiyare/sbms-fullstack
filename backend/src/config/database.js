require("dotenv").config();
const { Sequelize } = require("sequelize");

// Same DB_* values as the main school-system backend's .env — this connects
// to the SAME MySQL database. SBMS is a separate application (own server,
// own auth, own repo), not a separate database.
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
  }
);

module.exports = sequelize;
