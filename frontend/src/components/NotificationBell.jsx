import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, Gavel, CheckCircle2, Circle } from "lucide-react";
import {
  listRecords,
  getAcademicYears,
  getTerms,
  getExceededStudents,
  getReadNotifications,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
} from "../api/sbms";
import { capitalizeFirst } from "../utils/text";
import { useAuth } from "../context/AuthContext";
import { DECISION_TONE, decisionLabel, exceededReasonLabel } from "../utils/deliberation";
import Badge from "./ui/Badge";

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

const DISCIPLINE_ROLE_LABEL = { dean_of_discipline: "Dean of Discipline", disciplinary_officer: "Disciplinary Officer" };
const ROLE_LABEL = { manager: "Manager", teacher: "Teacher", superuser: "Superuser", discipline: "Discipline Staff" };

function roleLabel(u) {
  if (!u) return null;
  return DISCIPLINE_ROLE_LABEL[u.disciplineRole] || ROLE_LABEL[u.role] || null;
}

// Resolves the current academic year + whichever term is currently open
// — same defaults useScopePicker applies everywhere else — and hands
// back the full exceeded-marks list for that term plus a "Term 2, 2025"
// style label (needed to say exactly which term a "dismissed for the
// term" decision applies to), or empty defaults if there's no current
// year/open term to resolve.
function loadExceededStudents() {
  return getAcademicYears().then((years) => {
    const current = years.find((y) => y.isCurrent) || years[0];
    if (!current) return { students: [], termLabel: null };
    return getTerms(current.id).then((terms) => {
      const openTerm = terms.find((t) => !t.isLocked) || terms[0];
      if (!openTerm) return { students: [], termLabel: null };
      return getExceededStudents({ termId: openTerm.id, academicYearId: current.id }).then((students) => ({
        students,
        termLabel: `${openTerm.name}, ${current.name}`,
      }));
    });
  });
}

/**
 * Bell icon in the header for Dean of Discipline / Disciplinary Officer /
 * manager — always visible (unlike a dashboard-only banner), so a pending
 * report or a student awaiting deliberation never gets missed just
 * because someone isn't on the Dashboard page. Refetches whenever the
 * route changes, so approving/rejecting on Records, or deciding on a
 * student on Dashboard, and coming back updates the counts.
 *
 * A teacher (reporter) gets a different bell entirely: they can't decide
 * or review anything, so instead of the review queue this shows every
 * student in the school a deliberation decision has already been made
 * for — not just ones the teacher personally reported — with the
 * decision and reason, so teachers stay in the loop on outcomes school-
 * wide.
 */
export default function NotificationBell() {
  const { user } = useAuth();
  if (user?.sbmsRole === "reporter") return <TeacherDeliberationBell />;
  return <DisciplineBell />;
}

const REPORTS_FEED = "discipline_reports";
const QUEUE_FEED = "discipline_queue";

/**
 * Dean of Discipline / Disciplinary Officer / manager bell — two queues:
 * reports waiting on review, and students awaiting a deliberation call.
 * Both are naturally self-clearing once acted on (approve/reject a
 * report, decide a student), but that's not the same as "I've seen
 * this" — someone might notice an item, plan to handle it later, and
 * not want it cluttering the bell in the meantime. So each item can
 * also be marked read independently (per user, backed by
 * sbms_notification_read via the same generic read/unread table the
 * teacher bell uses — see NotificationRead), which clears it from the
 * dropdown immediately, one at a time or all at once, without touching
 * the underlying report/deliberation itself. If it's undone/reopened
 * later it simply reappears unread, same as it would to a fresh viewer.
 */
function DisciplineBell() {
  const [pending, setPending] = useState(null);
  const [awaitingDeliberation, setAwaitingDeliberation] = useState(null);
  const [reportReadIds, setReportReadIds] = useState(undefined); // undefined = not loaded yet
  const [queueReadIds, setQueueReadIds] = useState(undefined);
  const [pendingToggleIds, setPendingToggleIds] = useState(() => new Set()); // feed-prefixed keys, e.g. "discipline_reports:5"
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => {
    listRecords({ status: "pending" })
      .then(setPending)
      .catch(() => setPending([]));

    loadExceededStudents()
      .then(({ students }) => setAwaitingDeliberation(students.filter((s) => !s.deliberation)))
      .catch(() => setAwaitingDeliberation([]));

    getReadNotifications(REPORTS_FEED)
      .then(({ itemIds }) => setReportReadIds(new Set(itemIds)))
      .catch(() => setReportReadIds(new Set()));
    getReadNotifications(QUEUE_FEED)
      .then(({ itemIds }) => setQueueReadIds(new Set(itemIds)))
      .catch(() => setQueueReadIds(new Set()));
  }, [location.pathname]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function isUnread(readIds, id) {
    if (!readIds) return true; // not loaded yet — don't flash everything as read for a moment
    return !readIds.has(id);
  }

  function setToggleBusy(feed, id, val) {
    const key = `${feed}:${id}`;
    setPendingToggleIds((prev) => {
      const next = new Set(prev);
      if (val) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleRead(feed, setReadIds, id, currentlyUnread) {
    const key = `${feed}:${id}`;
    if (pendingToggleIds.has(key)) return;
    setToggleBusy(feed, id, true);
    // Optimistic — these lists are short, so a toggle should feel instant.
    setReadIds((prev) => {
      const next = new Set(prev);
      if (currentlyUnread) next.add(id);
      else next.delete(id);
      return next;
    });
    const call = currentlyUnread ? markNotificationRead(feed, id) : markNotificationUnread(feed, id);
    call
      .catch(() => {
        setReadIds((prev) => {
          const next = new Set(prev);
          if (currentlyUnread) next.delete(id);
          else next.add(id);
          return next;
        });
      })
      .finally(() => setToggleBusy(feed, id, false));
  }

  function markAllRead(feed, setReadIds, allIds) {
    const unreadIds = allIds.filter((id) => isUnread(feed === REPORTS_FEED ? reportReadIds : queueReadIds, id));
    if (unreadIds.length === 0) return;
    setReadIds((prev) => new Set([...(prev || []), ...unreadIds]));
    markAllNotificationsRead(feed, unreadIds).catch(() => {
      // Best-effort — a failed bulk mark just leaves those items unread again next reload.
    });
  }

  const unreadReports = (pending || []).filter((r) => isUnread(reportReadIds, r.id));
  const unreadDeliberation = (awaitingDeliberation || []).filter((s) => isUnread(queueReadIds, s.studentId));
  const reportsLoaded = reportReadIds !== undefined;
  const queueLoaded = queueReadIds !== undefined;
  const reportCount = reportsLoaded ? unreadReports.length : pending?.length || 0;
  const deliberationCount = queueLoaded ? unreadDeliberation.length : awaitingDeliberation?.length || 0;
  const count = reportCount + deliberationCount;
  const preview = unreadReports.slice(0, 5);
  const deliberationPreview = unreadDeliberation.slice(0, 5);

  return (
    <div className="relative ml-auto" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-teal-100 hover:bg-white/10 hover:text-white transition-colors"
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
                  <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {reportCount} report{reportCount === 1 ? "" : "s"} waiting on review
                    </p>
                    <button
                      onClick={() => markAllRead(REPORTS_FEED, setReportReadIds, (pending || []).map((r) => r.id))}
                      className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700"
                    >
                      Mark all as read
                    </button>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {preview.map((r) => {
                      const unread = isUnread(reportReadIds, r.id);
                      const busy = pendingToggleIds.has(`${REPORTS_FEED}:${r.id}`);
                      return (
                        <li key={r.id} className="px-4 py-2.5 text-sm">
                          <div className="flex items-start gap-1.5">
                            <button
                              onClick={() => toggleRead(REPORTS_FEED, setReportReadIds, r.id, unread)}
                              disabled={busy}
                              title={unread ? "Mark as read" : "Mark as unread"}
                              aria-label={unread ? "Mark as read" : "Mark as unread"}
                              className={`mt-1 shrink-0 rounded-full disabled:opacity-50 transition-colors ${
                                unread ? "text-brand-400 hover:text-brand-600" : "text-emerald-500 hover:text-slate-300"
                              }`}
                            >
                              {unread ? <Circle size={16} /> : <CheckCircle2 size={16} className="fill-emerald-50" />}
                            </button>
                            <div className="min-w-0 flex-1">
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
                            </div>
                          </div>
                        </li>
                      );
                    })}
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
                  <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                      <Gavel size={12} className="text-violet-500" />
                      {deliberationCount} student{deliberationCount === 1 ? "" : "s"} awaiting deliberation
                    </p>
                    <button
                      onClick={() =>
                        markAllRead(QUEUE_FEED, setQueueReadIds, (awaitingDeliberation || []).map((s) => s.studentId))
                      }
                      className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700"
                    >
                      Mark all as read
                    </button>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {deliberationPreview.map((s) => {
                      const unread = isUnread(queueReadIds, s.studentId);
                      const busy = pendingToggleIds.has(`${QUEUE_FEED}:${s.studentId}`);
                      return (
                        <li key={s.studentId} className="px-4 py-2.5 text-sm">
                          <div className="flex items-start gap-1.5">
                            <button
                              onClick={() => toggleRead(QUEUE_FEED, setQueueReadIds, s.studentId, unread)}
                              disabled={busy}
                              title={unread ? "Mark as read" : "Mark as unread"}
                              aria-label={unread ? "Mark as read" : "Mark as unread"}
                              className={`mt-1 shrink-0 rounded-full disabled:opacity-50 transition-colors ${
                                unread ? "text-brand-400 hover:text-brand-600" : "text-emerald-500 hover:text-slate-300"
                              }`}
                            >
                              {unread ? <Circle size={16} /> : <CheckCircle2 size={16} className="fill-emerald-50" />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-slate-800">
                                {s.firstName} {s.lastName}
                                {s.className && <span className="ml-1.5 font-normal text-slate-400">· {s.className}</span>}
                              </p>
                              <p className="text-slate-500">{exceededReasonLabel(s)} — decision needed.</p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
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

const DELIBERATIONS_FEED = "deliberations";

/**
 * Teacher-facing bell — no review queue (teachers can't act on reports or
 * deliberations), so this shows every student in the school whose
 * deliberation has already been decided this term, with the decision and
 * reason, so a teacher finds out what happened without having to have
 * been the one who reported the student.
 *
 * Read/unread: per-decision, not just a bulk "opened the bell" cursor —
 * a teacher can mark any individual decision read or unread again, the
 * way an email inbox works (backed by sbms_notification_read, so it
 * survives across devices/sessions, not just localStorage on one
 * browser). The badge counts whatever's currently unread; opening the
 * dropdown does NOT auto-mark anything read anymore, since the whole
 * point is the teacher controls that explicitly per item (or in bulk via
 * "Mark all as read").
 */
function TeacherDeliberationBell() {
  const [deliberated, setDeliberated] = useState(null);
  const [termLabel, setTermLabel] = useState(null);
  const [readIds, setReadIds] = useState(undefined); // undefined = not loaded yet; Set of read deliberation ids once loaded
  const [pendingIds, setPendingIds] = useState(() => new Set()); // ids with an in-flight toggle, so the button can't be double-clicked mid-request
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => {
    loadExceededStudents()
      .then(({ students, termLabel }) => {
        const decided = students.filter((s) => s.deliberation);
        decided.sort((a, b) => new Date(b.deliberation.decidedAt) - new Date(a.deliberation.decidedAt));
        setDeliberated(decided);
        setTermLabel(termLabel);
      })
      .catch(() => setDeliberated([]));

    getReadNotifications(DELIBERATIONS_FEED)
      .then(({ itemIds }) => setReadIds(new Set(itemIds)))
      .catch(() => setReadIds(new Set()));
  }, [location.pathname]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function isUnread(deliberationId) {
    if (!readIds) return true; // not loaded yet — don't flash everything as read for a moment
    return !readIds.has(deliberationId);
  }

  function setPending(id, val) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (val) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleRead(deliberationId, currentlyUnread) {
    if (pendingIds.has(deliberationId)) return;
    setPending(deliberationId, true);
    // Optimistic update — the discipline office's decision list is small,
    // so a toggle should feel instant rather than waiting on the network.
    setReadIds((prev) => {
      const next = new Set(prev);
      if (currentlyUnread) next.add(deliberationId);
      else next.delete(deliberationId);
      return next;
    });
    const call = currentlyUnread
      ? markNotificationRead(DELIBERATIONS_FEED, deliberationId)
      : markNotificationUnread(DELIBERATIONS_FEED, deliberationId);
    call
      .catch(() => {
        // Roll back on failure so the UI doesn't lie about what's saved.
        setReadIds((prev) => {
          const next = new Set(prev);
          if (currentlyUnread) next.delete(deliberationId);
          else next.add(deliberationId);
          return next;
        });
      })
      .finally(() => setPending(deliberationId, false));
  }

  function markAllRead() {
    const unreadIds = (deliberated || [])
      .map((s) => s.deliberation.id)
      .filter((id) => isUnread(id));
    if (unreadIds.length === 0) return;
    setReadIds((prev) => new Set([...(prev || []), ...unreadIds]));
    markAllNotificationsRead(DELIBERATIONS_FEED, unreadIds).catch(() => {
      // Best-effort — a failed bulk mark just leaves those items unread
      // again next time the list is reloaded from the server.
    });
  }

  // Marking something read clears it from the visible list (rather than
  // just dimming it) — an inbox you actually work through, not one that
  // silently keeps growing. "Mark all as read" empties it in one go.
  // readIds === undefined means "not loaded yet"; treat everything as
  // still unread for that instant rather than flashing an empty list.
  const unreadDeliberated = (deliberated || []).filter((s) => isUnread(s.deliberation.id));
  const unreadCount = readIds === undefined ? (deliberated?.length ?? 0) : unreadDeliberated.length;
  const preview = unreadDeliberated.slice(0, 8);

  return (
    <div className="relative ml-auto" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-teal-100 hover:bg-white/10 hover:text-white transition-colors"
        aria-label="Notifications"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden z-40">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">
              {unreadCount === 0
                ? "No notifications"
                : `${unreadCount} deliberation decision${unreadCount === 1 ? "" : "s"}`}
            </p>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                Mark all as read
              </button>
            )}
          </div>
          {unreadCount === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              {!deliberated || deliberated.length === 0
                ? "No decisions have been made this term yet."
                : "You're all caught up — no unread decisions."}
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <p className="px-4 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-emerald-500" />
                Decisions made this term
              </p>
              <ul className="divide-y divide-slate-100">
                {preview.map((s) => {
                  const unread = isUnread(s.deliberation.id);
                  const busy = pendingIds.has(s.deliberation.id);
                  return (
                    <li key={s.studentId} className={`px-4 py-2.5 text-sm ${unread ? "bg-brand-50/40" : ""}`}>
                      <div className="flex items-start gap-1.5">
                        <button
                          onClick={() => toggleRead(s.deliberation.id, unread)}
                          disabled={busy}
                          title={unread ? "Mark as read" : "Mark as unread"}
                          aria-label={unread ? "Mark as read" : "Mark as unread"}
                          className={`mt-0.5 shrink-0 rounded-full disabled:opacity-50 transition-colors ${
                            unread ? "text-brand-400 hover:text-brand-600" : "text-emerald-500 hover:text-slate-300"
                          }`}
                        >
                          {unread ? <Circle size={16} /> : <CheckCircle2 size={16} className="fill-emerald-50" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-800">
                            {s.firstName} {s.lastName}
                            {s.className && (
                              <span className="ml-1.5 font-normal text-slate-400">· {s.className}</span>
                            )}
                          </p>
                          <div className="mt-1">
                            <Badge tone={DECISION_TONE[s.deliberation.decision]}>
                              {decisionLabel(s.deliberation.decision, termLabel)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">{exceededReasonLabel(s)}</p>
                          {s.deliberation.reason && <p className="mt-1 text-slate-500">{s.deliberation.reason}</p>}
                          <div className="mt-0.5 flex items-center justify-between text-xs text-slate-400">
                            <span>by {s.deliberation.decidedBy || "—"}</span>
                            <span>{fmtDate(s.deliberation.decidedAt)}</span>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

