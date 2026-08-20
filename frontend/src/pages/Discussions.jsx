import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { YearSelect } from "../components/ui/PillSelect";
import DiscussionModal from "../components/DiscussionModal";
import { listDiscussions, getAcademicYears } from "../api/sbms";
import { capitalizeFirst } from "../utils/text";
import { MessageCircle, LockOpen, Lock, Gavel } from "lucide-react";

const TABS = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
];

function fmtWhen(d) {
  return d
    ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";
}

function DiscussionRow({ d, onOpen }) {
  const record = d.MisconductRecord;
  const studentName = record?.Student ? `${record.Student.firstName} ${record.Student.lastName}` : "Unknown student";
  const incident = capitalizeFirst(record?.MisconductType?.title) || record?.customTitle || "Incident";

  return (
    <button
      onClick={() => onOpen(d)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50/40 hover:shadow-sm"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            d.status === "open" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
          }`}
        >
          <MessageCircle size={16} strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">{studentName}</p>
          <p className="truncate text-xs text-slate-500">{incident}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-slate-400">
        <span className="hidden sm:inline">Opened by {d.openedBy?.name} &middot; {fmtWhen(d.openedAt)}</span>
        <Badge tone={d.status === "open" ? "ok" : "neutral"}>
          {d.status === "open" ? <LockOpen size={11} /> : <Lock size={11} />}
          {d.status === "open" ? "Open" : "Closed"}
        </Badge>
      </div>
    </button>
  );
}

/**
 * A browsing view over every case-conference thread — where "am I part of
 * an active discussion?" gets answered without hunting through Records
 * row by row. New discussions are still started from a specific record on
 * the Records page (or the reporter's own report on the Dashboard); this
 * page is purely for finding and continuing ones that already exist.
 * A teacher only ever sees threads on reports they submitted — same scope
 * the backend enforces.
 */
export default function Discussions() {
  const { user } = useAuth();
  const [tab, setTab] = useState("open");
  const [discussions, setDiscussions] = useState(null);
  const [active, setActive] = useState(null);
  // Unlike Records/Dashboard, this page had no year scoping at all, so it
  // was showing every year's threads mixed together. Bring it in line
  // with the rest of the app: default to the current year, with the
  // picker still available to deliberately look back at past years.
  const [academicYears, setAcademicYears] = useState([]);
  const [academicYearId, setAcademicYearId] = useState("");

  useEffect(() => {
    getAcademicYears().then((years) => {
      setAcademicYears(years);
      const current = years.find((y) => y.isCurrent) || years[0];
      if (current) setAcademicYearId(String(current.id));
    });
  }, []);

  const isCurrentYearSelected =
    !academicYearId || academicYears.find((y) => String(y.id) === String(academicYearId))?.isCurrent !== false;

  useEffect(() => {
    if (!academicYearId) return;
    setDiscussions(null);
    listDiscussions({ status: tab, academicYearId })
      .then(setDiscussions)
      .catch(() => setDiscussions([]));
  }, [tab, academicYearId]);

  return (
    <div>
      <Card
        title="Discussions"
        subtitle="Case-conference threads on students' mistakes — reported, discussed, and decided together."
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.key ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {academicYears.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-400 shrink-0">Year</span>
              <YearSelect
                options={academicYears.map((y) => ({ id: y.id, label: y.name, isCurrent: y.isCurrent }))}
                value={academicYearId}
                onChange={setAcademicYearId}
              />
            </div>
          )}
        </div>
        {!isCurrentYearSelected && (
          <p className="mb-4 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5">
            Viewing a past academic year — these threads are read-only; nobody can post, start, or reopen a
            discussion here anymore.
          </p>
        )}

        {discussions === null ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading...</p>
        ) : discussions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-12 text-center">
            <Gavel size={22} className="text-slate-300" strokeWidth={1.75} />
            <p className="text-sm text-slate-500">
              {tab === "open"
                ? "No open discussions right now."
                : "No discussions have been closed yet."}
            </p>
            {["dean_of_discipline", "manager"].includes(user.sbmsRole) && tab === "open" && isCurrentYearSelected && (
              <p className="max-w-sm text-xs text-slate-400">
                Start one from a record's "Discuss" button on the Records page.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {discussions.map((d) => (
              <DiscussionRow key={d.id} d={d} onOpen={setActive} />
            ))}
          </div>
        )}
      </Card>

      {active && (
        <DiscussionModal
          record={active.MisconductRecord}
          currentUser={user}
          isCurrentYear={isCurrentYearSelected}
          onClose={() => {
            setActive(null);
            // Refresh the list in case status changed while the thread was open.
            listDiscussions({ status: tab, academicYearId })
              .then(setDiscussions)
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
