const router = require("express").Router();
const { authenticate, authorize, scopeToSchool } = require("../middleware/auth");
const ctrl = require("../controllers/misconductTypeController");

router.use(authenticate);

router.get("/", scopeToSchool, ctrl.list);
router.post("/", scopeToSchool, authorize("dean_of_discipline"), ctrl.create);
router.patch("/:id", scopeToSchool, authorize("dean_of_discipline"), ctrl.update);
router.delete("/:id", scopeToSchool, authorize("dean_of_discipline"), ctrl.remove);

module.exports = router;
