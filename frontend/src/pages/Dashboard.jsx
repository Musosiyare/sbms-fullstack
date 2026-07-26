import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import { Table, Thead, Th, Td, EmptyRow } from "../components/ui/Table";
import { listRecords, getAcademicYears } from "../api/sbms";
import { capitalizeFirst } from "../utils/text";
import {
  FlagTriangleRight,
  ClipboardList,
  BarChart3,
  ListChecks,
  UserCog,
  Clock,
  CheckCircle2,
  XCircle,
  Home,
  FileWarning,
  MessageCircle,
} from "lucide-react";
import Button from "../components/ui/Button";
import DiscussionModal from "../components/DiscussionModal";

const CAN_SEE_QUEUE = ["dean_of_discipline", "disciplinary_officer", "manager"];
// Teacher-facing status: still waiting is "Pending"; once the Dean of
// Discipline/officer has acted, it's either "Punished" (approved, marks
// deducted) or "Not punished" (rejected — nothing happened).
const PUNISHED_TONE = { finalized: "danger", pending: "warning", rejected: "ok" };
const PUNISHED_LABEL = { finalized: "Punished", pending: "Pending", rejected: "Not punished" };

function todayIsWithin(from, to) {
  if (!from || !to) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const f = new Date(from);
  f.setHours(0, 0, 0, 0);
  const t = new Date(to);
  t.setHours(0, 0, 0, 0);
  return f <= today && today <= t;
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

function StatCard({ icon: Icon, label, value, tone, onClick }) {
  const TONES = {
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    violet: "bg-violet-50 text-violet-600",
    brand: "bg-brand-50 text-brand-600",
  };
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4 text-left w-full ${
        onClick ? "hover:border-brand-200 hover:shadow-sm transition cursor-pointer" : ""
      }`}
    >
      <div className={`flex h-11 w-11 items-center justify-center rounded-full shrink-0 ${TONES[tone]}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-semibold text-slate-800 tabular-nums leading-tight">{value}</p>
        <p className="text-sm text-slate-500">
          {label}
          {onClick && <span className="text-brand-500 font-medium"> · view</span>}
        </p>
      </div>
    </Wrapper>
  );
}

/**
 * Discipline-office-wide overview for the Dean of Discipline, Disciplinary
 * Officer, and manager roles — everything going on across the school at a
 * glance, not just what's waiting on this one person.
 */
function DisciplineOverview({ records }) {
  const [sentHomeOpen, setSentHomeOpen] = useState(false);

  const stats = useMemo(() => {
    if (!records) return null;
    const pending = records.filter((r) => r.status === "pending");
    const finalized = records.filter((r) => r.status === "finalized");
    const rejected = records.filter((r) => r.status === "rejected");
    const sentHomeNow = finalized.filter((r) => todayIsWithin(r.sentHomeFrom, r.sentHomeTo));
    return { pending, finalized, rejected, sentHomeNow };
  }, [records]);

  return (
    <Card
      title="Discipline overview"
      subtitle="Everything currently happening across the discipline office."
      actions={
        <Link to="/records" className="text-sm font-medium text-brand-600 hover:underline self-center">
          Go to Records
        </Link>
      }
    >
      {stats === null ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Clock} label="Pending review" value={stats.pending.length} tone="amber" />
          <StatCard icon={CheckCircle2} label="Approved / recorded" value={stats.finalized.length} tone="emerald" />
          <StatCard icon={XCircle} label="Rejected" value={stats.rejected.length} tone="red" />
          <StatCard
            icon={Home}
            label="Currently sent home"
            value={stats.sentHomeNow.length}
            tone="violet"
            onClick={() => setSentHomeOpen(true)}
          />
        </div>
      )}

      {stats && (
        <SentHomeModal open={sentHomeOpen} onClose={() => setSentHomeOpen(false)} records={stats.sentHomeNow} />
      )}
    </Card>
  );
}

/**
 * Opened from the "Currently sent home" stat — every student still
 * serving a weekend right now, the incident that sent them home, and when
 * their weekend expires (with days-remaining so the office can see who's
 * due back soonest).
 */
function SentHomeModal({ open, onClose, records }) {
  const sorted = useMemo(
    () => [...records].sort((a, b) => new Date(a.sentHomeTo) - new Date(b.sentHomeTo)),
    [records]
  );

  function daysLeft(to) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const t = new Date(to);
    t.setHours(0, 0, 0, 0);
    const diff = Math.round((t - today) / (1000 * 60 * 60 * 24));
    if (diff <= 0) return { label: "Returns today", urgent: true };
    if (diff === 1) return { label: "1 day left", urgent: true };
    return { label: `${diff} days left`, urgent: false };
  }

  return (
    <Modal open={open} onClose={onClose} title="Currently sent home" size="lg">
      {sorted.length === 0 ? (
        <div className="py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <Home size={22} />
          </div>
          <p className="text-sm text-slate-500">No student is currently sent home.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sorted.map((r) => {
            const status = daysLeft(r.sentHomeTo);
            const initials = `${r.Student?.firstName?.[0] || ""}${r.Student?.lastName?.[0] || ""}`.toUpperCase();
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 hover:border-slate-300 transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-sm font-semibold text-violet-600">
                  {initials || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {r.Student?.firstName} {r.Student?.lastName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {capitalizeFirst(r.MisconductType?.title) || r.customTitle || "Untitled incident"}
                  </p>
                </div>
                <div className="hidden sm:flex flex-col items-end text-xs text-slate-400 shrink-0">
                  <span>Out {fmtDate(r.sentHomeFrom)}</span>
                  <span>Back {fmtDate(r.sentHomeTo)}</span>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                    status.urgent ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {status.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/**
 * A teacher/reporter's own tracking view: what they've flagged, and where
 * each one landed — still pending, approved, or rejected (with the reason).
 */
function MyReportsOverview({ records, user }) {
  const [discussTarget, setDiscussTarget] = useState(null);
  const mine = useMemo(() => {
    if (!records) return null;
    return records.filter((r) => r.reportedBy?.id === user.id);
  }, [records, user.id]);

  const stats = useMemo(() => {
    if (!mine) return null;
    return {
      total: mine.length,
      pending: mine.filter((r) => r.status === "pending").length,
      finalized: mine.filter((r) => r.status === "finalized").length,
      rejected: mine.filter((r) => r.status === "rejected").length,
    };
  }, [mine]);

  return (
    <Card title="My reports" subtitle="Mistakes you've flagged, and how each one was handled.">
      {stats === null ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard icon={FileWarning} label="Total reported" value={stats.total} tone="brand" />
            <StatCard icon={Clock} label="Pending review" value={stats.pending} tone="amber" />
            <StatCard icon={CheckCircle2} label="Approved" value={stats.finalized} tone="emerald" />
            <StatCard icon={XCircle} label="Rejected" value={stats.rejected} tone="red" />
          </div>

          <Table>
            <Thead>
              <tr>
                <Th>Student</Th>
                <Th>Incident</Th>
                <Th>Status</Th>
                <Th>Note</Th>
                <Th>Date</Th>
                <Th></Th>
              </tr>
            </Thead>
            <tbody>
              {mine.length === 0 ? (
                <EmptyRow colSpan={6}>You haven't reported anything yet.</EmptyRow>
              ) : (
                mine.slice(0, 10).map((r) => (
                  <tr key={r.id}>
                    <Td className="font-medium text-slate-800">
                      {r.Student?.firstName} {r.Student?.lastName}
                    </Td>
                    <Td>{capitalizeFirst(r.MisconductType?.title) || r.customTitle || "—"}</Td>
                    <Td>
                      <Badge tone={PUNISHED_TONE[r.status]}>{PUNISHED_LABEL[r.status]}</Badge>
                    </Td>
                    <Td className="text-slate-500">
                      {r.status === "rejected" ? r.rejectionReason || "—" : r.status === "finalized" ? `-${r.marksDeducted} marks` : "Awaiting review"}
                    </Td>
                    <Td className="text-slate-500">{fmtDate(r.createdAt)}</Td>
                    <Td>
                      <Button size="sm" variant="ghost" onClick={() => setDiscussTarget(r)}>
                        <MessageCircle size={14} /> Discuss
                      </Button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </>
      )}
      {discussTarget && (
        <DiscussionModal record={discussTarget} currentUser={user} onClose={() => setDiscussTarget(null)} />
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [records, setRecords] = useState(null);
  const showOverview = CAN_SEE_QUEUE.includes(user.sbmsRole);
  const showMyReports = user.sbmsRole === "reporter";

  useEffect(() => {
    if (!showOverview && !showMyReports) return;
    // The dashboard is a "what's happening right now" view, so it always
    // reflects whichever academic year the main system currently has set
    // — not a mix of every year ever recorded. (Full history, including
    // past years, is still available from the Records page.)
    getAcademicYears()
      .then((years) => {
        const current = years.find((y) => y.isCurrent) || years[0];
        if (!current) return setRecords([]);
        return listRecords({ academicYearId: current.id }).then(setRecords);
      })
      .catch(() => setRecords([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.sbmsRole]);

  return (
    <div>
      <p className="text-slate-600 mb-6">Welcome back, {user.name?.split(" ")[0]}.</p>

      {showOverview && <DisciplineOverview records={records} />}
      {showMyReports && <MyReportsOverview records={records} user={user} />}

      <div className="grid sm:grid-cols-2 gap-4">
        {["manager", "disciplinary_officer", "reporter"].includes(user.sbmsRole) && (
          <QuickAction
            to="/report"
            icon={FlagTriangleRight}
            title="Report a mistake"
            description="Flag an incident you witnessed for the discipline office."
            tone="reporter"
          />
        )}
        {["manager", "dean_of_discipline", "disciplinary_officer"].includes(user.sbmsRole) && (
          <QuickAction
            to="/records"
            icon={ClipboardList}
            title="Records"
            description="Review pending reports and browse finalized records."
            tone="brand"
          />
        )}
        {["manager", "dean_of_discipline", "disciplinary_officer"].includes(user.sbmsRole) && (
          <QuickAction
            to="/class-report"
            icon={BarChart3}
            title="Class report"
            description="Termly and yearly conduct scores for a class."
            tone="brand"
          />
        )}
        {["dean_of_discipline"].includes(user.sbmsRole) && (
          <QuickAction
            to="/misconduct-types"
            icon={ListChecks}
            title="Misconduct types"
            description="Manage the catalog of offenses and default deductions."
            tone="brand"
          />
        )}
        {["dean_of_discipline", "manager", "disciplinary_officer"].includes(user.sbmsRole) && (
          <QuickAction
            to="/staff-roles"
            icon={UserCog}
            title="Staff roles"
            description="Assign Dean of Discipline and Disciplinary Officer access."
            tone="brand"
          />
        )}
      </div>
    </div>
  );
}

function QuickAction({ to, icon: Icon, title, description }) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl p-4 hover:border-brand-200 hover:shadow-sm transition"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 shrink-0">
        <Icon size={18} />
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
    </Link>
  );
}
