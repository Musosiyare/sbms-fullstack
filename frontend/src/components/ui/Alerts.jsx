import { AlertCircle, CheckCircle2, Lock, LockOpen } from "lucide-react";

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
