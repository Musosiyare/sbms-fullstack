const { AcademicYear, Term, Class, Student, User, TeacherModuleAssignment, Deliberation, sequelize } = require("../models");
const { Op } = require("sequelize");
const ApiError = require("../utils/ApiError");
const conductScoreService = require("../services/conductScoreService");
const { findActiveSendHome } = require("../services/sendHomeService");

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

/**
 * A student who's been dismissed permanently (any term, ever) or
 * dismissed for a specific term should never show up as pickable for
 * recording a NEW incident against them — see deliberationController.
 * Only excludes when termId is actually passed in, so callers that want
 * the full roster regardless of dismissal (e.g. Records' "browse this
 * class's history" view, which intentionally still shows a dismissed
 * student so their past records stay reachable) can simply omit it.
 */
async function excludeDismissed(studentList, termId) {
  if (!termId || studentList.length === 0) return studentList;
  const ids = studentList.map((s) => s.id);
  const deliberations = await Deliberation.findAll({
    where: {
      studentId: ids,
      [Op.or]: [{ decision: "dismissed_permanently" }, { decision: "dismissed_term", termId }],
    },
    attributes: ["studentId"],
  });
  const excluded = new Set(deliberations.map((d) => d.studentId));
  return studentList.filter((s) => !excluded.has(s.id));
}

/**
 * Tags each student with whether they're currently serving an active
 * send-home ("weekend") period. Used by callers that let someone pick
 * students for a NEW incident/report — a student already on send-home
 * can't be reported again until it ends (see assertNoActiveSendHome /
 * bulkClassReport's auto-skip in misconductRecordController), so the
 * picker can grey them out and say why up front instead of the person
 * only finding out after submitting.
 */
async function withSendHomeStatus(studentList) {
  const checks = await Promise.all(studentList.map((s) => findActiveSendHome(s.id)));
  return studentList.map((s, i) => {
    const active = checks[i];
    const plain = s.toJSON ? s.toJSON() : s;
    return {
      ...plain,
      onActiveSendHome: !!active,
      sendHomeUntil: active ? active.sentHomeTo : null,
    };
  });
}

async function students(req, res, next) {
  try {
    const { classId, termId } = req.query;
    if (!classId) return next(ApiError.badRequest("classId is required"));
    const klass = await Class.findByPk(classId);
    if (!klass || klass.schoolId !== req.schoolId) return next(ApiError.notFound("Class not found"));
    const list = await Student.findAll({
      where: { classId, status: "active" },
      order: [["firstName", "ASC"]],
    });
    res.json(await withSendHomeStatus(await excludeDismissed(list, termId)));
  } catch (err) {
    next(err);
  }
}

/**
 * Powers the header's live student search. Matches on first name, last
 * name, admission number, or "first last" together, scoped to the school.
 * A plain teacher (sbmsRole 'reporter') only searches within classes they
 * actually teach this academic year — same restriction as classes()/
 * students() above, so search can never surface a student they wouldn't
 * otherwise be able to look up.
 *
 * Each result carries its class name plus, when there's a current academic
 * year, that student's year-to-date conduct score — enough for the search
 * dropdown to show "class + marks" at a glance before anyone clicks
 * through to the full report. Deliberately capped at a handful of results;
 * this is a quick-jump box, not a records browser.
 */
async function searchStudents(req, res, next) {
  try {
    if (!req.schoolId) return next(ApiError.badRequest("schoolId is required", "schoolId"));
    const q = (req.query.q || "").trim();
    if (q.length < 2) return res.json({ results: [], academicYearId: null });

    const currentYear = await AcademicYear.findOne({ where: { schoolId: req.schoolId, isCurrent: true } });

    const classWhere = { schoolId: req.schoolId };
    if (currentYear) classWhere.academicYearId = currentYear.id;

    let allowedClassIds = null;
    if (req.user.sbmsRole === "reporter" && currentYear) {
      const assignments = await TeacherModuleAssignment.findAll({
        where: { teacherId: req.user.id, academicYearId: currentYear.id },
        attributes: ["classId"],
      });
      allowedClassIds = [...new Set(assignments.map((a) => a.classId))];
      if (allowedClassIds.length === 0) return res.json({ results: [], academicYearId: currentYear?.id || null });
    }

    const studentWhere = {
      schoolId: req.schoolId,
      status: "active",
      [Op.or]: [
        { firstName: { [Op.like]: `%${q}%` } },
        { lastName: { [Op.like]: `%${q}%` } },
        { admissionNumber: { [Op.like]: `%${q}%` } },
        sequelize.where(
          sequelize.fn("concat", sequelize.col("first_name"), " ", sequelize.col("last_name")),
          { [Op.like]: `%${q}%` }
        ),
      ],
    };
    if (allowedClassIds) studentWhere.classId = allowedClassIds;

    const students = await Student.findAll({
      where: studentWhere,
      order: [["firstName", "ASC"]],
      limit: 8,
    });
    if (students.length === 0) return res.json({ results: [], academicYearId: currentYear?.id || null });

    const classIds = [...new Set(students.map((s) => s.classId))];
    const classes = await Class.findAll({ where: { id: classIds, ...classWhere } });
    const classById = Object.fromEntries(classes.map((c) => [c.id, c]));

    // The yearly conduct report the search dropdown opens combines every
    // term for the current year — same restriction as the Yearly Report
    // page, so a search result can't be used to sidestep it. Names only
    // (not the full Term rows) since that's all the client needs for the
    // blocking message.
    let lockedTerms = [];
    if (currentYear) {
      const yearTerms = await Term.findAll({ where: { academicYearId: currentYear.id } });
      lockedTerms = yearTerms.filter((t) => t.isLocked).map((t) => t.name);
    }

    const results = await Promise.all(
      students.map(async (s) => {
        const klass = classById[s.classId] || null;
        // If the student's class isn't in the current academic year (e.g.
        // they were promoted/moved and classWhere filtered it out), we
        // still show the student — just without a resolvable class/score.
        let conduct = null;
        if (klass && currentYear) {
          const year = await conductScoreService.getYearScore(s.id, currentYear.id);
          const yearDeliberations = await Deliberation.findAll({
            where: { studentId: s.id, academicYearId: currentYear.id },
          });
          const SEVERITY = { dismissed_permanently: 3, dismissed_term: 2, stained: 1 };
          // A human decision (any severity) governs over a system one —
          // see applySystemYearlyDismissals in deliberationController for
          // why the system never creates a competing row once a human has
          // already decided the student, but older data or a same-term
          // coincidence could still have both, so this stays defensive.
          const humanDeliberations = yearDeliberations.filter((d) => d.decidedByRole !== "system");
          const pool = humanDeliberations.length > 0 ? humanDeliberations : yearDeliberations;
          const worst = pool.reduce(
            (best, d) => (!best || SEVERITY[d.decision] > SEVERITY[best.decision] ? d : best),
            null
          );
          conduct = {
            remaining: year.remaining,
            maxMarks: year.maxMarks,
            atRisk: year.remaining < year.maxMarks / 2,
            deliberation: worst ? { decision: worst.decision, decidedAt: worst.decidedAt } : null,
          };
        }
        return {
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          admissionNumber: s.admissionNumber,
          class: klass ? { id: klass.id, name: klass.name } : null,
          conduct,
        };
      })
    );

    res.json({ results, academicYearId: currentYear?.id || null, lockedTerms });
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

module.exports = { academicYears, terms, classes, students, searchStudents, disciplineStaff };
