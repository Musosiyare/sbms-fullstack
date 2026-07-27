const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");
const { User, School } = require("../models");
const { resolveSbmsRole } = require("../utils/resolveSbmsRole");

/**
 * Verifies the SBMS-specific JWT (signed with SBMS_JWT_SECRET, separate
 * from the main system's token) and attaches req.user.
 *
 * The token payload's sbmsRole was resolved once at login time (see
 * authController.login), but this re-resolves it fresh from the database
 * on every request (via the same resolveSbmsRole used at login) instead
 * of trusting that stale copy — otherwise, revoking someone's discipline
 * role in the main system's Disciplinary Staff page wouldn't take effect
 * in an already-open SBMS session until the JWT itself expired (up to
 * SBMS_JWT_EXPIRES_IN later). If they no longer resolve to any role at
 * all — e.g. a 'discipline'-only account whose disciplineRole was
 * cleared — the request is rejected outright with NO_SBMS_ROLE, the same
 * way an expired token would be.
 *
 * This also re-checks status and tokenVersion against the database on
 * every request — same rigor as the main system. Without it, deactivating
 * someone or changing their password (which bumps tokenVersion — see
 * authController.changePassword) wouldn't actually end an already-open
 * SBMS session; it'd just silently keep working until the JWT's own
 * expiry, whenever that is. The school's own status gets the same
 * treatment: if a school is deactivated in the main system mid-session,
 * every account at that school loses SBMS access immediately rather than
 * keeping a stale session alive until the token expires.
 *
 * The account-level rejections below (ACCOUNT_SUSPENDED, SCHOOL_DEACTIVATED,
 * NO_SBMS_ROLE) use their own error codes instead of the generic
 * "FORBIDDEN" that authorize() below uses — the frontend's response
 * interceptor watches specifically for these codes to force-clear the
 * session and redirect to login with an explanation, the same way it
 * already does for an expired/invalid token. An ordinary permission
 * error (wrong role for an action) should never log someone out, so it
 * deliberately keeps the generic code.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(ApiError.unauthorized("Missing authentication token"));

  try {
    const payload = jwt.verify(token, process.env.SBMS_JWT_SECRET);

    const user = await User.findByPk(payload.id, {
      attributes: ["id", "tokenVersion", "status", "schoolId", "role", "disciplineRole"],
    });
    if (!user) {
      return next(ApiError.unauthorized("Session has ended. Please log in again."));
    }
    if (user.status !== "active") {
      return next(
        ApiError.forbidden(
          "Your account has been suspended. Contact your school administrator to have it reactivated.",
          "ACCOUNT_SUSPENDED"
        )
      );
    }
    if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion) {
      return next(ApiError.unauthorized("Session has ended. Please log in again."));
    }
    if (user.schoolId) {
      const school = await School.findByPk(user.schoolId, { attributes: ["id", "status"] });
      if (!school || school.status !== "active") {
        return next(
          ApiError.forbidden(
            "Your school's account has been deactivated in the main system, so SBMS access is suspended for everyone at your school until it's reactivated there.",
            "SCHOOL_DEACTIVATED"
          )
        );
      }
    }

    const sbmsRole = resolveSbmsRole(user);
    if (!sbmsRole) {
      return next(
        ApiError.forbidden(
          "This account no longer has a discipline role assigned in SBMS. Contact your school administrator to have a role assigned.",
          "NO_SBMS_ROLE"
        )
      );
    }

    req.user = { ...payload, sbmsRole }; // { id, name, email, schoolId, sbmsRole, tokenVersion }, sbmsRole always freshly resolved
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
