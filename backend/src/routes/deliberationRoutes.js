const router = require("express").Router();
const { authenticate, scopeToSchool } = require("../middleware/auth");
const ctrl = require("../controllers/deliberationController");

router.use(authenticate, scopeToSchool);

router.get("/exceeded", ctrl.exceededStudents);
router.get("/student/:studentId", ctrl.studentDeliberations);
router.post("/", ctrl.decide);
router.delete("/:id", ctrl.undecide);

module.exports = router;
