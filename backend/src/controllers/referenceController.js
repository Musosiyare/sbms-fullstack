const { AcademicYear, Term, Class, Student, User, TeacherModuleAssignment } = require("../models");
const { Op } = require("sequelize");
const ApiError = require("../utils/ApiError");

/**
 * These four endpoints only ever SELECT from the shared reference tables —
 * see models/reference/*.js. They exist so the SBMS frontend can populate
 * pickers (which class, which term...) without SBMS needing to reach into
 * the main system's own API.
 */

async function academicYears(req, res, next) {
  try {
    // Defensive guard: every SBMS account is scoped to a school by
    // scopeToSchool, so req.schoolId should always be set here. If it's
    // ever missing, fail clearly instead of letting Sequelize crash on a
    // WHERE school_id = undefined query.
    if (!req.schoolId) return next(ApiError.badRequest("schoolId is required", "schoolId"));
    const years = await AcademicYear.findAll({ where: { schoolId: req.schoolId }, order: [["id", "DESC"]] });
    res.json(years);
  } catch (err) {
    next(err);
  }
}

async function terms(req, res, next) {
  try {
    const { academicYearId } = req.query;
    if (!academicYearId) return next(ApiError.badRequest("academicYearId is required"));
    const year = await AcademicYear.findByPk(academicYearId);
    if (!year || year.schoolId !== req.schoolId) return next(ApiError.notFound("Academic year not found"));
    const list = await Term.findAll({ where: { academicYearId }, order: [["name", "ASC"]] });
    res.json(list);
  } catch (err) {
    next(err);
  }
}

/**
 * Powers the Class picker. For a plain teacher (sbmsRole 'reporter') this
 * only returns classes they're actually assigned to teach that academic
 * year — matches the backend restriction on POST /report, so the form
 * never offers a class they'd get a 403 for picking. Managers and
 * discipline staff (who don't use this "class you teach" concept) still
 * see every class in the school.
 */
async function classes(req, res, next) {
  try {
    if (!req.schoolId) return next(ApiError.badRequest("schoolId is required", "schoolId"));
    const { academicYearId } = req.query;
    const where = { schoolId: req.schoolId, isSuspended: false };
    if (academicYearId) where.academicYearId = academicYearId;

    if (req.user.sbmsRole === "reporter") {
      if (!academicYearId) return next(ApiError.badRequest("academicYearId is required", "academicYearId"));
      const assignments = await TeacherModuleAssignment.findAll({
        where: { teacherId: req.user.id, academicYearId },
        attributes: ["classId"],
      });
      const classIds = [...new Set(assignments.map((a) => a.classId))];
      where.id = classIds;
    }

    const list = await Class.findAll({ where, order: [["name", "ASC"]] });
    res.json(list);
  } catch (err) {
    next(err);
  }
}

async function students(req, res, next) {
  try {
    const { classId } = req.query;
    if (!classId) return next(ApiError.badRequest("classId is required"));
    const klass = await Class.findByPk(classId);
    if (!klass || klass.schoolId !== req.schoolId) return next(ApiError.notFound("Class not found"));
    const list = await Student.findAll({
      where: { classId, status: "active" },
      order: [["firstName", "ASC"]],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
}

/**
 * Everyone in this school currently holding an SBMS role — powers the
 * read-only Staff Roles page. Assigning/changing a role happens in the
 * main system's Teachers page, not here; SBMS only displays the result.
 */
async function disciplineStaff(req, res, next) {
  try {
    if (!req.schoolId) return next(ApiError.badRequest("schoolId is required", "schoolId"));
    const list = await User.findAll({
      where: { schoolId: req.schoolId, status: "active", disciplineRole: { [Op.not]: null } },
      attributes: ["id", "name", "email", "disciplineRole"],
      order: [["disciplineRole", "ASC"], ["name", "ASC"]],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
}

module.exports = { academicYears, terms, classes, students, disciplineStaff };
