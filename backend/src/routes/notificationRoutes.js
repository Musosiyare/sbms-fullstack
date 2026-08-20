const router = require("express").Router();
const { authenticate, scopeToSchool } = require("../middleware/auth");
const ctrl = require("../controllers/notificationController");

router.use(authenticate, scopeToSchool);

router.get("/seen", ctrl.getSeen);
router.post("/seen", ctrl.markSeen);

router.get("/read", ctrl.listRead);
router.post("/read", ctrl.markItemRead);
router.post("/unread", ctrl.markItemUnread);
router.post("/read-all", ctrl.markAllRead);

module.exports = router;
