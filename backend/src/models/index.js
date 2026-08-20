const sequelize = require("../config/database");

// Read-only references into the shared school-system database.
const School = require("./reference/School");
const User = require("./reference/User");
const AcademicYear = require("./reference/AcademicYear");
const Term = require("./reference/Term");
const Class = require("./reference/Class");
const Student = require("./reference/Student");
const TeacherModuleAssignment = require("./reference/TeacherModuleAssignment");

// SBMS-owned tables.
const MisconductType = require("./MisconductType");
const MisconductRecord = require("./MisconductRecord");
const MisconductEvidence = require("./MisconductEvidence");
const Discussion = require("./Discussion");
const DiscussionMessage = require("./DiscussionMessage");
const Deliberation = require("./Deliberation");
const SmsLog = require("./SmsLog");
const ActivityLog = require("./ActivityLog");
const NotificationSeen = require("./NotificationSeen");
const NotificationRead = require("./NotificationRead");

// --- MisconductType -> School ---
School.hasMany(MisconductType, { foreignKey: "schoolId" });
MisconductType.belongsTo(School, { foreignKey: "schoolId" });

// --- MisconductRecord -> everything it references ---
School.hasMany(MisconductRecord, { foreignKey: "schoolId" });
MisconductRecord.belongsTo(School, { foreignKey: "schoolId" });

Student.hasMany(MisconductRecord, { foreignKey: "studentId" });
MisconductRecord.belongsTo(Student, { foreignKey: "studentId" });

Class.hasMany(MisconductRecord, { foreignKey: "classId" });
MisconductRecord.belongsTo(Class, { foreignKey: "classId" });

AcademicYear.hasMany(MisconductRecord, { foreignKey: "academicYearId" });
MisconductRecord.belongsTo(AcademicYear, { foreignKey: "academicYearId" });

Term.hasMany(MisconductRecord, { foreignKey: "termId" });
MisconductRecord.belongsTo(Term, { foreignKey: "termId" });

MisconductType.hasMany(MisconductRecord, { foreignKey: "misconductTypeId" });
MisconductRecord.belongsTo(MisconductType, { foreignKey: "misconductTypeId" });

MisconductRecord.belongsTo(User, { as: "reportedBy", foreignKey: "reportedByUserId" });
MisconductRecord.belongsTo(User, { as: "finalizedBy", foreignKey: "finalizedByUserId" });
MisconductRecord.belongsTo(User, { as: "rejectedBy", foreignKey: "rejectedByUserId" });

// --- MisconductEvidence -> MisconductRecord / User ---
MisconductRecord.hasMany(MisconductEvidence, { foreignKey: "misconductRecordId", as: "evidence" });
MisconductEvidence.belongsTo(MisconductRecord, { foreignKey: "misconductRecordId" });
MisconductEvidence.belongsTo(User, { as: "uploadedBy", foreignKey: "uploadedByUserId" });

// --- Discussion -> MisconductRecord, one thread per record ---
MisconductRecord.hasOne(Discussion, { foreignKey: "misconductRecordId" });
Discussion.belongsTo(MisconductRecord, { foreignKey: "misconductRecordId" });

Discussion.belongsTo(User, { as: "openedBy", foreignKey: "openedByUserId" });
Discussion.belongsTo(User, { as: "closedBy", foreignKey: "closedByUserId" });

// --- DiscussionMessage -> Discussion / User ---
Discussion.hasMany(DiscussionMessage, { foreignKey: "discussionId", as: "messages" });
DiscussionMessage.belongsTo(Discussion, { foreignKey: "discussionId" });
DiscussionMessage.belongsTo(User, { as: "author", foreignKey: "authorUserId" });

// --- Deliberation -> everything it references ---
School.hasMany(Deliberation, { foreignKey: "schoolId" });
Deliberation.belongsTo(School, { foreignKey: "schoolId" });

Student.hasMany(Deliberation, { foreignKey: "studentId" });
Deliberation.belongsTo(Student, { foreignKey: "studentId" });

Class.hasMany(Deliberation, { foreignKey: "classId" });
Deliberation.belongsTo(Class, { foreignKey: "classId" });

AcademicYear.hasMany(Deliberation, { foreignKey: "academicYearId" });
Deliberation.belongsTo(AcademicYear, { foreignKey: "academicYearId" });

Term.hasMany(Deliberation, { foreignKey: "termId" });
Deliberation.belongsTo(Term, { foreignKey: "termId" });

Deliberation.belongsTo(User, { as: "decidedBy", foreignKey: "decidedByUserId" });

// --- SmsLog -> everything it references ---
School.hasMany(SmsLog, { foreignKey: "schoolId" });
SmsLog.belongsTo(School, { foreignKey: "schoolId" });

Student.hasMany(SmsLog, { foreignKey: "studentId" });
SmsLog.belongsTo(Student, { foreignKey: "studentId" });

MisconductRecord.hasMany(SmsLog, { foreignKey: "misconductRecordId" });
SmsLog.belongsTo(MisconductRecord, { foreignKey: "misconductRecordId" });

// --- ActivityLog -> everything it references ---
School.hasMany(ActivityLog, { foreignKey: "schoolId" });
ActivityLog.belongsTo(School, { foreignKey: "schoolId" });

Student.hasMany(ActivityLog, { foreignKey: "studentId" });
ActivityLog.belongsTo(Student, { foreignKey: "studentId" });

ActivityLog.belongsTo(User, { as: "actor", foreignKey: "actorUserId" });
ActivityLog.belongsTo(User, { as: "relatedUser", foreignKey: "relatedUserId" });

// --- NotificationSeen -> School / User ---
School.hasMany(NotificationSeen, { foreignKey: "schoolId" });
NotificationSeen.belongsTo(School, { foreignKey: "schoolId" });

User.hasMany(NotificationSeen, { foreignKey: "userId" });
NotificationSeen.belongsTo(User, { foreignKey: "userId" });

// --- NotificationRead -> School / User ---
School.hasMany(NotificationRead, { foreignKey: "schoolId" });
NotificationRead.belongsTo(School, { foreignKey: "schoolId" });

User.hasMany(NotificationRead, { foreignKey: "userId" });
NotificationRead.belongsTo(User, { foreignKey: "userId" });

// --- TeacherModuleAssignment -> Class / User ---
Class.hasMany(TeacherModuleAssignment, { foreignKey: "classId" });
TeacherModuleAssignment.belongsTo(Class, { foreignKey: "classId" });

User.hasMany(TeacherModuleAssignment, { foreignKey: "teacherId" });
TeacherModuleAssignment.belongsTo(User, { foreignKey: "teacherId" });

module.exports = {
  sequelize,
  School,
  User,
  AcademicYear,
  Term,
  Class,
  Student,
  TeacherModuleAssignment,
  MisconductType,
  MisconductRecord,
  MisconductEvidence,
  Discussion,
  DiscussionMessage,
  Deliberation,
  SmsLog,
  ActivityLog,
  NotificationSeen,
  NotificationRead,
};
