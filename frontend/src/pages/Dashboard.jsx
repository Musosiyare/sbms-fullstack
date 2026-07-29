import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import { Table, Thead, Th, Td, EmptyRow } from "../components/ui/Table";
import { Field, Select, Textarea } from "../components/ui/FormField";
import { ErrorText, NotCurrentYearNotice } from "../components/ui/Alerts";
import EvidenceList from "../components/ui/EvidenceList";
import EvidenceUpload, { EvidenceFieldLabel } from "../components/ui/EvidenceUpload";
import { useConfirm } from "../components/ui/ConfirmProvider";
import { useScopePicker } from "../hooks/useScopePicker";
import PillSelect from "../components/ui/PillSelect";
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
function MyReportsOverview({ records, user, onRecordsChange, isCurrentYear = true }) {
  const [discussTarget, setDiscussTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
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

  // Keep the modal's data in sync after an evidence delete inside it.
  const viewRecord = viewTarget && mine ? mine.find((r) => r.id === viewTarget.id) || viewTarget : viewTarget;

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
                      <span className="inline-flex items-center gap-1.5">
                        {r.Student?.firstName} {r.Student?.lastName}
                        {r.evidence?.length > 0 && (
                          <Paperclip
                            size={12}
                            className="shrink-0 text-slate-400"
                            title={`${r.evidence.length} file(s) attached`}
                          />
                        )}
                      </span>
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
 * for one of the teacher's own reports. While the report hasn't been
 * approved yet, they can also fix the incident type/description here (and
 * attach more evidence), or delete the report entirely; both are blocked
 * the moment it's `finalized` (mirrors the backend rule).
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

  const canModify = record.reportedByUserId === currentUser.id && record.status !== "finalized";

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
          <p className="text-sm font-semibold text-slate-800">
            {record.Student?.firstName} {record.Student?.lastName}
          </p>
          <Badge tone={PUNISHED_TONE[record.status]}>{PUNISHED_LABEL[record.status]}</Badge>
        </div>

        {editing ? (
          <div className="flex flex-col gap-3 mt-1">
            <Field label="Incident">
              <Select value={misconductTypeId} onChange={(e) => setMisconductTypeId(e.target.value)} disabled={!types}>
                <option value="">{types ? "Select..." : "Loading..."}</option>
                {types?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {capitalizeFirst(t.title)} (-{t.defaultDeduction})
                  </option>
                ))}
              </Select>
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

const DECISION_LABEL = {
  dismissed_permanently: "Dismissed permanently",
  dismissed_term: "Dismissed for the term",
  retained: "Retained",
};
const DECISION_TONE = {
  dismissed_permanently: "danger",
  dismissed_term: "warning",
  retained: "ok",
};

/**
 * Discipline-office deliberation cards: every student in the selected
 * term who has used up all 40 of their conduct marks, with a decision
 * button for the Dean of Discipline / Disciplinary Officer / manager to
 * rule on — dismiss permanently, dismiss for the term, or retain them.
 * Already-decided students stay visible (their card shows the decision
 * made) so the office can revisit or undo a call without losing track of
 * who's already been handled this term.
 */
function ExceededMarksCard({ termId, academicYearId, termLabel, canDecide, isCurrentAcademicYear, academicYearName }) {
  const [students, setStudents] = useState(null);
  const [target, setTarget] = useState(null);
  const [pickedId, setPickedId] = useState("");

  function refresh() {
    if (!termId || !academicYearId) {
      setStudents([]);
      return;
    }
    getExceededStudents({ termId, academicYearId })
      .then(setStudents)
      .catch(() => setStudents([]));
  }

  useEffect(() => {
    refresh();
    setPickedId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId, academicYearId]);

  const pending = useMemo(() => students?.filter((s) => !s.deliberation) ?? [], [students]);
  const deliberated = useMemo(() => students?.filter((s) => s.deliberation) ?? [], [students]);
  const picked = deliberated.find((s) => String(s.studentId) === String(pickedId)) || null;

  // Deliberation is only ever a "right now" call — the list itself (and
  // any decision already on record) stays visible for older years so
  // history can still be reviewed, but making or undoing a decision is
  // reserved for the current academic year.
  const canDecideNow = canDecide && isCurrentAcademicYear;

  // Nothing loaded yet, or nobody's exceeded their marks at all this term
  // — neither section renders, rather than taking up space with an empty
  // state every time things are fine.
  if (!students || students.length === 0) return null;

  return (
    <>
      {canDecide && !isCurrentAcademicYear && (
        <NotCurrentYearNotice yearName={academicYearName} action="deliberation decisions can only be made" />
      )}

      {pending.length > 0 && (
        <Card
          title={
            <span className="inline-flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <Clock size={12} />
              </span>
              Awaiting deliberation
            </span>
          }
          subtitle={`${pending.length} student${pending.length === 1 ? "" : "s"} exceeded their conduct marks for ${termLabel || "this term"} and still need${pending.length === 1 ? "s" : ""} a decision.`}
        >
          <Table>
            <Thead>
              <tr>
                <Th>Student</Th>
                <Th>Class</Th>
                <Th>Marks</Th>
                {canDecide && <Th className="text-right">Action</Th>}
              </tr>
            </Thead>
            <tbody>
              {pending.map((s) => (
                <tr key={s.studentId}>
                  <Td className="font-medium text-slate-800">
                    {s.firstName} {s.lastName}
                    <span className="block text-xs font-normal text-slate-400">{s.admissionNumber || "—"}</span>
                  </Td>
                  <Td className="text-slate-600">{s.className || "—"}</Td>
                  <Td>
                    <Badge tone="danger">-{s.score.deducted}</Badge>
                  </Td>
                  {canDecide && (
                    <Td className="text-right">
                      <Button size="sm" variant="secondary" onClick={() => setTarget(s)} disabled={!canDecideNow}>
                        <Gavel size={13} /> Decide
                      </Button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {deliberated.length > 0 && (
        <Card
          title={
            <span className="inline-flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={12} />
              </span>
              Deliberated students
            </span>
          }
          subtitle={`${deliberated.length} student${deliberated.length === 1 ? "" : "s"} already decided for ${termLabel || "this term"} — pick a name to see the decision.`}
        >
          <Field label="Student">
            <Select value={pickedId} onChange={(e) => setPickedId(e.target.value)}>
              <option value="">Select a student...</option>
              {deliberated.map((s) => (
                <option key={s.studentId} value={s.studentId}>
                  {s.firstName} {s.lastName} — {DECISION_LABEL[s.deliberation.decision]}
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
                <Badge tone="danger">-{picked.score.deducted}</Badge>
              </div>
              <Badge tone={DECISION_TONE[picked.deliberation.decision]}>{DECISION_LABEL[picked.deliberation.decision]}</Badge>
              {picked.deliberation.reason && <p className="text-sm text-slate-600">{picked.deliberation.reason}</p>}
              <p className="text-xs text-slate-400">
                by {picked.deliberation.decidedBy || "—"} · {fmtDate(picked.deliberation.decidedAt)}
              </p>
              {canDecide && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setTarget(picked)}
                  disabled={!canDecideNow}
                  className="mt-1 self-start"
                >
                  <Gavel size={13} /> Change decision
                </Button>
              )}
            </div>
          )}
        </Card>
      )}

      {target && (
        <DeliberationModal
          student={target}
          termId={termId}
          academicYearId={academicYearId}
          isCurrentAcademicYear={isCurrentAcademicYear}
          onClose={() => setTarget(null)}
          onSaved={() => {
            setTarget(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

/** Modal to record (or change/undo) the discipline office's call on one exceeded student. */
function DeliberationModal({ student, termId, academicYearId, isCurrentAcademicYear = true, onClose, onSaved }) {
  const confirm = useConfirm();
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
      message: `${student.firstName} ${student.lastName} will go back to "awaiting decision" for this term.`,
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
          {student.deliberation && (
            <Button variant="ghost" onClick={handleUndo} disabled={saving || undoing || !isCurrentAcademicYear}>
              <Undo2 size={14} /> {undoing ? "Undoing..." : "Undo decision"}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saving || undoing}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || undoing || !isCurrentAcademicYear}>
            {saving ? "Saving..." : "Save decision"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!isCurrentAcademicYear && <NotCurrentYearNotice action="deliberation decisions can only be made" />}
        <p className="text-sm text-slate-500">
          {student.firstName} has used {student.score.deducted} of {student.score.maxMarks} marks this term
          ({student.score.remaining <= 0 ? "none remaining" : `${student.score.remaining} remaining`}).
        </p>
        <Field label="Decision">
          <Select value={decision} onChange={(e) => setDecision(e.target.value)} disabled={!isCurrentAcademicYear}>
            <option value="">Select...</option>
            <option value="dismissed_permanently">Dismiss permanently</option>
            <option value="dismissed_term">Dismiss for this term</option>
            <option value="retained">Retain student</option>
          </Select>
        </Field>
        <Field label="Reason / notes (optional)">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} disabled={!isCurrentAcademicYear} />
        </Field>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [records, setRecords] = useState(null);
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

  const selectedTerm = scope.terms.find((t) => String(t.id) === String(scope.termId));
  const selectedYear = scope.academicYears.find((y) => String(y.id) === String(scope.academicYearId));
  const termLabel = selectedTerm && selectedYear ? `${selectedTerm.name}, ${selectedYear.name}` : null;

  return (
    <div>
      <p className="text-slate-600 mb-6">Welcome back, {user.name?.split(" ")[0]}.</p>

      {(showOverview || showMyReports) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400 shrink-0">Year</span>
            <PillSelect
              options={scope.academicYears.map((y) => ({ id: y.id, label: y.name }))}
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

      {showOverview && <DisciplineOverview records={records} />}
      {showOverview && (
        <ExceededMarksCard
          termId={scope.termId}
          academicYearId={scope.academicYearId}
          termLabel={termLabel}
          canDecide={CAN_DECIDE.includes(user.sbmsRole)}
          isCurrentAcademicYear={scope.isCurrentAcademicYear}
          academicYearName={selectedYear?.name}
        />
      )}
      {showMyReports && (
        <MyReportsOverview
          records={records}
          user={user}
          onRecordsChange={refreshRecords}
          isCurrentYear={scope.isCurrentAcademicYear}
        />
      )}

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
