import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Badge, { TextBadge } from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import { Table, Thead, Th, Td, EmptyRow } from "../components/ui/Table";
import { Field, Select, Textarea } from "../components/ui/FormField";
import { ErrorText, NotCurrentYearNotice } from "../components/ui/Alerts";
import EvidenceList from "../components/ui/EvidenceList";
import EvidenceUpload, { EvidenceFieldLabel } from "../components/ui/EvidenceUpload";
import { useConfirm } from "../components/ui/ConfirmProvider";
import SearchableSelect from "../components/ui/SearchableSelect";
import { buildMisconductOptions } from "../utils/misconductOptions";
import { useScopePicker } from "../hooks/useScopePicker";
import PillSelect, { YearSelect } from "../components/ui/PillSelect";
import Pagination from "../components/ui/Pagination";
import {
  listRecords,
  getMisconductTypes,
  updateReport,
  deleteReport,
  addEvidence,
  getExceededStudents,
  submitDeliberation,
  undoDeliberation,
} from "../api/sbms";
import { capitalizeFirst } from "../utils/text";
import { DECISION_TONE, DECISION_EMPHASIS, decisionLabel, exceededReasonLabel } from "../utils/deliberation";
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
  Eye,
  Paperclip,
  Pencil,
  Trash2,
  Gavel,
  Undo2,
  ChevronRight,
  CalendarRange,
  Search,
  Cpu,
} from "lucide-react";
import Button from "../components/ui/Button";
import DiscussionModal from "../components/DiscussionModal";

const CAN_SEE_QUEUE = ["dean_of_discipline", "disciplinary_officer", "manager"];
// Mirrors deliberationController.CAN_DECIDE on the backend — a
// Disciplinary Officer can see the exceeded-marks cards and any decision
// already made, but only the Dean of Discipline / manager can actually
// decide or undo one.
const CAN_DECIDE = ["dean_of_discipline", "manager"];
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

/**
 * Compact pill version of a stat — a fraction of the height of a full
 * stat box, so a stats row reads as a quick strip instead of a wall of
 * boxes. Used for the discipline overview and "My reports" summary.
 */
function MiniStat({ icon: Icon, label, value, tone, onClick }) {
  const TONES = {
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    violet: "bg-violet-50 text-violet-700",
  };
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs whitespace-nowrap ${TONES[tone]} ${
        onClick ? "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm cursor-pointer" : ""
      }`}
    >
      <Icon size={13} />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="font-medium opacity-75">{label}</span>
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
      className="min-h-[10rem]"
      title="Discipline overview"
      subtitle="Everything currently happening across the discipline office."
      actions={
        <Link
          to="/records"
          className="self-center inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-100"
        >
          Go to Records
          <ChevronRight size={15} />
        </Link>
      }
    >
      <div>
        {stats === null ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <MiniStat icon={Clock} label="Pending review" value={stats.pending.length} tone="amber" />
            <MiniStat icon={CheckCircle2} label="Approved / recorded" value={stats.finalized.length} tone="emerald" />
            <MiniStat icon={XCircle} label="Rejected" value={stats.rejected.length} tone="red" />
            <MiniStat
              icon={Home}
              label="Currently sent home"
              value={stats.sentHomeNow.length}
              tone="violet"
              onClick={() => setSentHomeOpen(true)}
            />
          </div>
        )}
      </div>

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
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-sm font-semibold text-violet-600">
                  {initials || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 break-words">
                    {r.Student?.firstName} {r.Student?.lastName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {r.Class?.name && <span className="text-slate-400">{r.Class.name} · </span>}
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
const MY_REPORTS_PAGE_SIZE = 10;

function MyReportsOverview({ records, user, onRecordsChange, isCurrentYear = true, teacherClasses = [] }) {
  const [discussTarget, setDiscussTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const mine = useMemo(() => {
    if (!records) return null;
    return records.filter((r) => r.reportedBy?.id === user.id);
  }, [records, user.id]);

  // A teacher who teaches more than one class gets everything mixed
  // together here — this filter narrows "My reports" down to a single
  // class at a time, same idea as the class filter on the discipline
  // side's Records page. Built from the classes the teacher actually
  // teaches (same source as the Report form's class picker), not just
  // classes they've already reported into — otherwise the filter would
  // stay hidden until a second class had at least one report.
  const myClasses = useMemo(
    () => [...teacherClasses].sort((a, b) => a.name.localeCompare(b.name)),
    [teacherClasses]
  );

  // If a class filter no longer applies (year switched, no longer
  // teaching it), drop back to "All classes" instead of silently
  // filtering to nothing.
  useEffect(() => {
    if (classFilter && !myClasses.some((c) => String(c.id) === String(classFilter))) {
      setClassFilter("");
    }
  }, [myClasses, classFilter]);

  // Stats above stay based on everything the teacher's ever reported,
  // regardless of the search box — only the table below narrows down, so
  // typing a name to find one report doesn't make the counts look wrong.
  const visible = useMemo(() => {
    if (!mine) return null;
    const q = search.trim().toLowerCase();
    let filtered = classFilter ? mine.filter((r) => String(r.Class?.id) === String(classFilter)) : mine;
    filtered = statusFilter ? filtered.filter((r) => r.status === statusFilter) : filtered;
    filtered = q
      ? filtered.filter((r) => `${r.Student?.firstName || ""} ${r.Student?.lastName || ""}`.toLowerCase().includes(q))
      : filtered;
    return [...filtered].sort((a, b) =>
      `${a.Student?.firstName || ""} ${a.Student?.lastName || ""}`.localeCompare(
        `${b.Student?.firstName || ""} ${b.Student?.lastName || ""}`
      )
    );
  }, [mine, search, classFilter, statusFilter]);

  // A class-wide report can drop 20-30 rows in at once, and every new
  // search narrows the set — reset back to page 1 whenever either changes
  // so a teacher doesn't land on a stale/empty page and think results are
  // missing.
  useEffect(() => {
    setPage(1);
  }, [visible?.length, search, classFilter, statusFilter]);

  const pageCount = visible ? Math.max(1, Math.ceil(visible.length / MY_REPORTS_PAGE_SIZE)) : 1;
  const pageStart = (page - 1) * MY_REPORTS_PAGE_SIZE;
  const pageItems = visible ? visible.slice(pageStart, pageStart + MY_REPORTS_PAGE_SIZE) : [];

  const stats = useMemo(() => {
    if (!mine) return null;
    return {
      total: mine.length,
      pending: mine.filter((r) => r.status === "pending").length,
      finalized: mine.filter((r) => r.status === "finalized").length,
      rejected: mine.filter((r) => r.status === "rejected").length,
    };
  }, [mine]);

  // Keep the modal's data in sync after an evidence delete inside it.
  const viewRecord = viewTarget && mine ? mine.find((r) => r.id === viewTarget.id) || viewTarget : viewTarget;

  return (
    <Card
      title="My reports"
      subtitle="Mistakes you've flagged, and how each one was handled."
      actions={
        <Link
          to="/report"
          className="self-center inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-100"
        >
          <FlagTriangleRight size={15} />
          Report a mistake
        </Link>
      }
    >
      {!isCurrentYear && (
        <div className="mb-4">
          <NotCurrentYearNotice action="reports can only be edited or withdrawn" />
        </div>
      )}
      {stats === null ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            <MiniStat icon={FileWarning} label="Total reported" value={stats.total} tone="violet" />
            <MiniStat icon={Clock} label="Pending review" value={stats.pending} tone="amber" />
            <MiniStat icon={CheckCircle2} label="Approved" value={stats.finalized} tone="emerald" />
            <MiniStat icon={XCircle} label="Rejected" value={stats.rejected} tone="red" />
          </div>

          {mine.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="relative max-w-sm w-full">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by student name..."
                  className="form-field w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm outline-none transition-all hover:border-slate-300 focus:border-brand-400 focus:bg-white"
                />
              </div>
              {myClasses.length > 0 && (
                <YearSelect
                  options={[
                    { id: "", label: "All classes", isCurrent: false },
                    ...myClasses.map((c) => ({ id: c.id, label: c.name, isCurrent: true })),
                  ]}
                  value={classFilter}
                  onChange={setClassFilter}
                />
              )}
              <PillSelect
                options={[
                  { id: "", label: "All statuses" },
                  { id: "pending", label: "Pending" },
                  { id: "finalized", label: "Punished" },
                  { id: "rejected", label: "Not punished" },
                ]}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </div>
          )}

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
              ) : visible.length === 0 ? (
                <EmptyRow colSpan={6}>
                  {search ? `No reports match "${search}".` : "No reports match these filters."}
                </EmptyRow>
              ) : (
                pageItems.map((r) => (
                  <tr key={r.id}>
                    <Td className="font-medium text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span>
                          {r.Student?.firstName} {r.Student?.lastName}
                        </span>
                        {r.evidence?.length > 0 && (
                          <Paperclip
                            size={12}
                            className="shrink-0 text-slate-400"
                            title={`${r.evidence.length} file(s) attached`}
                          />
                        )}
                      </div>
                      <p className="text-xs font-normal text-slate-400">{r.Class?.name || "—"}</p>
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
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewTarget(r)}>
                          <Eye size={14} /> View
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setDiscussTarget(r)}>
                          <MessageCircle size={14} /> Discuss
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
          <Pagination
            page={page}
            pageCount={pageCount}
            totalItems={visible.length}
            pageSize={MY_REPORTS_PAGE_SIZE}
            onPageChange={setPage}
            className="mt-4"
          />
        </>
      )}
      {discussTarget && (
        <DiscussionModal
          record={discussTarget}
          currentUser={user}
          onClose={() => setDiscussTarget(null)}
          isCurrentYear={isCurrentYear}
        />
      )}
      {viewRecord && (
        <MyReportDetailModal
          record={viewRecord}
          currentUser={user}
          onClose={() => setViewTarget(null)}
          onEvidenceChange={onRecordsChange}
          onRecordDeleted={onRecordsChange}
        />
      )}
    </Card>
  );
}

/**
 * Opened from the eye icon on "My reports" — the full incident + evidence
 * for one of the teacher's own reports. Editing/deleting is only offered
 * while the report is still `pending`: once the discipline office has
 * acted on it — approved (`finalized`) or `rejected` — it's a decided
 * record, so this only offers a read-only view from that point on
 * (mirrors the backend rule).
 */
function MyReportDetailModal({ record, currentUser, onClose, onEvidenceChange, onRecordDeleted }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [types, setTypes] = useState(null);
  const [misconductTypeId, setMisconductTypeId] = useState(record.MisconductType?.id ?? record.misconductTypeId ?? "");
  const [description, setDescription] = useState(record.description || "");
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const canModify = record.reportedByUserId === currentUser.id && record.status === "pending";

  function startEdit() {
    setMisconductTypeId(record.MisconductType?.id ?? record.misconductTypeId ?? "");
    setDescription(record.description || "");
    setFiles([]);
    setError("");
    setEditing(true);
    if (!types) getMisconductTypes().then(setTypes);
  }

  async function handleSave() {
    if (!misconductTypeId) {
      setError("Pick an incident from the list.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateReport(record.id, {
        misconductTypeId,
        description: description.trim() || undefined,
      });
      if (files.length > 0) {
        await addEvidence(record.id, files);
      }
      toast.success("Report updated");
      setEditing(false);
      setFiles([]);
      onEvidenceChange?.();
    } catch (err) {
      setError(err.message || "Couldn't update report");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this report?",
      message: "This permanently deletes the report and any evidence attached to it. This can't be undone.",
      confirmText: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteReport(record.id);
      toast.success("Report deleted");
      onRecordDeleted?.();
      onClose();
    } catch (err) {
      toast.error("Couldn't delete report", { description: err.message });
      setDeleting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Report details" size="sm">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {record.Student?.firstName} {record.Student?.lastName}
            </p>
            <p className="text-xs text-slate-400">{record.Class?.name || "—"}</p>
          </div>
          <Badge tone={PUNISHED_TONE[record.status]}>{PUNISHED_LABEL[record.status]}</Badge>
        </div>

        {editing ? (
          <div className="flex flex-col gap-3 mt-1">
            <Field label="Incident">
              <SearchableSelect
                options={buildMisconductOptions(types)}
                value={misconductTypeId}
                onChange={setMisconductTypeId}
                disabled={!types}
                placeholder={types ? "Search incident types..." : "Loading..."}
              />
            </Field>
            <Field label="Additional notes (optional)">
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field label={<EvidenceFieldLabel />}>
              <EvidenceUpload
                files={files}
                disabled={saving}
                onChange={(next, uploadError) => {
                  setFiles(next);
                  if (uploadError) setError(uploadError);
                }}
              />
              <p className="mt-1 text-xs text-slate-400">New files are attached in addition to what's already there.</p>
            </Field>
            <ErrorText>{error}</ErrorText>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              {capitalizeFirst(record.MisconductType?.title) || record.customTitle || "No incident type given"}
            </p>
            {record.description && <p className="text-sm text-slate-500">{record.description}</p>}
            {record.status === "rejected" && record.rejectionReason && (
              <p className="text-xs text-red-500">Reason: {record.rejectionReason}</p>
            )}
            {record.status === "finalized" && (
              <p className="text-xs text-slate-400">-{record.marksDeducted} marks deducted</p>
            )}
            <p className="text-xs text-slate-400">Reported {fmtDate(record.createdAt)}</p>
          </>
        )}

        {record.evidence?.length > 0 && (
          <div className="mt-1 pt-2 border-t border-slate-100">
            <EvidenceList record={record} currentUser={currentUser} onChange={onEvidenceChange} />
          </div>
        )}

        {!editing && canModify && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
            <Button size="sm" variant="secondary" onClick={startEdit}>
              <Pencil size={14} /> Edit
            </Button>
            <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>
              <Trash2 size={14} /> {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Every student in the selected term who's used up all 40 conduct marks
 * and still needs a Dean of Discipline / Disciplinary Officer / manager
 * ruling — dismiss permanently, dismiss for the term, or stain the
 * record. Kept as its own full-width card since it's the actionable
 * queue and deserves the most attention on the dashboard.
 */
function PendingDeliberationCard({ students, termLabel, canDecide, canDecideNow, onDecide }) {
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Clock size={12} />
          </span>
          Awaiting deliberation
        </span>
      }
      subtitle={`${students.length} student${students.length === 1 ? "" : "s"} exceeded their conduct marks (per term or cumulatively for the year) and still need${students.length === 1 ? "s" : ""} a decision.`}
    >
      <Table>
        <Thead>
          <tr>
            <Th>Student</Th>
            <Th>Marks</Th>
            {canDecide && <Th className="text-right">Action</Th>}
          </tr>
        </Thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.studentId}>
              <Td className="font-medium text-slate-800">
                {s.firstName} {s.lastName}
                <span className="block text-xs font-normal text-slate-400">
                  {s.className || "—"} · {s.admissionNumber || "—"}
                </span>
              </Td>
              <Td>
                <div className="flex flex-col gap-1">
                  <Badge tone="danger">
                    -{s.score.deducted}
                    {s.exceededYear ? ` (term) / -${s.yearScore.deducted} (year)` : ""}
                  </Badge>
                  <span className="text-xs text-slate-400">{exceededReasonLabel(s)}</span>
                </div>
              </Td>
              {canDecide && (
                <Td className="text-right">
                  <Button size="sm" variant="secondary" onClick={() => onDecide(s)} disabled={!canDecideNow}>
                    <Gavel size={13} /> Decide
                  </Button>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

/**
 * Students already ruled on this term — kept visible (not just the
 * pending queue) so the office can revisit or undo a call without
 * losing track of who's been handled. Sized to sit side-by-side with
 * the (now compact) discipline overview card rather than stacking
 * another full-width block underneath it.
 *
 * System-decided students (see applySystemYearlyDismissals) get no
 * action at all here — no button, nothing clickable — since that
 * decision genuinely can't be changed. This is gated on `locked`, not
 * just `bySystem`: `locked` is true whenever a system row exists for
 * the student ANYWHERE in the academic year, even in the rare case a
 * different (human) row from another term is the one actually being
 * displayed — so the button can't be exposed by picking a term other
 * than the one the system decided in. Only a human decision with no
 * system row anywhere in the year (any severity, including a permanent
 * dismissal) gets a "Change decision" button.
 */
function DeliberatedStudentsCard({ students, termLabel, canDecide, canDecideNow, onDecide }) {
  const [pickedId, setPickedId] = useState("");
  const picked = students.find((s) => String(s.studentId) === String(pickedId)) || null;
  const pickedBySystem = !!picked?.deliberation?.bySystem;
  // `locked` covers bySystem plus the (now server-blocked, but just in
  // case of old data) case where a human row in a different term is
  // what's displayed while a system row also exists for this student
  // this year — either way, no "Change decision" button.
  const pickedLocked = !!picked?.deliberation?.locked;

  // If the picked student drops out of the list (term/year switched),
  // fall back to the empty "Select a student..." state instead of
  // showing stale details.
  useEffect(() => {
    if (pickedId && !students.some((s) => String(s.studentId) === String(pickedId))) {
      setPickedId("");
    }
  }, [students, pickedId]);

  return (
    <Card
      className="min-h-[10rem]"
      title={
        <span className="inline-flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={12} />
          </span>
          Deliberated students
        </span>
      }
      subtitle={`${students.length} student${students.length === 1 ? "" : "s"} already decided for ${termLabel || "this term"} — pick a name to see the decision.`}
    >
      <div>
        <Field label="Student">
          <Select value={pickedId} onChange={(e) => setPickedId(e.target.value)}>
            <option value="">Select a student...</option>
            {students.map((s) => (
              <option key={s.studentId} value={s.studentId}>
                {s.firstName} {s.lastName} — {decisionLabel(s.deliberation.decision, termLabel)}
              </option>
            ))}
          </Select>
        </Field>

        {picked && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {picked.firstName} {picked.lastName}
                </p>
                <p className="text-xs text-slate-500">
                  {picked.className || "—"} · {picked.admissionNumber || "No admission no."}
                </p>
              </div>
              <Badge tone="danger">
                -{picked.score.deducted}
                {picked.exceededYear ? ` (term) / -${picked.yearScore.deducted} (year)` : ""}
              </Badge>
            </div>
            <p className="text-xs text-slate-400">{exceededReasonLabel(picked)}</p>
            <TextBadge tone={DECISION_TONE[picked.deliberation.decision]} className={DECISION_EMPHASIS[picked.deliberation.decision]}>
              {decisionLabel(picked.deliberation.decision, picked.deliberation.termName || termLabel)}
            </TextBadge>
            {picked.deliberation.reason && <p className="text-sm text-slate-600">{picked.deliberation.reason}</p>}
            <p className="text-xs text-slate-400">
              {pickedBySystem ? (
                <span className="inline-flex items-center gap-1 text-violet-700">
                  <Cpu size={11} /> Auto-dismissed by the system
                </span>
              ) : (
                <>by {picked.deliberation.decidedBy || "—"} · {fmtDate(picked.deliberation.decidedAt)}</>
              )}
              {picked.deliberation.termName && picked.deliberation.termName !== termLabel && (
                <> · decided in {picked.deliberation.termName}</>
              )}
            </p>
            {pickedBySystem && (
              <p className="text-xs text-violet-700">
                Exceeded half the year's conduct marks — this is a computed decision, not a discretionary one, and
                can't be undone or changed.
              </p>
            )}
            {!pickedBySystem && pickedLocked && (
              <p className="text-xs text-violet-700">
                The system also auto-dismissed {picked.firstName} elsewhere this year — that decision stands and
                can't be superseded from another term.
              </p>
            )}
            {canDecide && !pickedLocked && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onDecide(picked)}
                disabled={!canDecideNow}
                className="mt-1 self-start"
              >
                <Gavel size={13} /> Change decision
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Modal to record (or change/undo) the discipline office's call on one exceeded student. */
function DeliberationModal({ student, termId, academicYearId, isCurrentAcademicYear = true, onClose, onSaved }) {
  const confirm = useConfirm();
  // A system-authored row (see applySystemYearlyDismissals) is a computed
  // fact, not a discretionary staff call — undecide() rejects it
  // server-side no matter who asks, so editing/undoing is hidden here too
  // rather than letting staff tap it and hit an error. Any decision
  // discipline staff actually made themselves — including a permanent
  // dismissal — stays fully editable and undoable.
  const bySystem = !!student.deliberation?.bySystem;
  const [decision, setDecision] = useState(student.deliberation?.decision || "");
  const [reason, setReason] = useState(student.deliberation?.reason || "");
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!decision) {
      setError("Pick a decision.");
      return;
    }
    if (!isCurrentAcademicYear) {
      setError("Deliberation decisions can only be made for the current academic year.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await submitDeliberation({
        studentId: student.studentId,
        termId,
        academicYearId,
        decision,
        reason: reason.trim() || undefined,
      });
      toast.success("Decision recorded");
      onSaved();
    } catch (err) {
      setError(err.message || "Couldn't record the decision");
    } finally {
      setSaving(false);
    }
  }

  async function handleUndo() {
    if (!isCurrentAcademicYear) {
      setError("Deliberation decisions can only be undone for the current academic year.");
      return;
    }
    const ok = await confirm({
      title: "Undo this decision?",
      message: (
        <>
          <strong className="font-semibold text-black">
            {student.firstName} {student.lastName}
          </strong>{" "}
          will go back to "awaiting decision" for this term.
        </>
      ),
      confirmText: "Undo",
      tone: "danger",
    });
    if (!ok) return;
    setUndoing(true);
    try {
      await undoDeliberation(student.deliberation.id);
      toast.success("Decision undone");
      onSaved();
    } catch (err) {
      toast.error("Couldn't undo the decision", { description: err.message });
      setUndoing(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Deliberation — ${student.firstName} ${student.lastName}`}
      footer={
        <>
          {student.deliberation && !bySystem && (
            <Button variant="ghost" onClick={handleUndo} disabled={saving || undoing || !isCurrentAcademicYear}>
              <Undo2 size={14} /> {undoing ? "Undoing..." : "Undo decision"}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saving || undoing}>
            Cancel
          </Button>
          {!bySystem && (
            <Button onClick={handleSave} disabled={saving || undoing || !isCurrentAcademicYear}>
              {saving ? "Saving..." : "Save decision"}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!isCurrentAcademicYear && <NotCurrentYearNotice action="deliberation decisions can only be made" />}
        {bySystem ? (
          <p className="text-sm rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-violet-700">
            {student.firstName} was dismissed automatically by the system for using up half of this academic year's
            conduct marks{student.deliberation?.termName ? ` (recorded in ${student.deliberation.termName})` : ""}.
            This is a computed decision, not a discretionary staff call — it can't be undone or changed.
          </p>
        ) : null}
        <p className="text-sm text-slate-500">
          {student.firstName} has used {student.score.deducted} of {student.score.maxMarks} marks this term
          ({student.score.remaining <= 0 ? "none remaining" : `${student.score.remaining} remaining`}).
          {student.exceededYear && (
            <>
              {" "}Cumulatively for the year, {student.firstName} has used {student.yearScore.deducted} of{" "}
              {student.yearScore.maxMarks} marks — past the recommended-dismissal line.
            </>
          )}
        </p>
        <Field label="Decision">
          <Select value={decision} onChange={(e) => setDecision(e.target.value)} disabled={!isCurrentAcademicYear || bySystem}>
            <option value="">Select...</option>
            <option value="dismissed_permanently">Dismiss permanently</option>
            <option value="dismissed_term">Dismiss for this term</option>
            <option value="stained">Stain record (retain student)</option>
          </Select>
        </Field>
        <Field label="Reason / notes (optional)">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} disabled={!isCurrentAcademicYear || bySystem} />
        </Field>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}

/**
 * "Good morning/afternoon/evening" based on the visitor's local clock —
 * hour boundaries match common convention (morning until noon, afternoon
 * until 5pm, evening after).
 */
function timeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { user } = useAuth();
  const [records, setRecords] = useState(null);
  const [exceededStudents, setExceededStudents] = useState(null);
  const [deliberationTarget, setDeliberationTarget] = useState(null);
  const showOverview = CAN_SEE_QUEUE.includes(user.sbmsRole);
  const showMyReports = user.sbmsRole === "reporter";
  const scope = useScopePicker({ needsStudent: false });

  function refreshRecords() {
    if (!scope.academicYearId || !scope.termId) {
      setRecords([]);
      return;
    }
    listRecords({ academicYearId: scope.academicYearId, termId: scope.termId })
      .then(setRecords)
      .catch(() => setRecords([]));
  }

  function refreshExceeded() {
    if (!scope.academicYearId || !scope.termId) {
      setExceededStudents([]);
      return;
    }
    getExceededStudents({ termId: scope.termId, academicYearId: scope.academicYearId })
      .then(setExceededStudents)
      .catch(() => setExceededStudents([]));
  }

  useEffect(() => {
    if (!showOverview && !showMyReports) return;
    // The dashboard is a "what's happening right now" view, filtered to
    // whichever academic year + term is selected above — defaults to the
    // main system's current year and whichever term is currently open,
    // same defaults useScopePicker already applies everywhere else.
    // (Full history, including past years/terms, is still available from
    // the Records page.)
    refreshRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.sbmsRole, scope.academicYearId, scope.termId]);

  useEffect(() => {
    if (!showOverview) return;
    refreshExceeded();
    setDeliberationTarget(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOverview, scope.academicYearId, scope.termId]);

  const pendingDeliberation = useMemo(() => exceededStudents?.filter((s) => !s.deliberation) ?? [], [exceededStudents]);
  const deliberatedStudents = useMemo(() => exceededStudents?.filter((s) => s.deliberation) ?? [], [exceededStudents]);
  const canDecide = CAN_DECIDE.includes(user.sbmsRole);
  const canDecideNow = canDecide && scope.isCurrentAcademicYear;

  const selectedTerm = scope.terms.find((t) => String(t.id) === String(scope.termId));
  const selectedYear = scope.academicYears.find((y) => String(y.id) === String(scope.academicYearId));
  const termLabel = selectedTerm && selectedYear ? `${selectedTerm.name}, ${selectedYear.name}` : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-slate-600">
          <span className="font-bold text-brand-600">{timeOfDayGreeting()}</span>, {user.name?.split(" ")[0]}.
        </p>
      </div>

      {(showOverview || showMyReports) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400 shrink-0">Year</span>
            <YearSelect
              options={scope.academicYears.map((y) => ({ id: y.id, label: y.name, isCurrent: y.isCurrent }))}
              value={scope.academicYearId}
              onChange={scope.setAcademicYearId}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400 shrink-0">Term</span>
            <PillSelect
              options={scope.terms.map((t) => ({ id: t.id, label: t.name, locked: t.isLocked }))}
              value={scope.termId}
              onChange={scope.setTermId}
            />
          </div>
        </div>
      )}

      {showOverview && (
        <>
          {canDecide && !scope.isCurrentAcademicYear && exceededStudents?.length > 0 && (
            <div className="mb-4">
              <NotCurrentYearNotice yearName={selectedYear?.name} action="deliberation decisions can only be made" />
            </div>
          )}

          <div className={`grid gap-5 items-start ${deliberatedStudents.length > 0 ? "lg:grid-cols-2" : ""}`}>
            <DisciplineOverview records={records} />
            {deliberatedStudents.length > 0 && (
              <DeliberatedStudentsCard
                students={deliberatedStudents}
                termLabel={termLabel}
                canDecide={canDecide}
                canDecideNow={canDecideNow}
                onDecide={setDeliberationTarget}
              />
            )}
          </div>

          {pendingDeliberation.length > 0 && (
            <PendingDeliberationCard
              students={pendingDeliberation}
              termLabel={termLabel}
              canDecide={canDecide}
              canDecideNow={canDecideNow}
              onDecide={setDeliberationTarget}
            />
          )}

          {deliberationTarget && (
            <DeliberationModal
              student={deliberationTarget}
              termId={deliberationTarget.deliberation?.termId || scope.termId}
              academicYearId={scope.academicYearId}
              isCurrentAcademicYear={scope.isCurrentAcademicYear}
              onClose={() => setDeliberationTarget(null)}
              onSaved={() => {
                setDeliberationTarget(null);
                refreshExceeded();
              }}
            />
          )}
        </>
      )}
      {showMyReports && (
        <MyReportsOverview
          records={records}
          user={user}
          onRecordsChange={refreshRecords}
          isCurrentYear={scope.isCurrentAcademicYear}
          teacherClasses={scope.classes}
        />
      )}

      {!showMyReports && (
      <div>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Quick actions</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {["manager", "disciplinary_officer"].includes(user.sbmsRole) && (
            <QuickAction
              to="/report"
              icon={FlagTriangleRight}
              title="Report a mistake"
              description="Flag an incident for the discipline office."
              tone="reporter"
            />
          )}
          {["manager", "dean_of_discipline", "disciplinary_officer"].includes(user.sbmsRole) && (
            <QuickAction
              to="/records"
              icon={ClipboardList}
              title="Records"
              description="Pending reports and finalized records."
              tone="brand"
            />
          )}
          {["manager", "dean_of_discipline", "disciplinary_officer"].includes(user.sbmsRole) && (
            <QuickAction
              to="/class-report"
              icon={BarChart3}
              title="Class report"
              description="Termly and yearly conduct scores."
              tone="brand"
            />
          )}
          {["manager", "dean_of_discipline", "disciplinary_officer"].includes(user.sbmsRole) && (
            <QuickAction
              to="/yearly-report"
              icon={CalendarRange}
              title="Yearly report"
              description="Full-year conduct summary and deliberation decisions."
              tone="brand"
            />
          )}
          {["dean_of_discipline"].includes(user.sbmsRole) && (
            <QuickAction
              to="/misconduct-types"
              icon={ListChecks}
              title="Misconduct types"
              description="Catalog of offenses and default deductions."
              tone="brand"
            />
          )}
          {["dean_of_discipline", "manager", "disciplinary_officer"].includes(user.sbmsRole) && (
            <QuickAction
              to="/staff-roles"
              icon={UserCog}
              title="Staff roles"
              description="Assign Dean of Discipline and Officer access."
              tone="brand"
            />
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function QuickAction({ to, icon: Icon, title, description }) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl p-3.5 transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-md"
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
