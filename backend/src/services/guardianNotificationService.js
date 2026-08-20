const mtnSmsService = require("./mtnSmsService");

/**
 * Fires an SMS to a student's guardian whenever a MisconductRecord becomes
 * 'finalized' (marks actually deducted) — called from the three places a
 * record can be finalized: createRecord, approveOneRecord (single approve
 * + bulkApprove), and bulkClassRecord.
 *
 * Deliberately swallows every error itself and never throws — a guardian
 * SMS failing (bad number, MTN outage, missing config) must never break
 * or roll back the underlying disciplinary record. Every attempt (sent,
 * failed, or skipped for no phone) is written to SmsLog so staff can see
 * what happened from the Records page rather than it failing silently.
 *
 * `record` must already have its final marksDeducted/status; `student`
 * needs at least id, firstName, lastName, guardianPhone.
 */
async function notifyGuardianOfDeduction(record, student, { typeTitle } = {}) {
  const { SmsLog } = require("../models"); // required lazily to avoid circular require at module load

  const incidentLabel = typeTitle || record.customTitle || "a conduct incident";
  const message =
    `SBMS: ${student.firstName} ${student.lastName} lost ${record.marksDeducted} conduct mark(s) ` +
    `for "${incidentLabel}". Contact the school for details.`;

  if (!student.guardianPhone) {
    await SmsLog.create({
      schoolId: record.schoolId,
      studentId: student.id,
      misconductRecordId: record.id,
      phone: "",
      message,
      status: "skipped_no_phone",
    });
    return;
  }

  try {
    const result = await mtnSmsService.sendSms(student.guardianPhone, message);
    if (result.skipped) {
      await SmsLog.create({
        schoolId: record.schoolId,
        studentId: student.id,
        misconductRecordId: record.id,
        phone: student.guardianPhone,
        message,
        status: "skipped_no_phone",
        providerResponse: result.reason,
      });
      return;
    }
    await SmsLog.create({
      schoolId: record.schoolId,
      studentId: student.id,
      misconductRecordId: record.id,
      phone: result.phone,
      message,
      status: result.ok ? "sent" : "failed",
      providerResponse: typeof result.response === "string" ? result.response.slice(0, 2000) : null,
    });
  } catch (err) {
    // Network error, MTN misconfiguration, etc. — still log, still never throw.
    await SmsLog.create({
      schoolId: record.schoolId,
      studentId: student.id,
      misconductRecordId: record.id,
      phone: student.guardianPhone,
      message,
      status: "failed",
      providerResponse: (err && err.message ? err.message : String(err)).slice(0, 2000),
    }).catch(() => {}); // if even the log write fails, give up quietly
  }
}

module.exports = { notifyGuardianOfDeduction };
