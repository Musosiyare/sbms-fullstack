const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const ApiError = require("../utils/ApiError");

/**
 * Logs a person into SBMS using the SAME email/password as the main
 * school-system (both read the shared `users` table) — but issues its own
 * token, signed with SBMS_JWT_SECRET, carrying an SBMS-specific
 * "effective role":
 *
 *   - users.role === 'manager'         -> sbmsRole: 'manager'
 *     (can view reports/records for their school, cannot finalize)
 *   - users.disciplineRole is set      -> sbmsRole: that value
 *     ('dean_of_discipline' or 'disciplinary_officer') — assigned from the
 *     main system's Disciplinary Staff page, not from SBMS. True for both
 *     role: 'teacher' (someone who also teaches) and role: 'discipline'
 *     (an account that exists purely for SBMS).
 *   - otherwise (a plain teacher, or a discipline-only account whose role
 *     was cleared)                     -> sbmsRole: 'reporter'
 *     (can only submit a pending report — see MisconductRecord)
 *
 * SBMS has no superuser role at all. A main-system 'superuser' account is
 * rejected at login below — it has no place in this system, cross-school
 * or otherwise.
 *
 * Neither `role` nor `disciplineRole` is ever written from SBMS — both are
 * read-only here.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return next(ApiError.badRequest("Email and password are required"));

    const user = await User.findOne({ where: { email } });
    if (!user || user.status !== "active") {
      return next(ApiError.unauthorized("Invalid email or password"));
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return next(ApiError.unauthorized("Invalid email or password"));

    if (user.role === "superuser") {
      return next(ApiError.forbidden("This account does not have access to this system"));
    }

    const sbmsRole = user.role === "manager" ? "manager" : user.disciplineRole || "reporter";

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
