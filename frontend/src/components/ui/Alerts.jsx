import { AlertCircle, CheckCircle2, Lock, LockOpen, CalendarClock } from "lucide-react";

export function ErrorText({ children }) {
  if (!children) return null;
  return (
    <p className="flex items-center gap-1.5 text-sm text-red-600">
      <AlertCircle size={15} className="shrink-0" /> {children}
    </p>
  );
}

export function SuccessText({ children }) {
  if (!children) return null;
  return (
    <p className="flex items-center gap-1.5 text-sm text-emerald-600">
      <CheckCircle2 size={15} className="shrink-0" /> {children}
    </p>
  );
}

/**
 * Small colored pill showing whether a given term (from the shared `terms`
 * reference table) is currently open or locked in the main mid-term
 * reporting system. Drop next to a Term field so the state is visible at
 * a glance, not just implied by a disabled dropdown option.
 */
export function TermLockBadge({ term }) {
  if (!term) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        term.isLocked ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
      }`}
    >
      {term.isLocked ? <Lock size={11} /> : <LockOpen size={11} />}
      {term.isLocked ? "Locked" : "Open"}
    </span>
  );
}

/**
 * Full-width banner for when nothing in a term picker can currently be
 * selected because every term for the academic year is locked — explains
 * why, instead of leaving someone staring at an all-disabled dropdown.
 */
export function AllTermsLockedNotice() {
  return (
    <p className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
      <Lock size={15} className="shrink-0" /> Every term is locked in the reporting system right now — nothing can be
      reported or recorded until one is reopened.
    </p>
  );
}

/**
 * Older academic years stay pickable in the Academic year/term pickers so
 * their existing history can still be browsed, but certain actions —
 * raising a new report/record, making a deliberation decision — only
 * ever apply to whichever year is currently marked current. Shown next
 * to the relevant picker when someone selects any other year, paired
 * with disabling whatever action it guards so it's not just a cosmetic
 * warning. `action` describes what's being blocked in a few words (e.g.
 * "reports and records can only be created", "deliberation decisions can
 * only be made"); defaults to the report/record wording since that's the
 * most common caller.
 */
export function NotCurrentYearNotice({ yearName, action = "reports and records can only be created" }) {
  return (
    <p className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
      <CalendarClock size={15} className="shrink-0" />
      {yearName ? `${yearName} isn't` : "This isn't"} the current academic year — {action} for the current year.
      Switch back to the current year to continue.
    </p>
  );
}
