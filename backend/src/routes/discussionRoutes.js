const router = require("express").Router();
const { authenticate, scopeToSchool } = require("../middleware/auth");
const ctrl = require("../controllers/discussionController");

router.use(authenticate, scopeToSchool);

router.post("/", ctrl.open); // Dean of Discipline: start a discussion on a record
router.get("/", ctrl.list); // ?misconductRecordId=X for one thread, ?status=open for the overview list
router.get("/:id", ctrl.getOne);
router.post("/:id/messages", ctrl.addMessage);
router.patch("/:id/close", ctrl.close); // Dean of Discipline
router.patch("/:id/reopen", ctrl.reopen); // Dean of Discipline

module.exports = router;
