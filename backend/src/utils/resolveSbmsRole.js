/**
 * Resolves a user's *effective SBMS role* from the two shared `users`
 * fields SBMS is allowed to read: `role` and `disciplineRole`. Shared by
 * authController.login (issuing a fresh token) and middleware/auth's
 * authenticate (re-checking an existing one on every request), so the
 * two can never drift into disagreeing about who's allowed to do what.
 *
 *   - role === 'manager'      -> 'manager'
 *   - disciplineRole is set   -> that value ('dean_of_discipline' or
 *     'disciplinary_officer'), whether the underlying `role` is
 *     'teacher' (someone who also teaches) or 'discipline' (an account
 *     that exists purely for SBMS) — disciplineRole always wins.
 *   - role === 'teacher', no disciplineRole -> 'reporter' (can submit a
 *     pending report for a class they actually teach)
 *   - anything else (a 'discipline'-only account whose disciplineRole
 *     has since been cleared, or 'superuser') -> null, meaning "no SBMS
 *     access at all right now"
 *
 * That last case is the one that used to be handled wrong: a
 * 'discipline'-only account with no disciplineRole was silently folded
 * into the same 'reporter' bucket as a plain teacher. But a
 * discipline-only account was never a teacher — it has no class
 * assignment, no legitimate reason to submit a report, and once its
 * discipline role is removed it has no function in SBMS left at all. It
 * should lose access entirely, not fall back to looking like a teacher.
 * A real 'teacher' account with no disciplineRole is the only case that
 * still resolves to 'reporter'.
 *
 * Callers are responsible for rejecting 'superuser' explicitly before
 * calling this (see authController.login) — it's not just "no role
 * assigned", it's an account type that never belongs in SBMS.
 */
function resolveSbmsRole(user) {
  if (user.role === "manager") return "manager";
  if (user.disciplineRole) return user.disciplineRole;
  if (user.role === "teacher") return "reporter";
  return null;
}

module.exports = { resolveSbmsRole };
