const router = require("express").Router();
const { authenticate, scopeToSchool } = require("../middleware/auth");
const ctrl = require("../controllers/activityLogController");

router.use(authenticate, scopeToSchool);

router.get("/", ctrl.list); // role-scoped — see activityLogController.list

module.exports = router;
