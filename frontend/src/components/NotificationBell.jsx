import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, Gavel } from "lucide-react";
import { listRecords, getAcademicYears, getTerms, getExceededStudents } from "../api/sbms";
import { capitalizeFirst } from "../utils/text";

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

const DISCIPLINE_ROLE_LABEL = { dean_of_discipline: "Dean of Discipline", disciplinary_officer: "Disciplinary Officer" };
const ROLE_LABEL = { manager: "Manager", teacher: "Teacher", superuser: "Superuser", discipline: "Discipline Staff" };

function roleLabel(u) {
  if (!u) return null;
  return DISCIPLINE_ROLE_LABEL[u.disciplineRole] || ROLE_LABEL[u.role] || null;
}

/**
 * Bell icon in the header for Dean of Discipline / Disciplinary Officer /
 * manager — always visible (unlike a dashboard-only banner), so a pending
 * report or a student awaiting deliberation never gets missed just
 * because someone isn't on the Dashboard page. Refetches whenever the
 * route changes, so approving/rejecting on Records, or deciding on a
 * student on Dashboard, and coming back updates the counts.
 */
export default function NotificationBell() {
  const [pending, setPending] = useState(null);
  const [awaitingDeliberation, setAwaitingDeliberation] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => {
    listRecords({ status: "pending" })
      .then(setPending)
      .catch(() => setPending([]));

    // Deliberation is scoped to a term, so resolve the current academic
    // year and whichever term is currently open first — same defaults
    // useScopePicker applies everywhere else — then pull the
    // exceeded-marks list and keep only students nobody's ruled on yet.
    getAcademicYears()
      .then((years) => {
        const current = years.find((y) => y.isCurrent) || years[0];
        if (!current) {
          setAwaitingDeliberation([]);
          return;
        }
        getTerms(current.id).then((terms) => {
          const openTerm = terms.find((t) => !t.isLocked) || terms[0];
          if (!openTerm) {
            setAwaitingDeliberation([]);
            return;
          }
          getExceededStudents({ termId: openTerm.id, academicYearId: current.id })
            .then((students) => setAwaitingDeliberation(students.filter((s) => !s.deliberation)))
            .catch(() => setAwaitingDeliberation([]));
        });
      })
      .catch(() => setAwaitingDeliberation([]));
  }, [location.pathname]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const reportCount = pending?.length || 0;
  const deliberationCount = awaitingDeliberation?.length || 0;
  const count = reportCount + deliberationCount;
  const preview = (pending || []).slice(0, 5);
  const deliberationPreview = (awaitingDeliberation || []).slice(0, 5);

  return (
    <div className="relative ml-auto" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={19} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden z-40">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">
              {count === 0 ? "No notifications" : `${count} notification${count === 1 ? "" : "s"}`}
            </p>
          </div>
          {count === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">You're all caught up.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {reportCount > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {reportCount} report{reportCount === 1 ? "" : "s"} waiting on review
                  </p>
                  <ul className="divide-y divide-slate-100">
                    {preview.map((r) => (
                      <li key={r.id} className="px-4 py-2.5 text-sm">
                        <p className="font-medium text-slate-800">
                          {r.Student?.firstName} {r.Student?.lastName}
                          {r.Class?.name && <span className="ml-1.5 font-normal text-slate-400">· {r.Class.name}</span>}
                        </p>
                        <p className="text-slate-500">
                          {capitalizeFirst(r.MisconductType?.title) || r.customTitle || "Untitled incident"}
                        </p>
                        <div className="mt-0.5 text-xs text-slate-400">
                          <div className="flex items-center justify-between">
                            <span>
                              Reported by <span className="text-slate-500 font-medium">{r.reportedBy?.name || "Unknown"}</span>
                            </span>
                            <span>{fmtDate(r.createdAt)}</span>
                          </div>
                          {roleLabel(r.reportedBy) && <p>{roleLabel(r.reportedBy)}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/records"
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2.5 text-center text-sm font-semibold text-brand-600 hover:bg-brand-50 border-t border-slate-100"
                  >
                    Review all in Records
                  </Link>
                </div>
              )}

              {deliberationCount > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                    <Gavel size={12} className="text-violet-500" />
                    {deliberationCount} student{deliberationCount === 1 ? "" : "s"} awaiting deliberation
                  </p>
                  <ul className="divide-y divide-slate-100">
                    {deliberationPreview.map((s) => (
                      <li key={s.studentId} className="px-4 py-2.5 text-sm">
                        <p className="font-medium text-slate-800">
                          {s.firstName} {s.lastName}
                          {s.className && <span className="ml-1.5 font-normal text-slate-400">· {s.className}</span>}
                        </p>
                        <p className="text-slate-500">Exceeded conduct marks for the term — decision needed.</p>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/dashboard"
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2.5 text-center text-sm font-semibold text-brand-600 hover:bg-brand-50 border-t border-slate-100"
                  >
                    Review on Dashboard
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
