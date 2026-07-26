const conductScoreService = require("../services/conductScoreService");
const { Student, Class, School, AcademicYear, Term, MisconductRecord, MisconductType, User } = require("../models");
const ApiError = require("../utils/ApiError");

const DISCIPLINE_ROLE_LABEL = { dean_of_discipline: "Dean of Discipline", disciplinary_officer: "Disciplinary Officer" };
const ROLE_LABEL = { manager: "Manager", teacher: "Teacher", superuser: "Superuser", discipline: "Discipline Staff" };

/** Human-readable role for a user on a printed report — discipline role (Dean/Officer) takes priority when set. */
function roleLabel(u) {
  if (!u) return null;
  return DISCIPLINE_ROLE_LABEL[u.disciplineRole] || ROLE_LABEL[u.role] || null;
}

/** Every student in a class, with both their termly and yearly score. */
async function classReport(req, res, next) {
  try {
    const { classId, termId, academicYearId } = req.query;
    if (!classId || !termId || !academicYearId) {
      return next(ApiError.badRequest("classId, termId and academicYearId are required"));
    }
    const scores = await conductScoreService.getClassScores(classId, termId, academicYearId);
    res.json(scores);
  } catch (err) {
    next(err);
  }
}

/** One student's full picture: this term's score plus the year-to-date score. */
async function studentReport(req, res, next) {
  try {
    const { termId, academicYearId } = req.query;
    const student = await Student.findByPk(req.params.studentId);
    if (!student || student.schoolId !== req.schoolId) return next(ApiError.notFound("Student not found"));
    if (!termId || !academicYearId) {
      return next(ApiError.badRequest("termId and academicYearId are required"));
    }

    const term = await conductScoreService.getTermScore(student.id, termId);
    const year = await conductScoreService.getYearScore(student.id, academicYearId);
    res.json({
      student: { id: student.id, firstName: student.firstName, lastName: student.lastName },
      term,
      year,
    });
  } catch (err) {
    next(err);
  }
}

/** Score + incident list for one student, for a given term — shared by the single and bulk conduct-report endpoints. */
async function buildStudentConductData(student, termId, academicYearId) {
  const score = await conductScoreService.getTermScore(student.id, termId);
  // Termly status only — "good" or "at risk" against the 50% mark. The
  // actual promote/dismiss call is made at year end by combining all three
  // terms (see conductScoreService.getYearScore), not here.
  const status = score.atRisk ? "at_risk" : "good";

  const records = await MisconductRecord.findAll({
    where: { studentId: student.id, termId, academicYearId },
    include: [
      { model: MisconductType },
      { model: User, as: "reportedBy", attributes: ["id", "name", "role", "disciplineRole"] },
      { model: User, as: "finalizedBy", attributes: ["id", "name", "role", "disciplineRole"] },
    ],
    order: [["createdAt", "ASC"]],
  });

  return {
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
    },
    score,
    status,
    incidents: records.map((r) => ({
      id: r.id,
      date: r.finalizedAt || r.createdAt,
      title: r.MisconductType?.title || r.customTitle || "Untitled incident",
      severity: r.MisconductType?.severity || null,
      description: r.description,
      marksDeducted: r.marksDeducted,
      status: r.status,
      sentHomeFrom: r.sentHomeFrom,
      sentHomeTo: r.sentHomeTo,
      reportedBy: r.reportedBy?.name || null,
      reportedByRole: roleLabel(r.reportedBy),
      finalizedBy: r.finalizedBy?.name || null,
      finalizedByRole: roleLabel(r.finalizedBy),
    })),
  };
}

/**
 * Everything needed to print a single student's termly conduct report on
 * paper: school/class/term header info, every incident recorded against
 * them for that term (whatever its status, so the Dean of Discipline sees
 * the full picture — not just the ones that ended up counting), and the
 * term's remaining marks with a "good" / "at risk" status against the 50%
 * threshold. This is deliberately termly (matches the report's own title)
 * and deliberately NOT a promote/dismiss call — that's only made at year
 * end once all three terms are combined; the class report screen surfaces
 * the yearly figure separately for that.
 */
async function studentConductReport(req, res, next) {
  try {
    const { termId, academicYearId } = req.query;
    if (!termId || !academicYearId) {
      return next(ApiError.badRequest("termId and academicYearId are required"));
    }

    const student = await Student.findByPk(req.params.studentId);
    if (!student || student.schoolId !== req.schoolId) return next(ApiError.notFound("Student not found"));

    const [klass, school, academicYear, term] = await Promise.all([
      Class.findByPk(student.classId),
      School.findByPk(req.schoolId),
      AcademicYear.findByPk(academicYearId),
      Term.findByPk(termId),
    ]);
    if (!klass || klass.schoolId !== req.schoolId) return next(ApiError.notFound("Class not found"));
    if (!academicYear || academicYear.schoolId !== req.schoolId) return next(ApiError.notFound("Academic year not found"));
    if (!term || term.academicYearId !== Number(academicYearId)) return next(ApiError.notFound("Term not found"));

    // The Dean of Discipline signs the printed report — pull whoever
    // currently holds that role for this school as the footer contact.
    const dean = await User.findOne({
      where: { schoolId: req.schoolId, disciplineRole: "dean_of_discipline", status: "active" },
      attributes: ["id", "name", "email"],
      order: [["id", "ASC"]],
    });

    const conduct = await buildStudentConductData(student, termId, academicYearId);

    res.json({
      school: { id: school.id, name: school.name },
      class: { id: klass.id, name: klass.name },
      academicYear: { id: academicYear.id, name: academicYear.name },
      term: { id: term.id, name: term.name },
      ...conduct,
      deanOfDiscipline: dean ? { name: dean.name, email: dean.email } : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Same report as studentConductReport, but for every active student in a
 * class at once — powers the "Conduct report" and "Conduct marks" downloads
 * on the Class Report screen so the Dean of Discipline can generate the
 * whole class's termly reports in one pass instead of opening each student
 * individually. School/class/term/dean info is fetched once and shared;
 * only the per-student score + incident list differs.
 */
async function classConductReport(req, res, next) {
  try {
    const { termId, academicYearId } = req.query;
    const { classId } = req.params;
    if (!termId || !academicYearId) {
      return next(ApiError.badRequest("termId and academicYearId are required"));
    }

    const [klass, school, academicYear, term] = await Promise.all([
      Class.findByPk(classId),
      School.findByPk(req.schoolId),
      AcademicYear.findByPk(academicYearId),
      Term.findByPk(termId),
    ]);
    if (!klass || klass.schoolId !== req.schoolId) return next(ApiError.notFound("Class not found"));
    if (!academicYear || academicYear.schoolId !== req.schoolId) return next(ApiError.notFound("Academic year not found"));
    if (!term || term.academicYearId !== Number(academicYearId)) return next(ApiError.notFound("Term not found"));

    const dean = await User.findOne({
      where: { schoolId: req.schoolId, disciplineRole: "dean_of_discipline", status: "active" },
      attributes: ["id", "name", "email"],
      order: [["id", "ASC"]],
    });

    const students = await Student.findAll({ where: { classId, status: "active" }, order: [["firstName", "ASC"]] });
    const reports = await Promise.all(students.map((s) => buildStudentConductData(s, termId, academicYearId)));

    res.json({
      school: { id: school.id, name: school.name },
      class: { id: klass.id, name: klass.name },
      academicYear: { id: academicYear.id, name: academicYear.name },
      term: { id: term.id, name: term.name },
      deanOfDiscipline: dean ? { name: dean.name, email: dean.email } : null,
      generatedAt: new Date().toISOString(),
      students: reports,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Everything needed to print one student's yearly conduct report: header
 * info, every term's score, the combined yearly total, and the promotion/
 * dismissal decision. This is the year-end counterpart to
 * studentConductReport, which is deliberately termly-only.
 */
async function studentYearlyConductReport(req, res, next) {
  try {
    const { academicYearId } = req.query;
    if (!academicYearId) return next(ApiError.badRequest("academicYearId is required"));

    const student = await Student.findByPk(req.params.studentId);
    if (!student || student.schoolId !== req.schoolId) return next(ApiError.notFound("Student not found"));

    const [klass, school, academicYear] = await Promise.all([
      Class.findByPk(student.classId),
      School.findByPk(req.schoolId),
      AcademicYear.findByPk(academicYearId),
    ]);
    if (!klass || klass.schoolId !== req.schoolId) return next(ApiError.notFound("Class not found"));
    if (!academicYear || academicYear.schoolId !== req.schoolId) return next(ApiError.notFound("Academic year not found"));

    const dean = await User.findOne({
      where: { schoolId: req.schoolId, disciplineRole: "dean_of_discipline", status: "active" },
      attributes: ["id", "name", "email"],
      order: [["id", "ASC"]],
    });

    const { terms, year } = await conductScoreService.getYearlyReport(student.id, academicYearId);

    res.json({
      school: { id: school.id, name: school.name },
      class: { id: klass.id, name: klass.name },
      academicYear: { id: academicYear.id, name: academicYear.name },
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNumber: student.admissionNumber,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
      },
      terms,
      year,
      deanOfDiscipline: dean ? { name: dean.name, email: dean.email } : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Every active student in a class with their yearly score and promotion/
 * dismissal decision — the year-end counterpart to classConductReport.
 */
async function classYearlyConductReport(req, res, next) {
  try {
    const { academicYearId } = req.query;
    const { classId } = req.params;
    if (!academicYearId) return next(ApiError.badRequest("academicYearId is required"));

    const [klass, school, academicYear] = await Promise.all([
      Class.findByPk(classId),
      School.findByPk(req.schoolId),
      AcademicYear.findByPk(academicYearId),
    ]);
    if (!klass || klass.schoolId !== req.schoolId) return next(ApiError.notFound("Class not found"));
    if (!academicYear || academicYear.schoolId !== req.schoolId) return next(ApiError.notFound("Academic year not found"));

    const dean = await User.findOne({
      where: { schoolId: req.schoolId, disciplineRole: "dean_of_discipline", status: "active" },
      attributes: ["id", "name", "email"],
      order: [["id", "ASC"]],
    });

    const students = await conductScoreService.getClassYearlyReport(classId, academicYearId);

    res.json({
      school: { id: school.id, name: school.name },
      class: { id: klass.id, name: klass.name },
      academicYear: { id: academicYear.id, name: academicYear.name },
      deanOfDiscipline: dean ? { name: dean.name, email: dean.email } : null,
      generatedAt: new Date().toISOString(),
      students,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  classReport,
  studentReport,
  studentConductReport,
  classConductReport,
  studentYearlyConductReport,
  classYearlyConductReport,
};
