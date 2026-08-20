require("dotenv").config();
const sequelize = require("../src/config/database");
const { ActivityLog, MisconductRecord, Discussion, Student, Class } = require("../src/models");

/**
 * One-off backfill for activity-log rows written BEFORE the description
 * format changed. Old rows still have the class name baked into the
 * sentence as "(Class Name)" and marks deducted baked in as
 * "— N marks deducted", with no `metadata.className` /
 * `metadata.marksDeducted` — so the UI's class-name-in-bold and
 * marks-deducted card have nothing to render for them and they keep
 * showing the old plain-text layout.
 *
 * Two passes:
 *
 * 1. PARSE — rewrites every row that matches one of the five old
 *    description shapes (report_created, record_created,
 *    class_record_created, class_report_created, report_approved) into
 *    the new shape: the class name and mark count are stripped out of
 *    `description` and moved into `metadata`, exactly like newly-written
 *    rows already do.
 *
 * 2. DERIVE — a second group of actions (report_rejected, report_updated,
 *    report_withdrawn, evidence_added, evidence_deleted, the four
 *    discussion_* actions, and the two deliberation_* actions) never had
 *    a class name in their text at all, even before this change — the UI
 *    just had nothing to show for them. For these there's nothing to
 *    parse out of the sentence, so instead we look up the class via
 *    whatever the row already points to (entityType/entityId for a
 *    MisconductRecord or Discussion, studentId as a fallback for
 *    deliberations) and add `metadata.className` from that.
 *
 * Both passes are safe to run more than once — a row that's already been
 * updated is skipped the second time (parse: no longer matches the old
 * text; derive: metadata.className is already set).
 *
 * Run with: npm run backfill-activity-log (from backend/), or
 * `node scripts/backfillActivityLogMetadata.js` directly.
 */

// report_created / record_created:
// "<name> reported|recorded <student> (<class>) for <incident>[ — <N> marks deducted]"
const REPORTED_OR_RECORDED = /^(.*? (?:reported|recorded) .*?) \(([^)]+)\) for (.+?)(?: — (\d+) marks deducted)?$/;

// class_record_created:
// "<name> deducted <N> marks from <count> student(s) in <class> for <incident>"
const CLASS_RECORD_CREATED = /^(.*? deducted) (\d+) marks from (.+?) in (.+?) for (.+)$/;

// class_report_created:
// "<name> submitted <count> pending report(s) for <class> — <incident>"
const CLASS_REPORT_CREATED = /^(.*? submitted .+?) for (.+?) — (.+)$/;

// report_approved:
// "<name> approved <student>'s report for <incident> — <N> marks deducted"
const REPORT_APPROVED = /^(.*? approved .*? report for .+?) — (\d+) marks deducted$/;

function parseRow(log) {
  const d = log.description;

  if (log.action === "report_created" || log.action === "record_created") {
    const m = d.match(REPORTED_OR_RECORDED);
    if (!m) return null;
    const [, prefix, className, incident, marks] = m;
    const description = `${prefix} for ${incident}`;
    const metadata = { ...(log.metadata || {}), className };
    if (marks) metadata.marksDeducted = Number(marks);
    return { description, metadata };
  }

  if (log.action === "class_record_created") {
    const m = d.match(CLASS_RECORD_CREATED);
    if (!m) return null;
    const [, prefix, marks, countPhrase, className, incident] = m;
    const description = `${prefix} marks from ${countPhrase} for ${incident}`;
    const metadata = { ...(log.metadata || {}), className, marksDeducted: Number(marks) };
    return { description, metadata };
  }

  if (log.action === "class_report_created") {
    const m = d.match(CLASS_REPORT_CREATED);
    if (!m) return null;
    const [, prefix, className, incident] = m;
    const description = `${prefix} — ${incident}`;
    const metadata = { ...(log.metadata || {}), className };
    return { description, metadata };
  }

  if (log.action === "report_approved") {
    const m = d.match(REPORT_APPROVED);
    if (!m) return null;
    const [, prefix, marks] = m;
    const description = prefix;
    const metadata = { ...(log.metadata || {}), marksDeducted: Number(marks) };
    return { description, metadata };
  }

  return null;
}

// Actions whose old text never mentioned a class at all — className has
// to be derived from what the row points to, not parsed out of a sentence.
const DERIVE_ACTIONS = [
  "report_rejected",
  "report_updated",
  "report_withdrawn",
  "evidence_added",
  "evidence_deleted",
  "discussion_opened",
  "discussion_closed",
  "discussion_reopened",
  "discussion_message_posted",
  "deliberation_decided",
  "deliberation_undone",
];

async function deriveClassName(log, caches) {
  // A row pointing straight at a MisconductRecord: read classId off it.
  if (log.entityType === "MisconductRecord" && log.entityId) {
    if (!caches.records.has(log.entityId)) {
      caches.records.set(log.entityId, await MisconductRecord.findByPk(log.entityId));
    }
    const record = caches.records.get(log.entityId);
    if (record?.classId) return classNameFor(record.classId, caches);
  }

  // A discussion row: hop to its MisconductRecord for the classId.
  if (log.entityType === "Discussion" && log.entityId) {
    if (!caches.discussions.has(log.entityId)) {
      caches.discussions.set(log.entityId, await Discussion.findByPk(log.entityId));
    }
    const discussion = caches.discussions.get(log.entityId);
    if (discussion?.misconductRecordId) {
      if (!caches.records.has(discussion.misconductRecordId)) {
        caches.records.set(discussion.misconductRecordId, await MisconductRecord.findByPk(discussion.misconductRecordId));
      }
      const record = caches.records.get(discussion.misconductRecordId);
      if (record?.classId) return classNameFor(record.classId, caches);
    }
  }

  // Fallback (deliberations, or anything else): the student's current
  // class. Best-effort — a student who's since moved classes will show
  // their class as of now, not as of the deliberation.
  if (log.studentId) {
    if (!caches.students.has(log.studentId)) {
      caches.students.set(log.studentId, await Student.findByPk(log.studentId));
    }
    const student = caches.students.get(log.studentId);
    if (student?.classId) return classNameFor(student.classId, caches);
  }

  return null;
}

async function classNameFor(classId, caches) {
  if (!caches.classes.has(classId)) {
    caches.classes.set(classId, await Class.findByPk(classId));
  }
  return caches.classes.get(classId)?.name || null;
}

async function backfill() {
  try {
    await sequelize.authenticate();
    console.log("Connected to the shared database.");

    const parseActions = [
      "report_created",
      "record_created",
      "class_record_created",
      "class_report_created",
      "report_approved",
    ];

    const parseRows = await ActivityLog.findAll({ where: { action: parseActions } });
    console.log(`Pass 1 (parse): found ${parseRows.length} candidate row(s).`);

    let parsed = 0;
    let parseSkipped = 0;

    for (const row of parseRows) {
      const result = parseRow(row);
      if (!result) {
        parseSkipped += 1;
        continue;
      }
      await row.update(result);
      parsed += 1;
    }

    console.log(`Pass 1 done. Rewrote ${parsed} row(s); ${parseSkipped} already in the new format or unrecognized.`);

    const deriveRows = await ActivityLog.findAll({ where: { action: DERIVE_ACTIONS } });
    console.log(`Pass 2 (derive): found ${deriveRows.length} candidate row(s).`);

    const caches = { records: new Map(), discussions: new Map(), students: new Map(), classes: new Map() };
    let derived = 0;
    let deriveSkipped = 0;

    for (const row of deriveRows) {
      if (row.metadata?.className) {
        deriveSkipped += 1;
        continue;
      }
      const className = await deriveClassName(row, caches);
      if (!className) {
        deriveSkipped += 1;
        continue;
      }
      await row.update({ metadata: { ...(row.metadata || {}), className } });
      derived += 1;
    }

    console.log(`Pass 2 done. Added a class name to ${derived} row(s); ${deriveSkipped} skipped (already set, or no class could be found).`);

    process.exit(0);
  } catch (err) {
    console.error("Backfill failed:", err);
    process.exit(1);
  }
}

backfill();
