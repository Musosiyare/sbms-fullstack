const router = require("express").Router();
const { authenticate, scopeToSchool } = require("../middleware/auth");
const ctrl = require("../controllers/referenceController");

router.use(authenticate, scopeToSchool);

router.get("/academic-years", ctrl.academicYears);
router.get("/terms", ctrl.terms);
router.get("/classes", ctrl.classes);
router.get("/students", ctrl.students);
router.get("/discipline-staff", ctrl.disciplineStaff);

module.exports = router;
