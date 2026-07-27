require("dotenv").config();
const sequelize = require("../src/config/database");
const { MisconductType, MisconductRecord, MisconductEvidence, Discussion, DiscussionMessage } = require("../src/models");

/**
 * Creates/updates ONLY the tables SBMS owns: sbms_misconduct_types,
 * sbms_misconduct_records, sbms_misconduct_evidence, sbms_discussions,
 * sbms_discussion_messages.
 * Role assignment (Dean of Discipline / Disciplinary Officer) is no
 * longer SBMS's own table — it's the `disciplineRole` column on the main
 * system's `users` table, assigned from there. SBMS only reads it.
 *
 * Deliberately does NOT call sequelize.sync() on the whole connection —
 * that would also try to sync the read-only reference models (School,
 * User, AcademicYear, Term, Class, Student), which belong to the main
 * school-system backend. Those tables already exist; SBMS must never
 * create, alter, or drop them. Run this once after setting up .env, and
 * again any time you add a field to one of SBMS's own models.
 */
async function setup() {
  try {
    await sequelize.authenticate();
    console.log("Connected to the shared database.");

    await MisconductType.sync({ alter: true });
    console.log("sbms_misconduct_types ready.");

    await MisconductRecord.sync({ alter: true });
    console.log("sbms_misconduct_records ready.");

    await MisconductEvidence.sync({ alter: true });
    console.log("sbms_misconduct_evidence ready.");

    await Discussion.sync({ alter: true });
    console.log("sbms_discussions ready.");

    await DiscussionMessage.sync({ alter: true });
    console.log("sbms_discussion_messages ready.");

    console.log("Done. SBMS's own tables are set up — nothing else was touched.");
    console.log(
      "Reminder: to assign a Dean of Discipline / Disciplinary Officer, use the main system's Teachers page — not this app."
    );
    process.exit(0);
  } catch (err) {
    console.error("Setup failed:", err);
    process.exit(1);
  }
}

setup();
