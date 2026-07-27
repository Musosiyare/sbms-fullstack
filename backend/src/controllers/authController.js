const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User, School } = require("../models");
const ApiError = require("../utils/ApiError");
const { resolveSbmsRole } = require("../utils/resolveSbmsRole");

/**
 * Logs a person into SBMS using the SAME email/password as the main
 * school-system (both read the shared `users` table) — but issues its own
 * token, signed with SBMS_JWT_SECRET, carrying an SBMS-specific
 * "effective role" resolved by resolveSbmsRole (see that file for the
 * full breakdown of role/disciplineRole -> sbmsRole).
 *
 * SBMS has no superuser role at all. A main-system 'superuser' account is
 * rejected at login below — it has no place in this system, cross-school
 * or otherwise.
 *
 * A 'discipline'-only account whose disciplineRole has been cleared
 * resolves to no role at all (resolveSbmsRole returns null) and is
 * rejected here too, with its own message — it's not quietly treated as
 * a 'reporter'/teacher anymore (see resolveSbmsRole for why that was
 * wrong).
 *
 * Once credentials check out, account-level gates are checked before a
 * token is issued, each with its own message so a person can tell what
 * actually went wrong instead of getting a generic "invalid password":
 *   - users.status === 'suspended'   -> their own account was suspended
 *   - schools.status === 'suspended' -> the whole school was deactivated
 *     in the main system. SBMS never manages this itself (or `status` on
 *     `users`) — it only reads it, so the message points back there.
 *   - resolveSbmsRole(user) === null -> no role left to log in with
 * These checks happen only *after* the password has already been
 * verified, so a wrong guess never reveals anything about a real
 * account's status or role.
 *
 * Neither `role` nor `disciplineRole` is ever written from SBMS — both are
 * read-only here.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return next(ApiError.badRequest("Email and password are required"));

    const user = await User.findOne({ where: { email } });
    if (!user) return next(ApiError.unauthorized("Invalid email or password"));

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return next(ApiError.unauthorized("Invalid email or password"));

    if (user.role === "superuser") {
      return next(ApiError.forbidden("This account does not have access to this system"));
    }

    if (user.status !== "active") {
      return next(
        ApiError.forbidden(
          "Your account has been suspended. Contact your school administrator to have it reactivated.",
          "ACCOUNT_SUSPENDED"
        )
      );
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
          "This account has no discipline role assigned in SBMS, so it can't log in here. Contact your school administrator to have a role assigned.",
          "NO_SBMS_ROLE"
        )
      );
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      schoolId: user.schoolId,
      sbmsRole,
      tokenVersion: user.tokenVersion,
    };

    const token = jwt.sign(payload, process.env.SBMS_JWT_SECRET, {
      expiresIn: process.env.SBMS_JWT_EXPIRES_IN || "30d",
    });

    // mustChangePassword rides along in the response (not the token) so the
    // frontend can route straight to the forced change-password screen —
    // same pattern as the main system.
    res.json({ token, user: { ...payload, mustChangePassword: user.mustChangePassword } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/change-password — a person changes their own password,
 * whether forced (first login, mustChangePassword) or voluntary (from
 * their Profile page). Writes to the shared `users` table — see the
 * comment on models/reference/User.js for why this specific write is a
 * sanctioned exception to SBMS otherwise being read-only against it.
 * Mirrors the main system's own change-password endpoint field-for-field,
 * so a person's account stays consistent no matter which app they used to
 * change it.
 */
async function changePassword(req, res, next) {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return next(ApiError.badRequest("New password must be at least 8 characters", "newPassword"));
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return next(ApiError.notFound("User not found"));

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    // The recoverable temp password on file (set by whoever created this
    // account) is no longer valid the moment they set their own — clear it,
    // same as the main system does.
    user.tempPasswordEncrypted = null;
    user.tempPasswordSetAt = null;
    user.tempPasswordSetBy = null;
    user.passwordChangedAt = new Date();
    // Invalidate any other session already issued to this account — in
    // either app, since both read the same tokenVersion.
    user.tokenVersion += 1;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, changePassword };
