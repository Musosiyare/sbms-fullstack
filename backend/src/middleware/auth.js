const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");
const { User } = require("../models");

/**
 * Verifies the SBMS-specific JWT (signed with SBMS_JWT_SECRET, separate
 * from the main system's token) and attaches req.user.
 *
 * The token payload carries the person's *effective SBMS role*, resolved
 * once at login time (see authController.login): 'manager' passes straight
 * through from the shared users.role, while 'dean_of_discipline' /
 * 'disciplinary_officer' come from users.disciplineRole — a field assigned
 * in the *main* system's Disciplinary Staff page, not in SBMS. Anyone else
 * who can still log in (a plain teacher with no discipline role) gets
 * 'reporter' — enough to submit a pending report, nothing more. That
 * resolution logic lives in authController, not here.
 *
 * This also re-checks status and tokenVersion against the database on
 * every request — same rigor as the main system. Without it, deactivating
 * someone or changing their password (which bumps tokenVersion — see
 * authController.changePassword) wouldn't actually end an already-open
 * SBMS session; it'd just silently keep working until the JWT's own
 * expiry, whenever that is.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(ApiError.unauthorized("Missing authentication token"));

  try {
    const payload = jwt.verify(token, process.env.SBMS_JWT_SECRET);

    const user = await User.findByPk(payload.id, { attributes: ["id", "tokenVersion", "status"] });
    if (!user || user.status !== "active") {
      return next(ApiError.unauthorized("Session has ended. Please log in again."));
    }
    if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion) {
      return next(ApiError.unauthorized("Session has ended. Please log in again."));
    }

    req.user = payload; // { id, name, email, schoolId, sbmsRole, tokenVersion }
    next();
  } catch (err) {
    return next(ApiError.unauthorized("Invalid or expired token"));
  }
}

/** Restricts a route to one or more effective SBMS roles. */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowedRoles.includes(req.user.sbmsRole)) {
      return next(ApiError.forbidden("You do not have permission to perform this action"));
    }
    next();
  };
}

/**
 * Derives req.schoolId the same defensive way the main system does: never
 * trust a school_id sent from the client, always take it from the token.
 * SBMS has no cross-school role, so every account is scoped to the school
 * on its own token.
 */
function scopeToSchool(req, res, next) {
  if (!req.user.schoolId) return next(ApiError.forbidden("No school scope on this account"));
  req.schoolId = req.user.schoolId;
  next();
}

module.exports = { authenticate, authorize, scopeToSchool };
