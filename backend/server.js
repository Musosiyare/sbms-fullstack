require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const sequelize = require("./src/config/database");
require("./src/models"); // register associations

const authRoutes = require("./src/routes/authRoutes");
const referenceRoutes = require("./src/routes/referenceRoutes");
const misconductTypeRoutes = require("./src/routes/misconductTypeRoutes");
const misconductRecordRoutes = require("./src/routes/misconductRecordRoutes");
const reportRoutes = require("./src/routes/reportRoutes");
const discussionRoutes = require("./src/routes/discussionRoutes");
const deliberationRoutes = require("./src/routes/deliberationRoutes");
const errorHandler = require("./src/middleware/errorHandler");

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  // express.json() only populates req.body when the request has a
  // application/json Content-Type. GET requests (and any request without
  // that header) leave req.body as undefined, which crashes any handler
  // that reads req.body.<field> without a guard. Normalize it here once.
  if (req.body === undefined) req.body = {};
  next();
});
app.use(morgan("dev"));

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "sbms-backend" }));

app.use("/api/auth", authRoutes);
app.use("/api/reference", referenceRoutes);
app.use("/api/misconduct-types", misconductTypeRoutes);
app.use("/api/misconduct-records", misconductRecordRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/discussions", discussionRoutes);
app.use("/api/deliberations", deliberationRoutes);

app.use((req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

app.use(errorHandler);

const PORT = process.env.PORT || 4100;

async function start() {
  try {
    await sequelize.authenticate();
    console.log("Connected to the shared database.");

    // Deliberately NOT calling sequelize.sync() here — that would sync
    // every registered model, including the read-only reference models
    // (School, User, AcademicYear, Term, Class, Student), which belong to
    // the main school-system backend and must never be altered by SBMS.
    // SBMS's own tables are created/updated separately, once, via
    // `npm run setup-tables` (scripts/setupSbmsTables.js).

    app.listen(PORT, () => console.log(`SBMS backend running on http://localhost:${PORT}`));
  } catch (err) {
    console.error("Failed to start SBMS backend:", err);
    process.exit(1);
  }
}

start();
