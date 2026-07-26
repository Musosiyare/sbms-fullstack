const router = require("express").Router();
const { authenticate, scopeToSchool } = require("../middleware/auth");
const ctrl = require("../controllers/misconductRecordController");

router.use(authenticate, scopeToSchool);

router.post("/report", ctrl.createReport); // teacher/manager: raise a pending report
router.post("/", ctrl.createRecord); // DOD/disciplinary officer: record directly, finalized
router.post("/bulk-approve", ctrl.bulkApprove); // DOD/disciplinary officer: approve many pending reports at once
router.post("/bulk-reject", ctrl.bulkReject); // DOD/disciplinary officer: reject many pending reports at once, one shared reason
router.patch("/:id/approve", ctrl.approve); // DOD/disciplinary officer: approve a pending report, marks auto-deducted
router.patch("/:id/reject", ctrl.reject); // DOD/disciplinary officer: decline a pending report, reason required

router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);

module.exports = router;
