const router = require("express").Router();
const { authenticate, scopeToSchool } = require("../middleware/auth");
const { evidenceUpload } = require("../middleware/upload");
const ctrl = require("../controllers/misconductRecordController");

router.use(authenticate, scopeToSchool);

router.post("/report", evidenceUpload, ctrl.createReport); // teacher/manager: raise a pending report, with optional evidence
router.post("/", evidenceUpload, ctrl.createRecord); // DOD/disciplinary officer: record directly, finalized, with optional evidence
router.post("/class", ctrl.bulkClassRecord); // DOD/disciplinary officer: deduct the same marks from a whole class at once (non-weekend incidents only)
router.post("/class-report", ctrl.bulkClassReport); // teacher/manager: raise pending reports for a whole class at once (non-weekend incidents only)
router.post("/bulk-approve", ctrl.bulkApprove); // DOD/disciplinary officer: approve many pending reports at once
router.post("/bulk-reject", ctrl.bulkReject); // DOD/disciplinary officer: reject many pending reports at once, one shared reason
router.patch("/:id/approve", ctrl.approve); // DOD/disciplinary officer: approve a pending report, marks auto-deducted
router.patch("/:id/reject", ctrl.reject); // DOD/disciplinary officer: decline a pending report, reason required

router.post("/:id/evidence", evidenceUpload, ctrl.addEvidence); // attach more evidence to an existing record
router.get("/:id/evidence/:evidenceId", ctrl.downloadEvidence); // view/download one evidence file
router.delete("/:id/evidence/:evidenceId", ctrl.deleteEvidence); // remove evidence (blocked once approved/finalized)

router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);
router.patch("/:id", ctrl.updateReport); // whoever reported it: edit while not yet approved
router.delete("/:id", ctrl.deleteReport); // whoever reported it: withdraw while not yet approved

module.exports = router;
