import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell } from "lucide-react";
import { listRecords } from "../api/sbms";
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
 * report never gets missed just because someone isn't on the Dashboard
 * page. Refetches whenever the route changes, so approving/rejecting on
 * Records and coming back updates the count.
 */
export default function NotificationBell() {
  const [pending, setPending] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => {
    listRecords({ status: "pending" })
      .then(setPending)
      .catch(() => setPending([]));
  }, [location.pathname]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const count = pending?.length || 0;
  const preview = (pending || []).slice(0, 5);

  return (
    <div className="relative ml-auto" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        aria-label="Pending report notifications"
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
              {count === 0 ? "No pending reports" : `${count} report${count === 1 ? "" : "s"} waiting on review`}
            </p>
          </div>
          {count === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">You're all caught up.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {preview.map((r) => (
                <li key={r.id} className="px-4 py-2.5 text-sm">
                  <p className="font-medium text-slate-800">
                    {r.Student?.firstName} {r.Student?.lastName}
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
          )}
          <Link
            to="/records"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-center text-sm font-semibold text-brand-600 hover:bg-brand-50 border-t border-slate-100"
          >
            Review all in Records
          </Link>
        </div>
      )}
    </div>
  );
}
