import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Pagination from "../components/ui/Pagination";
import { getActivityLogs } from "../api/sbms";
import {
  History,
  ClipboardList,
  Gavel,
  MessageCircle,
  ListChecks,
  FilePlus,
  FileCheck2,
  FileX2,
  FilePen,
  FileMinus,
  Paperclip,
  XCircle,
  CalendarDays,
  X,
  ShieldMinus,
} from "lucide-react";

const PAGE_SIZE = 20;

// Which categories a role can even filter by — mirrors CATEGORY_ACCESS on
// the backend (see activityLogService), so the pill row never offers a
// filter that would just come back empty.
const CATEGORY_OPTIONS = {
  manager: ["reports", "deliberations", "discussions", "misconduct_types"],
  dean_of_discipline: ["reports", "deliberations", "discussions", "misconduct_types"],
  disciplinary_officer: ["reports", "deliberations", "discussions", "misconduct_types"],
  reporter: ["reports", "discussions"],
};

const CATEGORY_META = {
  reports: { label: "Reports", icon: ClipboardList, tone: "brand", iconBg: "bg-brand-50" },
  deliberations: { label: "Deliberations", icon: Gavel, tone: "manager", iconBg: "bg-blue-50" },
  discussions: { label: "Discussions", icon: MessageCircle, tone: "officer", iconBg: "bg-amber-50" },
  misconduct_types: { label: "Misconduct types", icon: ListChecks, tone: "neutral", iconBg: "bg-slate-100" },
};

// Per-action icon — falls back to the category's own icon when an action
// doesn't need anything more specific.
const ACTION_ICON = {
  report_created: FilePlus,
  record_created: FilePlus,
  class_record_created: FilePlus,
  class_report_created: FilePlus,
  report_approved: FileCheck2,
  report_rejected: FileX2,
  report_updated: FilePen,
  report_withdrawn: FileMinus,
  evidence_added: Paperclip,
  evidence_deleted: XCircle,
};

const ROLE_TONE = { manager: "manager", dean_of_discipline: "dod", disciplinary_officer: "officer", reporter: "reporter" };
const ROLE_LABEL = {
  manager: "Manager",
  dean_of_discipline: "Dean of Discipline",
  disciplinary_officer: "Disciplinary Officer",
  reporter: "Teacher",
};

function fmtWhen(d) {
  return new Date(d).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "2026-08-13" -> "Aug 13, 2026", read as a date-only value so it doesn't
// shift a day depending on the browser's timezone.
function fmtDateShort(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// A date filter that's just a calendar icon (plus the picked date once one
// is set) rather than a full text input — click it to open the native date
// picker, click the small x to clear it.
function DateIconField({ label, value, onChange }) {
  const inputRef = useRef(null);

  const open = () => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={open}
        title={value ? `${label}: ${fmtDateShort(value)}` : `Filter by ${label.toLowerCase()} date`}
        className={`flex h-[42px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${
          value
            ? "border-brand-300 bg-brand-50 text-brand-700"
            : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
        }`}
      >
        <CalendarDays size={15} strokeWidth={2.25} />
        {value ? fmtDateShort(value) : label}
      </button>

      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          title={`Clear ${label.toLowerCase()} date`}
          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-400 text-white hover:bg-slate-500"
        >
          <X size={10} strokeWidth={3} />
        </button>
      )}

      {/* Invisible native input — it's what actually renders the calendar
          picker; the button above just triggers it via showPicker(). */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
    </div>
  );
}

function LogRow({ log }) {
  const meta = CATEGORY_META[log.category] || CATEGORY_META.reports;
  const Icon = ACTION_ICON[log.action] || meta.icon;
  const className = log.metadata?.className;
  const marksDeducted = log.metadata?.marksDeducted;

  return (
    <div className="group flex items-start gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:border-slate-200">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${meta.iconBg} ring-1 ring-inset ring-black/[0.03]`}
      >
        <Icon size={17} strokeWidth={2.25} className="text-slate-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed text-slate-800">
          {log.description}
          {className && (
            <>
              {" "}
              in <span className="font-semibold text-slate-900">{className}</span>
            </>
          )}
        </p>

        {!!marksDeducted && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1 ring-1 ring-inset ring-red-100">
            <ShieldMinus size={13} strokeWidth={2.5} className="text-red-500" />
            <span className="text-xs font-bold text-red-700">
              {marksDeducted} mark{marksDeducted === 1 ? "" : "s"} deducted
            </span>
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <Badge tone={ROLE_TONE[log.actorRole] || "neutral"} className="text-[11px]">
            {ROLE_LABEL[log.actorRole] || log.actorRole}
          </Badge>
          <span>{meta.label}</span>
          <span>&middot;</span>
          <span>{fmtWhen(log.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * A role-scoped feed of what's happened in SBMS. What shows up here isn't
 * the same for everyone: a teacher only ever sees their own reports and
 * the discussions they're part of, while discipline-side roles (Manager,
 * Dean of Discipline, Disciplinary Officer) see the full school-wide
 * trail across reports, deliberations, discussions, and misconduct types
 * — the same boundary the backend already enforces on the underlying
 * actions themselves (see activityLogController.list).
 */
export default function ActivityLog() {
  const { user } = useAuth();
  const availableCategories = CATEGORY_OPTIONS[user?.sbmsRole] || [];

  const [logs, setLogs] = useState(null);
  const [category, setCategory] = useState("");
  // Default to "my activity only" — the full school-wide trail is opt-in
  // via the toggle below, not the first thing you see.
  const [mineOnly, setMineOnly] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const isReporter = user?.sbmsRole === "reporter";

  useEffect(() => {
    setLogs(null);
    const params = {};
    if (category) params.category = category;
    if (mineOnly) params.mine = "true";
    if (from) params.from = from;
    if (to) params.to = to;
    getActivityLogs(params)
      .then(setLogs)
      .catch(() => setLogs([]));
  }, [category, mineOnly, from, to]);

  useEffect(() => {
    setPage(1);
  }, [category, mineOnly, from, to]);

  const pageCount = logs ? Math.max(1, Math.ceil(logs.length / PAGE_SIZE)) : 1;
  const paged = useMemo(() => {
    if (!logs) return [];
    const start = (page - 1) * PAGE_SIZE;
    return logs.slice(start, start + PAGE_SIZE);
  }, [logs, page]);

  return (
    <Card
      title="Activity Log"
      subtitle={
        isReporter
          ? mineOnly
            ? "Just what you've reported yourself."
            : "Your own reports, and the discussions you're part of."
          : mineOnly
          ? "Your own activity. Switch to all logs to see the full school-wide trail."
          : "Every discipline action logged across the school, scoped to what your role can see."
      }
    >
      <div className="mb-5 flex flex-wrap items-end gap-3">
        {availableCategories.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategory("")}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                category === "" ? "bg-brand-500 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All
            </button>
            {availableCategories.map((c) => {
              const meta = CATEGORY_META[c];
              const Icon = meta.icon;
              const active = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active ? "bg-brand-500 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Icon size={12} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <DateIconField label="From" value={from} onChange={setFrom} />
            <DateIconField label="To" value={to} onChange={setTo} />
          </div>

          <div className="flex rounded-full bg-slate-100 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMineOnly(true)}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                mineOnly ? "bg-brand-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              My activity
            </button>
            <button
              type="button"
              onClick={() => setMineOnly(false)}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                !mineOnly ? "bg-brand-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              All logs
            </button>
          </div>
        </div>
      </div>

      {logs === null ? (
        <p className="py-8 text-center text-sm text-slate-400">Loading...</p>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-12 text-center">
          <History size={22} className="text-slate-300" strokeWidth={1.75} />
          <p className="text-sm text-slate-500">Nothing logged here yet.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {paged.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </div>
          <Pagination
            page={page}
            pageCount={pageCount}
            totalItems={logs.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            className="mt-4"
          />
        </>
      )}
    </Card>
  );
}
