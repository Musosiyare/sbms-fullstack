const router = require("express").Router();
const { authenticate, scopeToSchool } = require("../middleware/auth");
const ctrl = require("../controllers/reportController");

router.use(authenticate, scopeToSchool);

router.get("/class", ctrl.classReport);
router.get("/class/:classId/conduct", ctrl.classConductReport);
router.get("/student/:studentId", ctrl.studentReport);
router.get("/student/:studentId/conduct", ctrl.studentConductReport);
router.get("/student/:studentId/yearly-conduct", ctrl.studentYearlyConductReport);
router.get("/class/:classId/yearly-conduct", ctrl.classYearlyConductReport);
router.get("/dismissed-students", ctrl.dismissedStudentsReport);
router.get("/record/:recordId/weekend-permission", ctrl.weekendPermission);

module.exports = router;
