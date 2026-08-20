require("dotenv").config();
const sequelize = require("../src/config/database");
const { Deliberation, Student, Class, Term, AcademicYear } = require("../src/models");

/**
 * READ-ONLY audit for the deliberation loophole fixed alongside this
 * script: before decideController's cross-term guard checked
 * decidedByRole directly, a Dean of Discipline could pick a term other
 * than the one a system dismissal (applySystemYearlyDismissals) was
 * recorded in and submit a new decision there. That created a second
 * Deliberation row for the same student/academic year in a different
 * term — which pickGoverningDeliberation (deliberationController.js)
 * then displayed as the "governing" decision, silently masking the
 * original system row underneath.
 *
 * This script finds any student in the live database who ended up with
 * BOTH a system row and a human row for the same academic year, in
 * different terms — i.e. exactly what that gap would have produced.
 * It only reports; it changes nothing. For anyone flagged, a human
 * needs to look at both rows and decide by hand which should stand
 * (the system row is the computed fact — used up half the year's
 * marks — so in almost every real case that's the one that should
 * govern; the extra human row is very likely the artifact to remove).
 *
 * Run with: node scripts/auditDeliberationConflicts.js
 */

async function main() {
  await sequelize.authenticate();

  const rows = await Deliberation.findAll({
    include: [
      { model: Student, attributes: ["id", "firstName", "lastName", "admissionNumber"] },
      { model: Term, attributes: ["id", "name"] },
      { model: AcademicYear, attributes: ["id", "name"] },
      { model: Class, attributes: ["id", "name"] },
    ],
    order: [["studentId", "ASC"], ["academicYearId", "ASC"]],
  });

  const byStudentYear = new Map();
  for (const row of rows) {
    const key = `${row.studentId}:${row.academicYearId}`;
    if (!byStudentYear.has(key)) byStudentYear.set(key, []);
    byStudentYear.get(key).push(row);
  }

  const conflicts = [];
  for (const group of byStudentYear.values()) {
    const systemRows = group.filter((r) => r.decidedByRole === "system");
    const humanRows = group.filter((r) => r.decidedByRole !== "system");
    if (systemRows.length === 0 || humanRows.length === 0) continue;
    // Only a real conflict if they landed in different terms — a
    // system row and a human row for the SAME term can't both exist
    // (unique studentId+termId index), so this only fires cross-term.
    const differentTerm = humanRows.some((h) => systemRows.some((s) => s.termId !== h.termId));
    if (differentTerm) conflicts.push({ systemRows, humanRows });
  }

  if (conflicts.length === 0) {
    console.log("No conflicts found — no student has both a system row and a human row in different terms of the same academic year.");
    await sequelize.close();
    return;
  }

  console.log(`Found ${conflicts.length} student(s) with a system row masked or shadowed by a human row in another term:\n`);
  for (const { systemRows, humanRows } of conflicts) {
    const student = systemRows[0].Student;
    const year = systemRows[0].AcademicYear;
    console.log(`- ${student?.firstName} ${student?.lastName} (${student?.admissionNumber || "no admission no."}), ${year?.name || "unknown year"}`);
    for (const s of systemRows) {
      console.log(`    SYSTEM row  id=${s.id} term=${s.Term?.name} decision=${s.decision} decidedAt=${s.decidedAt.toISOString()}`);
    }
    for (const h of humanRows) {
      console.log(`    HUMAN  row  id=${h.id} term=${h.Term?.name} decision=${h.decision} decidedBy=${h.decidedByRole} decidedAt=${h.decidedAt.toISOString()}`);
    }
    console.log("");
  }
  console.log("Nothing was changed. Review each pair above and decide by hand which row should stand, then delete the other directly (or via the app's undo, for the human row).");

  await sequelize.close();
}

main().catch(async (err) => {
  console.error("Audit failed:", err);
  await sequelize.close();
  process.exit(1);
});
