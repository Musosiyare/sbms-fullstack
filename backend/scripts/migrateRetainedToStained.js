require("dotenv").config();
const sequelize = require("../src/config/database");

/**
 * One-off migration: renames the "retained" deliberation decision to
 * "stained" everywhere it's stored (same meaning — kept enrolled despite
 * exceeding marks — just a new label). Run this ONCE, before restarting
 * the backend with the updated Deliberation model, so:
 *
 *   1. Any existing rows with decision = 'retained' are updated in place
 *      to 'stained' while the column still allows both values.
 *   2. The column's ENUM definition itself is switched over to the new
 *      three values (dismissed_permanently, dismissed_term, stained).
 *
 * Safe to run even if sbms_deliberations has zero rows, or doesn't have
 * any 'retained' rows yet — each step is a no-op in that case. Safe to
 * run more than once.
 *
 * Usage: node backend/scripts/migrateRetainedToStained.js
 */
async function migrate() {
  try {
    await sequelize.authenticate();
    console.log("Connected to the shared database.");

    const [tables] = await sequelize.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'sbms_deliberations'"
    );
    if (!tables[0].count) {
      console.log("sbms_deliberations doesn't exist yet — nothing to migrate. Run setupSbmsTables.js first.");
      process.exit(0);
    }

    // Step 1: widen the enum to accept both old and new values, so the
    // UPDATE below can't fail on a row still holding 'retained'.
    await sequelize.query(
      "ALTER TABLE sbms_deliberations MODIFY COLUMN decision ENUM('dismissed_permanently','dismissed_term','retained','stained') NOT NULL"
    );
    console.log("Widened decision column to allow both 'retained' and 'stained'.");

    // Step 2: move any existing 'retained' rows over to 'stained'.
    const [result] = await sequelize.query(
      "UPDATE sbms_deliberations SET decision = 'stained' WHERE decision = 'retained'"
    );
    console.log(`Updated ${result.affectedRows ?? 0} row(s) from 'retained' to 'stained'.`);

    // Step 3: narrow the enum back down to just the final three values.
    await sequelize.query(
      "ALTER TABLE sbms_deliberations MODIFY COLUMN decision ENUM('dismissed_permanently','dismissed_term','stained') NOT NULL"
    );
    console.log("decision column now only allows dismissed_permanently / dismissed_term / stained.");

    console.log("Done. You can now restart the backend as usual.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}

migrate();
