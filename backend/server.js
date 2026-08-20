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
const activityLogRoutes = require("./src/routes/activityLogRoutes");
const notificationRoutes = require("./src/routes/notificationRoutes");
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
app.use("/api/activity-logs", activityLogRoutes);
app.use("/api/notifications", notificationRoutes);

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
    //
    // That split means it's silently possible to add a field to an SBMS
    // model (e.g. Deliberation.decidedByRole) and forget to re-run
    // setup-tables against the live database — every read/write against
    // that table then fails or comes back empty with nothing in the logs
    // pointing at why. Rather than let that happen quietly again, check
    // each SBMS table actually exists (and has its columns) right at
    // boot and fail loudly with the fix if it doesn't.
    const { Deliberation, MisconductRecord, MisconductType } = require("./src/models");
    const queryInterface = sequelize.getQueryInterface();
    const checks = [
      { model: Deliberation, table: "sbms_deliberations" },
      { model: MisconductRecord, table: "sbms_misconduct_records" },
      { model: MisconductType, table: "sbms_misconduct_types" },
    ];
    for (const { model, table } of checks) {
      const modelColumns = Object.keys(model.getAttributes()).map((k) => model.getAttributes()[k].field || k);
      let dbColumns;
      try {
        dbColumns = await queryInterface.describeTable(table);
      } catch {
        console.error(
          `\n[SBMS STARTUP] Table "${table}" doesn't exist in the database yet.\n` +
            `Run "npm run setup-tables" in backend/ against this database before using the app — ` +
            `SBMS features backed by this table (including deliberations/dismissals) will silently fail until you do.\n`
        );
        continue;
      }
      const missing = modelColumns.filter((c) => !(c in dbColumns));
      if (missing.length > 0) {
        console.error(
          `\n[SBMS STARTUP] Table "${table}" is missing column(s): ${missing.join(", ")}.\n` +
            `Run "npm run setup-tables" in backend/ to bring it up to date — ` +
            `features relying on those columns will silently misbehave until you do.\n`
        );
      }
    }

    app.listen(PORT, () => console.log(`SBMS backend running on http://localhost:${PORT}`));
  } catch (err) {
    console.error("Failed to start SBMS backend:", err);
    process.exit(1);
  }
}

start();
