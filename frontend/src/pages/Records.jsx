import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import { Field, Select, Input, Textarea } from "../components/ui/FormField";
import { ErrorText, TermLockBadge, AllTermsLockedNotice, NotCurrentYearNotice } from "../components/ui/Alerts";
import EvidenceUpload, { EvidenceFieldLabel } from "../components/ui/EvidenceUpload";
import EvidenceList from "../components/ui/EvidenceList";
import { Table, Thead, Th, Td, EmptyRow } from "../components/ui/Table";
import Pagination from "../components/ui/Pagination";
import { useConfirm } from "../components/ui/ConfirmProvider";
import SearchableSelect from "../components/ui/SearchableSelect";
import { buildMisconductOptions } from "../utils/misconductOptions";
import { useScopePicker } from "../hooks/useScopePicker";
import {
  listRecords,
  approveRecord,
  rejectRecord,
  bulkApproveRecords,
  bulkRejectRecords,
  createRecord,
  bulkClassRecord,
  getMisconductTypes,
  getAcademicYears,
  getClasses,
  getStudents,
  getTerms,
  getWeekendPermission,
  getStudentScore,
} from "../api/sbms";
import { capitalizeFirst } from "../utils/text";
import { getAvatarColor } from "../utils/avatarColor";
import { exportWeekendPermissionPdf } from "../utils/pdf";
import { Plus, Check, X, ChevronDown, Eye, ClipboardList, Users, GraduationCap, Clock, AlertTriangle, MessageCircle, Paperclip, Download, Info } from "lucide-react";
import DiscussionModal from "../components/DiscussionModal";

const CAN_FINALIZE = ["dean_of_discipline", "disciplinary_officer"];
const STATUS_TONE = { finalized: "ok", pending: "warning", rejected: "danger" };
const STATUS_LABEL = { finalized: "Approved", pending: "Pending review", rejected: "Rejected" };
const DISCIPLINE_ROLE_LABEL = { dean_of_discipline: "Dean of Discipline", disciplinary_officer: "Disciplinary Officer" };
const ROLE_LABEL = { manager: "Manager", teacher: "Teacher", superuser: "Superuser", discipline: "Discipline Staff" };

/** Human-readable role for whoever reported/approved/rejected a record — discipline role takes priority when set. */
function roleLabel(u) {
  if (!u) return null;
  return DISCIPLINE_ROLE_LABEL[u.disciplineRole] || ROLE_LABEL[u.role] || null;
}

/** Fetches the Weekend Permission data for a finalized send-home record and triggers the PDF download. */
async function downloadWeekendPermission(recordId, studentName) {
  try {
    const data = await getWeekendPermission(recordId);
    exportWeekendPermissionPdf(data, `weekend-permission-${studentName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  } catch (err) {
    toast.error("Couldn't generate the permission slip", { description: err.message });
  }
}
// Mirrors the colored deduction pill used on the Misconduct Types page, so
// a record's marks read the same severity-tinted way wherever they appear.
const DEDUCTION_TONE = {
  minor: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
  moderate: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  severe: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

function MarksPill({ record }) {
  if (record.status !== "finalized") return <span className="text-slate-400">—</span>;
  const tone = DEDUCTION_TONE[record.MisconductType?.severity] || DEDUCTION_TONE.minor;
  return (
    <span className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums ${tone}`}>
      -{record.marksDeducted}
    </span>
  );
}
// Mirrors the backend's conductScoreService — kept in sync manually since
// there's no endpoint (yet) for a per-record running balance.
const MARKS_PER_TERM = 40;

/**
 * Sent-home date stacked above the return date (each in its own color so
 * they're never confused at a glance), plus whether the send-home period
 * is over yet — compared against today, day-precision.
 */
function SentHomeInfo({ from, to, showStatus = true }) {
  if (!from) return <span className="text-xs text-slate-400">No weekend</span>;

  let finished = null; // null = no return date to judge against
  if (to) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setHours(0, 0, 0, 0);
    finished = toDate < today;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-red-600 whitespace-nowrap">Out: {fmtDate(from)}</span>
      {to && <span className="text-xs font-medium text-teal-600 whitespace-nowrap">Back: {fmtDate(to)}</span>}
      {showStatus &&
        finished !== null &&
        (finished ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <Check size={12} /> Completed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
            <Clock size={12} /> Still away
          </span>
        ))}
    </div>
  );
}

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

/** Whether a send-home period's return date has already passed — the permission slip stops making sense once it has. */
function isSendHomeExpired(sentHomeTo) {
  if (!sentHomeTo) return false;
  return toDateOnly(new Date(sentHomeTo)) < toDateOnly(new Date());
}

/**
 * A Disciplinary Officer can only review (approve OR reject) incidents
 * that don't send a student home — mirrors the backend restriction in
 * approveOneRecord/rejectOneRecord. Dean of Discipline and managers
 * aren't restricted. Kept as officerCanApprove for backwards-compat call
 * sites, plus a same-behavior alias for reject.
 */
function officerCanApprove(user, record) {
  if (user.sbmsRole !== "disciplinary_officer") return true;
  return !record.MisconductType?.requiresSendHome;
}
const officerCanReject = officerCanApprove;

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : null;
}

// Mirrors the backend's resolveSendHomeRange: a fresh "from" of today, and
// "to" is (days - 1) later so "N days" means an N-day span. Just a starting
// point shown in the form — the officer can still edit either date.
function computeSendHomeRange(type) {
  if (!type?.requiresSendHome) return { from: "", to: "" };
  const from = new Date();
  const to = new Date(from);
  to.setDate(to.getDate() + Math.max((Number(type.sendHomeDays) || 1) - 1, 0));
  return { from: toDateOnly(from), to: toDateOnly(to) };
}

function SectionTabs({ active, onChange }) {
  const tabs = [
    { key: "reports", label: "All Reports", icon: ClipboardList },
    { key: "students", label: "Student Records", icon: Users },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 self-start">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150 ${
              isActive
                ? "bg-white text-brand-700 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon size={16} className={isActive ? "text-brand-600" : "text-slate-400"} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Records() {
  const { user } = useAuth();
  const canFinalize = CAN_FINALIZE.includes(user.sbmsRole);
  // Class-wide deduction is Dean of Discipline only — narrower than
  // canFinalize, which also includes Disciplinary Officers.
  const isDOD = user.sbmsRole === "dean_of_discipline";

  // Class/Yearly Report link here with ?tab=&status=&academicYearId=&classId=&search=
  // when a student has an unactioned report, so the queue opens already
  // narrowed to that student instead of making staff refind it.
  const location = useLocation();
  const [initialParams] = useState(() => new URLSearchParams(location.search));

  const [activeTab, setActiveTab] = useState(initialParams.get("tab") || "reports");
  const [statusFilter, setStatusFilter] = useState(initialParams.get("status") || "pending");
  const [pendingRecords, setPendingRecords] = useState(null);
  const [types, setTypes] = useState([]);
  const [approveTarget, setApproveTarget] = useState(null); // record being approved
  const [rejectTarget, setRejectTarget] = useState(null); // record being rejected
  const [discussTarget, setDiscussTarget] = useState(null); // record whose discussion thread is open
  const [showNewRecord, setShowNewRecord] = useState(false);
  const [showClassDeduct, setShowClassDeduct] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set()); // pending record ids picked for a bulk action
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);

  // Like the main system, "All Reports" is scoped to the current academic
  // year by default — old years' pending/approved/rejected reports don't
  // bleed into today's queue. Past years remain reachable via the picker,
  // but strictly for viewing: see isCurrentYearSelected below, which turns
  // off every action (approve/reject/new record) once a non-current year
  // is selected.
  const [academicYears, setAcademicYears] = useState([]);
  const [academicYearId, setAcademicYearId] = useState("");

  // Class filter — narrows "All Reports" down to one class at a time, and a
  // free-text search on student name, plus a weekend/send-home status
  // filter (all / currently away / already back / never sent home). The
  // class filter is passed to the backend (it already supports classId);
  // search and weekend status are derived client-side from what's loaded.
  const [reportClasses, setReportClasses] = useState([]);
  const [classFilter, setClassFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState(initialParams.get("search") || "");
  const [weekendFilter, setWeekendFilter] = useState("");

  useEffect(() => {
    getAcademicYears().then((years) => {
      setAcademicYears(years);
      const requestedYearId = initialParams.get("academicYearId");
      const requestedYear = requestedYearId && years.find((y) => String(y.id) === requestedYearId);
      const current = requestedYear || years.find((y) => y.isCurrent) || years[0];
      if (current) setAcademicYearId(String(current.id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setClassFilter("");
    if (!academicYearId) {
      setReportClasses([]);
      return;
    }
    getClasses(academicYearId).then((classes) => {
      setReportClasses(classes);
      const requestedClassId = initialParams.get("classId");
      if (requestedClassId && classes.find((c) => String(c.id) === requestedClassId)) {
        setClassFilter(requestedClassId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYearId]);

  const isCurrentYearSelected =
    !academicYearId || academicYears.find((y) => String(y.id) === String(academicYearId))?.isCurrent !== false;

  function refresh() {
    if (!academicYearId) return;
    const params = { academicYearId };
    if (statusFilter) params.status = statusFilter;
    if (classFilter) params.classId = classFilter;
    listRecords(params).then(setPendingRecords);
    setSelectedIds(new Set());
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, academicYearId, classFilter]);

  // Weekend status of a record: "away" = currently serving a send-home
  // period (today falls in [from, to], or from is set with no to yet),
  // "back" = the send-home period has ended, "none" = never sent home.
  function weekendStatus(r) {
    if (!r.sentHomeFrom) return "none";
    if (!r.sentHomeTo) return "away";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const to = new Date(r.sentHomeTo);
    to.setHours(0, 0, 0, 0);
    return to < today ? "back" : "away";
  }

  const visibleRecords = (pendingRecords || []).filter((r) => {
    if (weekendFilter && weekendStatus(r) !== weekendFilter) return false;
    if (searchQuery.trim()) {
      const name = `${r.Student?.firstName || ""} ${r.Student?.lastName || ""}`.toLowerCase();
      if (!name.includes(searchQuery.trim().toLowerCase())) return false;
    }
    return true;
  });

  // Search/weekend filters narrow what's on screen without refetching, so
  // drop any bulk selections that fall outside the currently visible set.
  useEffect(() => {
    setSelectedIds((prev) => {
      const visibleIds = new Set(visibleRecords.map((r) => r.id));
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, weekendFilter, pendingRecords]);

  // Pagination for the reports table — any filter change jumps back to
  // page 1 so you're never stranded on a now-empty page.
  const REPORTS_PAGE_SIZE = 10;
  const [reportsPage, setReportsPage] = useState(1);
  useEffect(() => {
    setReportsPage(1);
  }, [statusFilter, academicYearId, classFilter, searchQuery, weekendFilter]);
  const reportsPageCount = Math.max(1, Math.ceil(visibleRecords.length / REPORTS_PAGE_SIZE));
  const currentReportsPage = Math.min(reportsPage, reportsPageCount);
  const pagedRecords = visibleRecords.slice(
    (currentReportsPage - 1) * REPORTS_PAGE_SIZE,
    currentReportsPage * REPORTS_PAGE_SIZE
  );

  useEffect(() => {
    getMisconductTypes().then(setTypes);
  }, []);

  // Bulk actions only make sense while looking at pending reports for the
  // current year — approved/rejected ones have no action buttons to begin
  // with, and past years are view-only.
  const showBulkColumn = canFinalize && statusFilter === "pending" && isCurrentYearSelected;
  const pendingIds = showBulkColumn ? visibleRecords.filter((r) => r.status === "pending").map((r) => r.id) : [];
  const allSelected = pendingIds.length > 0 && pendingIds.every((id) => selectedIds.has(id));

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(pendingIds));
  }

  function toggleSelectOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionTabs active={activeTab} onChange={setActiveTab} />

      {activeTab === "reports" && (
      <Card
        title="All Reports"
        subtitle="Reports raised by staff, waiting on (or reviewed by) the discipline office."
        actions={
          canFinalize &&
          isCurrentYearSelected && (
            <div className="flex items-center gap-2">
              {isDOD && (
                <Button variant="secondary" onClick={() => setShowClassDeduct(true)}>
                  <Users size={15} /> Deduct from class
                </Button>
              )}
              <Button onClick={() => setShowNewRecord(true)}>
                <Plus size={15} /> New record
              </Button>
            </div>
          )
        }
      >
        <div className="mb-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Academic year">
            <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.isCurrent ? " (current)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="pending">Pending review</option>
              <option value="finalized">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </Select>
          </Field>
          <Field label="Class">
            <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} disabled={!reportClasses.length}>
              <option value="">All classes</option>
              {reportClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Weekend status">
            <Select value={weekendFilter} onChange={(e) => setWeekendFilter(e.target.value)}>
              <option value="">All</option>
              <option value="away">Currently away</option>
              <option value="back">Returned</option>
              <option value="none">Never sent home</option>
            </Select>
          </Field>
          <Field label="Search student" className="sm:col-span-2 lg:col-span-1">
            <Input
              type="text"
              placeholder="Search by student name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </Field>
        </div>

        {!isCurrentYearSelected && (
          <p className="mb-4 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5">
            You're viewing a past academic year — reports here are read-only. Switch to the current year to approve,
            reject, or add new records.
          </p>
        )}

        {showBulkColumn && selectedIds.size > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50/60 px-4 py-2.5">
            <span className="text-sm font-medium text-brand-800">
              {selectedIds.size} selected
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => setBulkApproveOpen(true)}>
                <Check size={14} /> Approve all
              </Button>
              <Button size="sm" variant="danger" onClick={() => setBulkRejectOpen(true)}>
                <X size={14} /> Reject all
              </Button>
            </div>
          </div>
        )}

        <Table>
          <Thead>
            <tr>
              {showBulkColumn && (
                <Th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all pending reports"
                  />
                </Th>
              )}
              <Th>Student</Th>
              <Th>Incident</Th>
              <Th>Marks</Th>
              <Th>Sent home</Th>
              <Th>Status</Th>
              <Th>Reported</Th>
              <Th>Reviewed</Th>
              <Th></Th>
              {canFinalize && isCurrentYearSelected && <Th></Th>}
            </tr>
          </Thead>
          <tbody>
            {pendingRecords === null ? (
              <EmptyRow colSpan={(showBulkColumn ? 1 : 0) + 8 + (canFinalize && isCurrentYearSelected ? 1 : 0)}>
                Loading...
              </EmptyRow>
            ) : visibleRecords.length === 0 ? (
              <EmptyRow colSpan={(showBulkColumn ? 1 : 0) + 8 + (canFinalize && isCurrentYearSelected ? 1 : 0)}>
                {pendingRecords.length === 0 ? undefined : "No reports match these filters."}
              </EmptyRow>
            ) : (
              pagedRecords.map((r) => (
                <tr key={r.id}>
                  {showBulkColumn && (
                    <Td>
                      {r.status === "pending" && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelectOne(r.id)}
                          aria-label={`Select report for ${r.Student?.firstName} ${r.Student?.lastName}`}
                        />
                      )}
                    </Td>
                  )}
                  <Td>
                    {r.Student?.firstName} {r.Student?.lastName}
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      {capitalizeFirst(r.MisconductType?.title) || r.customTitle || "—"}
                      {r.evidence?.length > 0 && (
                        <Paperclip size={12} className="shrink-0 text-slate-400" title={`${r.evidence.length} file(s) attached`} />
                      )}
                    </span>
                  </Td>
                  <Td>
                    <MarksPill record={r} />
                  </Td>
                  <Td>
                    <SentHomeInfo from={r.sentHomeFrom} to={r.sentHomeTo} />
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </Td>
                  <Td>
                    {r.reportedBy || r.finalizedBy ? (
                      <>
                        <p className="text-slate-700">{(r.reportedBy || r.finalizedBy).name}</p>
                        {roleLabel(r.reportedBy || r.finalizedBy) && (
                          <p className="text-xs text-slate-400">{roleLabel(r.reportedBy || r.finalizedBy)}</p>
                        )}
                        <p className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</p>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td>
                    {r.status === "finalized" && r.finalizedBy ? (
                      <>
                        <p className="text-slate-700">{r.finalizedBy.name}</p>
                        {roleLabel(r.finalizedBy) && <p className="text-xs text-slate-400">{roleLabel(r.finalizedBy)}</p>}
                        <p className="text-xs text-slate-400">{new Date(r.finalizedAt).toLocaleDateString()}</p>
                        {r.sentHomeFrom && r.sentHomeTo && user.sbmsRole !== "disciplinary_officer" && (
                          <button
                            type="button"
                            onClick={() =>
                              downloadWeekendPermission(r.id, `${r.Student?.firstName || ""} ${r.Student?.lastName || ""}`)
                            }
                            className={`mt-1 inline-flex items-center gap-1 text-xs font-medium hover:underline ${
                              isSendHomeExpired(r.sentHomeTo) ? "text-amber-600" : "text-brand-600"
                            }`}
                          >
                            <Download size={12} /> Permission
                          </button>
                        )}
                      </>
                    ) : r.status === "rejected" && r.rejectedBy ? (
                      <>
                        <p className="text-slate-700">{r.rejectedBy.name}</p>
                        {roleLabel(r.rejectedBy) && <p className="text-xs text-slate-400">{roleLabel(r.rejectedBy)}</p>}
                        <p className="text-xs text-slate-400">{new Date(r.rejectedAt).toLocaleDateString()}</p>
                        <p className="text-xs text-red-500 italic mt-0.5 max-w-[180px]" title={r.rejectionReason}>
                          "{r.rejectionReason}"
                        </p>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1 items-start">
                      <Button size="sm" variant="secondary" onClick={() => setDiscussTarget(r)}>
                        <MessageCircle size={14} /> Discuss
                      </Button>
                    </div>
                  </Td>
                  {canFinalize && isCurrentYearSelected && (
                    <Td>
                      {r.status === "pending" && (
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex gap-2 justify-end">
                            {officerCanApprove(user, r) && (
                              <Button
                                size="sm"
                                variant="primary"
                                className="!px-2"
                                title="Approve"
                                aria-label="Approve"
                                onClick={() => setApproveTarget(r)}
                              >
                                <Check size={14} />
                              </Button>
                            )}
                            {officerCanReject(user, r) && (
                              <Button
                                size="sm"
                                variant="danger"
                                className="!px-2"
                                title="Reject"
                                aria-label="Reject"
                                onClick={() => setRejectTarget(r)}
                              >
                                <X size={14} />
                              </Button>
                            )}
                          </div>
                          {!officerCanApprove(user, r) && (
                            <span className="text-xs text-slate-400 whitespace-nowrap">Needs Dean of Discipline</span>
                          )}
                        </div>
                      )}
                    </Td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </Table>

        {visibleRecords.length > 0 && (
          <Pagination
            page={currentReportsPage}
            pageCount={reportsPageCount}
            totalItems={visibleRecords.length}
            pageSize={REPORTS_PAGE_SIZE}
            onPageChange={setReportsPage}
            className="mt-4"
          />
        )}
      </Card>
      )}

      {activeTab === "students" && <ClassBrowser />}

      {approveTarget && (
        <ApproveModal
          record={approveTarget}
          onClose={() => setApproveTarget(null)}
          onDone={() => {
            setApproveTarget(null);
            refresh();
          }}
        />
      )}

      {rejectTarget && (
        <RejectModal
          record={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={() => {
            setRejectTarget(null);
            refresh();
          }}
        />
      )}

      {bulkApproveOpen && (
        <BulkApproveModal
          ids={[...selectedIds]}
          records={pendingRecords || []}
          onClose={() => setBulkApproveOpen(false)}
          onDone={() => {
            setBulkApproveOpen(false);
            refresh();
          }}
        />
      )}

      {bulkRejectOpen && (
        <BulkRejectModal
          ids={[...selectedIds]}
          records={pendingRecords || []}
          onClose={() => setBulkRejectOpen(false)}
          onDone={() => {
            setBulkRejectOpen(false);
            refresh();
          }}
        />
      )}

      {showNewRecord && (
        <NewRecordModal
          types={types}
          onClose={() => setShowNewRecord(false)}
          onDone={() => {
            setShowNewRecord(false);
            refresh();
          }}
        />
      )}

      {showClassDeduct && (
        <ClassDeductModal
          types={types}
          onClose={() => setShowClassDeduct(false)}
          onDone={() => {
            setShowClassDeduct(false);
            refresh();
          }}
        />
      )}

      {discussTarget && (
        <DiscussionModal
          record={discussTarget}
          currentUser={user}
          onClose={() => setDiscussTarget(null)}
          isCurrentYear={isCurrentYearSelected}
        />
      )}
    </div>
  );
}

/**
 * Classes -> students -> "view" drill-down. A student can have many
 * incidents over time, so rather than one long flat table of every record
 * for every student, this groups by class first: toggle a class open to
 * see its roster, then open a student to see their full history
 * (StudentRecordsModal).
 */
function ClassBrowser() {
  const { user } = useAuth();
  const [academicYears, setAcademicYears] = useState([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [terms, setTerms] = useState([]);
  const [termId, setTermId] = useState("");
  const [classes, setClasses] = useState(null);
  const [expandedClassId, setExpandedClassId] = useState(null);
  const [studentsByClass, setStudentsByClass] = useState({}); // classId -> students[]
  const [countsByKey, setCountsByKey] = useState({}); // "classId:termId" -> { studentId: { total, pending } }
  const [onWeekendByClass, setOnWeekendByClass] = useState({}); // classId -> Set(studentId currently sent home)
  const [loadingClassId, setLoadingClassId] = useState(null);
  const [viewStudent, setViewStudent] = useState(null); // { id, firstName, lastName } whose history is open

  // Pagination — the class list can page (a school might run many classes
  // per year), and each expanded roster pages independently per class so
  // opening a different class doesn't reset another one's page.
  const CLASSES_PAGE_SIZE = 10;
  const ROSTER_PAGE_SIZE = 10;
  const [classesPage, setClassesPage] = useState(1);
  const [rosterPageByClass, setRosterPageByClass] = useState({}); // classId -> page

  useEffect(() => {
    getAcademicYears().then((years) => {
      setAcademicYears(years);
      const current = years.find((y) => y.isCurrent) || years[0];
      if (current) setAcademicYearId(String(current.id));
    });
  }, []);

  useEffect(() => {
    if (!academicYearId) return;
    setExpandedClassId(null);
    setClasses(null);
    setTermId("");
    setClassesPage(1);
    setRosterPageByClass({});
    getTerms(academicYearId).then(setTerms);
    getClasses(academicYearId).then(setClasses);
  }, [academicYearId]);

  function countsKey(classId) {
    return `${classId}:${termId || "all"}`;
  }

  // Fetches fresh per-student counts (total incidents + still-pending ones)
  // for a class, bypassing the cache — used both for the first load and to
  // refresh after an approve/reject so the roster badge's color is never
  // stale about whether a student still has something awaiting review.
  async function fetchCounts(classId) {
    const key = countsKey(classId);
    const records = await listRecords(termId ? { classId, termId } : { classId });
    const counts = {};
    records.forEach((r) => {
      const entry = counts[r.studentId] || { total: 0, pending: 0 };
      entry.total += 1;
      if (r.status === "pending") entry.pending += 1;
      counts[r.studentId] = entry;
    });
    setCountsByKey((prev) => ({ ...prev, [key]: counts }));
  }

  async function loadCounts(classId) {
    if (countsByKey[countsKey(classId)]) return;
    await fetchCounts(classId);
  }

  // Called after a report is approved/rejected from the student history
  // modal so the roster's badge color updates immediately instead of
  // waiting for the next class/term switch to re-fetch.
  function refreshExpandedCounts() {
    if (expandedClassId) fetchCounts(expandedClassId);
  }

  // Whether a student is currently sent home is a today-vs-date check, not
  // a per-term one, so this is cached per class only and not refetched
  // when the term filter changes.
  async function loadWeekendStatus(classId) {
    if (onWeekendByClass[classId]) return;
    const records = await listRecords({ classId, status: "finalized" });
    const today = toDateOnly(new Date());
    const onWeekend = new Set();
    records.forEach((r) => {
      if (r.sentHomeFrom && r.sentHomeTo && r.sentHomeFrom <= today && r.sentHomeTo >= today) {
        onWeekend.add(r.studentId);
      }
    });
    setOnWeekendByClass((prev) => ({ ...prev, [classId]: onWeekend }));
  }

  async function toggleClass(classId) {
    if (expandedClassId === classId) {
      setExpandedClassId(null);
      return;
    }
    setExpandedClassId(classId);
    setRosterPageByClass((prev) => ({ ...prev, [classId]: 1 }));
    setLoadingClassId(classId);
    if (!studentsByClass[classId]) {
      const students = await getStudents(classId);
      setStudentsByClass((prev) => ({ ...prev, [classId]: students }));
    }
    await Promise.all([loadCounts(classId), loadWeekendStatus(classId)]);
    setLoadingClassId(null);
  }

  // The term filter changes what "incidents" means for whichever class is
  // currently open, so refresh just that class's counts (cached per term).
  useEffect(() => {
    if (expandedClassId) loadCounts(expandedClassId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  return (
    <Card title="Student Records" subtitle="Open a class to see its students, then view a student's full incident history.">
      <div className="grid sm:grid-cols-2 gap-4 mb-5 max-w-md">
        <Field label="Academic year">
          <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Term">
          <Select value={termId} onChange={(e) => setTermId(e.target.value)} disabled={!terms.length}>
            <option value="">All terms</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {classes === null ? (
        <p className="text-sm text-slate-400 py-6 text-center">Loading classes...</p>
      ) : classes.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">No classes found for this academic year.</p>
      ) : (
        <>
        <div className="flex flex-col gap-2.5">
          {classes
            .slice((classesPage - 1) * CLASSES_PAGE_SIZE, classesPage * CLASSES_PAGE_SIZE)
            .map((c) => {
            const isOpen = expandedClassId === c.id;
            const students = studentsByClass[c.id] || [];
            const counts = countsByKey[countsKey(c.id)] || {};
            const onWeekend = onWeekendByClass[c.id] || new Set();
            const flagged = students.filter((s) => (counts[s.id]?.total || 0) >= 3).length;
            const boysCount = students.filter((s) => s.sex === "M").length;
            const girlsCount = students.filter((s) => s.sex === "F").length;
            const rosterPage = rosterPageByClass[c.id] || 1;
            const rosterPageCount = Math.max(1, Math.ceil(students.length / ROSTER_PAGE_SIZE));
            const pagedStudents = students.slice(
              (rosterPage - 1) * ROSTER_PAGE_SIZE,
              rosterPage * ROSTER_PAGE_SIZE
            );
            return (
              <div
                key={c.id}
                className={`rounded-xl border transition-colors duration-150 ${
                  isOpen ? "border-brand-200 bg-white shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleClass(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      isOpen ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <GraduationCap size={18} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-slate-800">{c.name}</span>
                    {students.length > 0 ? (
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 mt-0.5">
                        <span>
                          {students.length} student{students.length === 1 ? "" : "s"}
                        </span>
                        {boysCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                            {boysCount} boy{boysCount === 1 ? "" : "s"}
                          </span>
                        )}
                        {girlsCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                            {girlsCount} girl{girlsCount === 1 ? "" : "s"}
                          </span>
                        )}
                        {flagged > 0 && <span>· {flagged} flagged</span>}
                      </span>
                    ) : (
                      <span className="block text-xs text-slate-400 mt-0.5">Tap to view roster</span>
                    )}
                  </span>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-brand-100/80 px-2.5 pb-2.5">
                    {loadingClassId === c.id ? (
                      <p className="text-sm text-slate-400 px-2.5 py-4">Loading students...</p>
                    ) : students.length === 0 ? (
                      <p className="text-sm text-slate-400 px-2.5 py-4">No students in this class.</p>
                    ) : (
                      <>
                      <div className="flex flex-col gap-1 pt-2.5">
                        {pagedStudents.map((s) => {
                          const c = counts[s.id] || { total: 0, pending: 0 };
                          const isOnWeekend = onWeekend.has(s.id);
                          const initials = `${s.firstName?.[0] || ""}${s.lastName?.[0] || ""}`.toUpperCase();
                          const avatarColor = getAvatarColor(`${s.firstName || ""} ${s.lastName || ""}`);
                          return (
                            <div
                              key={s.id}
                              className={`flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-brand-50 transition-colors ${
                                isOnWeekend ? "bg-amber-50/60" : ""
                              }`}
                            >
                              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor}`}>
                                {initials}
                              </span>
                              <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">
                                {s.firstName} {s.lastName}
                              </span>
                              {isOnWeekend && (
                                <Badge tone="warning">On weekend</Badge>
                              )}
                              {c.total ? (
                                <button
                                  type="button"
                                  onClick={() => setViewStudent(s)}
                                  className="shrink-0"
                                  aria-label={`View ${s.firstName} ${s.lastName}'s incidents`}
                                >
                                  <Badge
                                    tone={c.pending === 0 ? "ok" : c.total >= 3 ? "danger" : "warning"}
                                    className="cursor-pointer"
                                  >
                                    {c.total} incident{c.total === 1 ? "" : "s"}
                                  </Badge>
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400 whitespace-nowrap">No incidents</span>
                              )}
                              <button
                                type="button"
                                onClick={() => setViewStudent(s)}
                                className="flex items-center justify-center rounded-md p-1.5 text-slate-900 hover:bg-brand-100 shrink-0 transition-colors"
                                aria-label={`View ${s.firstName} ${s.lastName}'s incidents`}
                              >
                                <Eye size={15} strokeWidth={1.75} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {students.length > ROSTER_PAGE_SIZE && (
                        <Pagination
                          page={Math.min(rosterPage, rosterPageCount)}
                          pageCount={rosterPageCount}
                          totalItems={students.length}
                          pageSize={ROSTER_PAGE_SIZE}
                          onPageChange={(p) => setRosterPageByClass((prev) => ({ ...prev, [c.id]: p }))}
                          className="px-2.5 pt-3"
                        />
                      )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {classes.length > CLASSES_PAGE_SIZE && (
          <Pagination
            page={classesPage}
            pageCount={Math.max(1, Math.ceil(classes.length / CLASSES_PAGE_SIZE))}
            totalItems={classes.length}
            pageSize={CLASSES_PAGE_SIZE}
            onPageChange={setClassesPage}
            className="mt-4"
          />
        )}
        </>
      )}

      {viewStudent && (
        <StudentRecordsModal
          student={viewStudent}
          currentUser={user}
          onClose={() => setViewStudent(null)}
          onRecordChanged={refreshExpandedCounts}
        />
      )}
    </Card>
  );
}

/**
 * A single student's full incident history, grouped by term (each record
 * captures its own termId/academicYearId at creation time, per the model
 * comment). Within a group, marks are applied in chronological order to
 * show a running "remaining" balance — mirrors conductScoreService's
 * MARKS_PER_TERM-based math, just recomputed per-record here since there's
 * no running-balance endpoint.
 */
function StudentRecordsModal({ student, currentUser, onClose, onRecordChanged }) {
  const [records, setRecords] = useState(null);
  const [termLabels, setTermLabels] = useState({}); // termId -> "Term 2 · 2025-2026"
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);

  const canFinalize = CAN_FINALIZE.includes(currentUser.sbmsRole);

  function refresh() {
    listRecords({ studentId: student.id }).then(setRecords);
  }

  useEffect(() => {
    refresh();
  }, [student.id]);

  useEffect(() => {
    if (!records || records.length === 0) return;
    const yearIds = [...new Set(records.map((r) => r.academicYearId))];
    Promise.all([getAcademicYears(), Promise.all(yearIds.map((yid) => getTerms(yid)))]).then(
      ([years, termLists]) => {
        const yearNameById = {};
        years.forEach((y) => {
          yearNameById[y.id] = y.name;
        });
        const labels = {};
        termLists.flat().forEach((t) => {
          labels[t.id] = `${t.name} · ${yearNameById[t.academicYearId] || ""}`.trim();
        });
        setTermLabels(labels);
      }
    );
  }, [records]);

  const groups = groupRecordsByTerm(records, termLabels);

  return (
    <Modal
      open
      onClose={onClose}
      title={`${student.firstName} ${student.lastName} — incident history`}
      size="full"
    >
      {records === null ? (
        <p className="text-sm text-slate-400 py-8 text-center">Loading...</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">No incidents recorded for this student.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-700">{group.label}</h4>
                <Badge tone={group.finalRemaining < MARKS_PER_TERM / 2 ? "danger" : "ok"}>
                  {group.finalRemaining}/{MARKS_PER_TERM} remaining
                </Badge>
              </div>
              <div className="flex flex-col gap-2.5">
                {group.records.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-800">
                            {capitalizeFirst(r.MisconductType?.title) || r.customTitle || "—"}
                          </p>
                          <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        </div>
                        {r.description && <p className="text-xs text-slate-400 mt-0.5">{r.description}</p>}
                        {r.status === "rejected" && r.rejectionReason && (
                          <p className="text-xs text-red-500 italic mt-1" title={r.rejectionReason}>
                            "{r.rejectionReason}"
                          </p>
                        )}
                        {r.status === "pending" && canFinalize && !officerCanApprove(currentUser, r) && (
                          <p className="text-xs text-slate-400 mt-1">Needs Dean of Discipline</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <MarksPill record={r} />
                        {r.remainingAfter !== null && (
                          <span className="text-xs text-slate-400 whitespace-nowrap">
                            {r.remainingAfter}/{MARKS_PER_TERM} left
                          </span>
                        )}
                        {r.status === "pending" && canFinalize && (
                          <div className="flex items-center gap-1.5">
                            {officerCanApprove(currentUser, r) && (
                              <Button
                                size="sm"
                                variant="primary"
                                className="!px-2"
                                title="Approve"
                                aria-label="Approve"
                                onClick={() => setApproveTarget(r)}
                              >
                                <Check size={14} />
                              </Button>
                            )}
                            {officerCanReject(currentUser, r) && (
                              <Button
                                size="sm"
                                variant="danger"
                                className="!px-2"
                                title="Reject"
                                aria-label="Reject"
                                onClick={() => setRejectTarget(r)}
                              >
                                <X size={14} />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
                      <span className="whitespace-nowrap self-start">{fmtDate(r.createdAt)}</span>
                      {r.reportedBy?.name && (
                        <div className="whitespace-nowrap">
                          <p>
                            Reported by <span className="text-slate-700 font-medium">{r.reportedBy.name}</span>
                          </p>
                          {roleLabel(r.reportedBy) && <p className="text-slate-400">{roleLabel(r.reportedBy)}</p>}
                        </div>
                      )}
                      {r.finalizedBy?.name && (
                        <div className="whitespace-nowrap">
                          <p>
                            Approved by <span className="text-slate-700 font-medium">{r.finalizedBy.name}</span>
                          </p>
                          {roleLabel(r.finalizedBy) && <p className="text-slate-400">{roleLabel(r.finalizedBy)}</p>}
                        </div>
                      )}
                    </div>

                    {r.sentHomeFrom && (
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <SentHomeInfo from={r.sentHomeFrom} to={r.sentHomeTo} showStatus={false} />
                      </div>
                    )}

                    {r.evidence?.length > 0 && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                        <EvidenceList record={r} currentUser={currentUser} onChange={refresh} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {approveTarget && (
        <ApproveModal
          record={approveTarget}
          onClose={() => setApproveTarget(null)}
          onDone={() => {
            setApproveTarget(null);
            refresh();
            onRecordChanged?.();
          }}
        />
      )}

      {rejectTarget && (
        <RejectModal
          record={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={() => {
            setRejectTarget(null);
            refresh();
            onRecordChanged?.();
          }}
        />
      )}
    </Modal>
  );
}

/** Groups a student's records by term and computes a running marks balance. */


function groupRecordsByTerm(records, termLabels) {
  if (!records || records.length === 0) return [];

  const byKey = new Map();
  records.forEach((r) => {
    const key = `${r.academicYearId}-${r.termId}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  });

  const groups = [...byKey.entries()].map(([key, recs]) => {
    const chronological = [...recs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    let running = MARKS_PER_TERM;
    const withRunning = chronological.map((r) => {
      if (r.status === "finalized") running -= r.marksDeducted;
      return { ...r, remainingAfter: r.status === "finalized" ? running : null };
    });
    return {
      key,
      label: termLabels[recs[0].termId] || "Term",
      finalRemaining: running,
      sortDate: chronological[chronological.length - 1]?.createdAt,
      records: [...withRunning].reverse(), // newest first for display
    };
  });

  groups.sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));
  return groups;
}


/**
 * Approving is deliberately just a confirmation, not a form — marks are
 * pulled straight from the incident's own default deduction (set by the
 * Dean of Discipline when the catalog entry was created), never re-typed
 * here. The only thing left to optionally add is a sent-home date range.
 */
function ApproveModal({ record, onClose, onDone }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const requiresSendHome = record.MisconductType?.requiresSendHome;
  const officerBlocked = user.sbmsRole === "disciplinary_officer" && requiresSendHome;
  const defaultRange = requiresSendHome ? computeSendHomeRange(record.MisconductType) : { from: "", to: "" };
  const [sentHomeFrom, setSentHomeFrom] = useState(defaultRange.from);
  const [sentHomeTo, setSentHomeTo] = useState(defaultRange.to);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);

  const deduction = record.MisconductType?.defaultDeduction;
  const studentName = `${record.Student?.firstName || ""} ${record.Student?.lastName || ""}`;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const ok = await confirm({
      title: "Confirm mark deduction",
      message: (
        <>
          This will approve the report on{" "}
          <strong className="font-semibold text-black">{studentName.trim()}</strong> and deduct {deduction}{" "}
          mark{deduction === 1 ? "" : "s"} from them for "
          {capitalizeFirst(record.MisconductType?.title) || record.customTitle || "this incident"}". Once approved,
          this can't be undone. Deduct the marks?
        </>
      ),
      confirmText: `Yes, deduct ${deduction} mark${deduction === 1 ? "" : "s"}`,
      tone: "danger",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const result = await approveRecord(record.id, {
        sentHomeFrom: sentHomeFrom || undefined,
        sentHomeTo: sentHomeTo || undefined,
      });
      toast.success("Report approved", {
        description: `${deduction} mark${deduction === 1 ? "" : "s"} deducted from ${record.Student?.firstName}.`,
      });
      if (result.marksExceeded) {
        toast.warning("Student has used up all conduct marks allowed this term", {
          description: `${studentName.trim()} — refer for deliberation.`,
        });
      }
      // A send-home incident means there's now a permission slip to hand
      // the student — pause here so it can be downloaded right away,
      // instead of closing straight back to the list.
      if (requiresSendHome) {
        setApproved(true);
      } else {
        onDone();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Approve report" size="sm">
      <div className="mb-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
        <p className="font-medium text-slate-800">
          {record.Student?.firstName} {record.Student?.lastName}
        </p>
        <p>{capitalizeFirst(record.MisconductType?.title) || record.customTitle || "No incident type given"}</p>
        {record.description && <p className="mt-1 text-slate-500">{record.description}</p>}
        {record.evidence?.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-200">
            <EvidenceList record={record} readOnly />
          </div>
        )}
        {(record.reportedBy || record.finalizedBy) && (
          <div className="mt-1 text-xs text-slate-400">
            <p>
              Reported by {(record.reportedBy || record.finalizedBy).name} on{" "}
              {new Date(record.createdAt).toLocaleDateString()}
            </p>
            {roleLabel(record.reportedBy || record.finalizedBy) && (
              <p>{roleLabel(record.reportedBy || record.finalizedBy)}</p>
            )}
          </div>
        )}
      </div>

      {approved ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-700 flex items-start gap-2.5">
            <Check size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Approved</p>
              <p className="mt-0.5 text-emerald-600/90">
                {isSendHomeExpired(sentHomeTo)
                  ? "The send-home period is recorded, but the return date entered has already passed — the permission slip will be stamped EXPIRED."
                  : "The send-home period is recorded — download the permission slip for the Dean of Discipline to sign and hand to the student."}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onDone}>
              Done
            </Button>
            <Button type="button" onClick={() => downloadWeekendPermission(record.id, studentName)}>
              <Download size={14} /> Download permission
            </Button>
          </div>
        </div>
      ) : officerBlocked ? (
        <div className="flex flex-col gap-4">
          <ErrorText>
            This incident sends the student home, so it needs the Dean of Discipline's review — Disciplinary
            Officers can only approve incidents that don't.
          </ErrorText>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {deduction !== undefined ? (
          <p className="text-sm text-slate-600">
            Approving will deduct <span className="font-semibold text-slate-800">{deduction}</span> mark
            {deduction === 1 ? "" : "s"} from {record.Student?.firstName}, as set for this incident.
          </p>
        ) : (
          <ErrorText>
            This report has no incident type on file, so marks can't be applied automatically — reject it and ask
            for it to be resubmitted from the incident list.
          </ErrorText>
        )}
        {requiresSendHome && (
          <>
            <p className="-mb-2 text-xs text-amber-600">
              This incident sends the student home — dates below were filled in automatically; adjust if needed.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Sent home from">
                <Input type="date" value={sentHomeFrom} onChange={(e) => setSentHomeFrom(e.target.value)} />
              </Field>
              <Field label="Sent home to">
                <Input type="date" value={sentHomeTo} onChange={(e) => setSentHomeTo(e.target.value)} />
              </Field>
            </div>
          </>
        )}
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || deduction === undefined}>
            {submitting ? "Approving..." : "Approve"}
          </Button>
        </div>
      </form>
      )}
    </Modal>
  );
}

function RejectModal({ record, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!reason.trim()) {
      setError("A reason is required to reject a report.");
      return;
    }
    setSubmitting(true);
    try {
      await rejectRecord(record.id, reason.trim());
      toast.success("Report rejected");
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Reject report" size="sm">
      <div className="mb-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
        <p className="font-medium text-slate-800">
          {record.Student?.firstName} {record.Student?.lastName}
        </p>
        <p>{capitalizeFirst(record.MisconductType?.title) || record.customTitle || "No incident type given"}</p>
        {record.description && <p className="mt-1 text-slate-500">{record.description}</p>}
        {record.evidence?.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-200">
            <EvidenceList record={record} readOnly />
          </div>
        )}
        {record.reportedBy && (
          <div className="mt-1 text-xs text-slate-400">
            <p>
              Reported by {record.reportedBy.name} on {new Date(record.createdAt).toLocaleDateString()}
            </p>
            {roleLabel(record.reportedBy) && <p>{roleLabel(record.reportedBy)}</p>}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Reason for rejection">
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why isn't this being recorded..."
            autoFocus
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={submitting}>
            {submitting ? "Rejecting..." : "Reject"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Approves every selected pending report in one go — marks/send-home
 * dates are auto-computed per report from its own incident type, same as
 * a single approve, so there's nothing to fill in here beyond confirming
 * the count. Any report that can't be approved (no incident type on
 * file, student already serving a send-home period, etc.) is called out
 * by name afterward instead of silently blocking the rest.
 */
function BulkApproveModal({ ids, records, onClose, onDone }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { approved, failed } once submitted

  const recordById = Object.fromEntries(records.map((r) => [r.id, r]));
  // A Disciplinary Officer can't approve send-home incidents — leave
  // those out of the batch instead of letting them show up as failures.
  const approvableIds = ids.filter((id) => officerCanApprove(user, recordById[id] || {}));
  const blockedIds = ids.filter((id) => !approvableIds.includes(id));

  async function handleConfirm() {
    setError("");
    const ok = await confirm({
      title: "Confirm bulk approval",
      message: `This will approve ${approvableIds.length} report${
        approvableIds.length === 1 ? "" : "s"
      } and deduct marks from each student involved, using each incident's own default deduction. This can't be undone. Approve and deduct marks now?`,
      confirmText: `Yes, approve ${approvableIds.length}`,
      tone: "danger",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await bulkApproveRecords(approvableIds);
      if (res.failed.length === 0) {
        toast.success(`${res.approved.length} report${res.approved.length === 1 ? "" : "s"} approved`);
        onDone();
      } else {
        setResult(res);
        toast.success(`${res.approved.length} approved, ${res.failed.length} failed`);
      }
      if (res.exceededStudents?.length) {
        const names = res.exceededStudents.map((s) => `${s.firstName} ${s.lastName}`).join(", ");
        toast.warning(
          `${res.exceededStudents.length} student${res.exceededStudents.length === 1 ? " has" : "s have"} used up all conduct marks allowed this term`,
          { description: `${names} — refer for deliberation.` }
        );
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Approve selected reports" size="sm">
      {!result ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Approve <span className="font-semibold text-slate-800">{approvableIds.length}</span> report
            {approvableIds.length === 1 ? "" : "s"}? Marks will be deducted automatically for each, using its own
            incident type's default.
          </p>
          {blockedIds.length > 0 && (
            <p className="text-xs text-amber-600">
              {blockedIds.length} of your {ids.length} selected reports send a student home and need the Dean of
              Discipline's review — those will stay pending and won't be included.
            </p>
          )}
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={submitting || approvableIds.length === 0}
              onClick={handleConfirm}
            >
              {submitting ? "Approving..." : `Approve ${approvableIds.length}`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            {result.approved.length} report{result.approved.length === 1 ? "" : "s"} approved.{" "}
            {result.failed.length} couldn't be approved:
          </p>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {result.failed.map((f) => {
              const r = recordById[f.id];
              return (
                <div key={f.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm">
                  <p className="font-medium text-slate-800">
                    {r ? `${r.Student?.firstName} ${r.Student?.lastName}` : `Report #${f.id}`}
                  </p>
                  <p className="text-red-600 text-xs mt-0.5">{f.error}</p>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Rejects every selected pending report with one shared reason. Same
 * partial-failure handling as BulkApproveModal (a report could stop
 * being pending between selection and submission if someone else
 * reviewed it first).
 *
 * A Disciplinary Officer can't reject send-home incidents either — same
 * restriction as approving them — so those are left out of the batch
 * instead of coming back as failures.
 */
function BulkRejectModal({ ids, records, onClose, onDone }) {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const recordById = Object.fromEntries((records || []).map((r) => [r.id, r]));
  const rejectableIds = ids.filter((id) => officerCanReject(user, recordById[id] || {}));
  const blockedIds = ids.filter((id) => !rejectableIds.includes(id));

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!reason.trim()) {
      setError("A reason is required to reject reports.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await bulkRejectRecords(rejectableIds, reason.trim());
      if (res.failed.length === 0) {
        toast.success(`${res.rejected.length} report${res.rejected.length === 1 ? "" : "s"} rejected`);
        onDone();
      } else {
        setResult(res);
        toast.success(`${res.rejected.length} rejected, ${res.failed.length} failed`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Reject selected reports" size="sm">
      {!result ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Rejecting <span className="font-semibold text-slate-800">{rejectableIds.length}</span> report
            {rejectableIds.length === 1 ? "" : "s"}. The same reason will be recorded on all of them.
          </p>
          {blockedIds.length > 0 && (
            <p className="text-xs text-amber-600">
              {blockedIds.length} of your {ids.length} selected reports send a student home and need the Dean of
              Discipline's review — those will stay pending and won't be included.
            </p>
          )}
          <Field label="Reason for rejection">
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why aren't these being recorded..."
              autoFocus
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={submitting || rejectableIds.length === 0}>
              {submitting ? "Rejecting..." : `Reject ${rejectableIds.length}`}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            {result.rejected.length} report{result.rejected.length === 1 ? "" : "s"} rejected. {result.failed.length}{" "}
            couldn't be rejected:
          </p>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {result.failed.map((f) => (
              <div key={f.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm">
                <p className="font-medium text-slate-800">Report #{f.id}</p>
                <p className="text-red-600 text-xs mt-0.5">{f.error}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Dean of Discipline only — deducts the same marks from every active
 * student in a class at once (e.g. "the whole class refused to clean the
 * classroom"), instead of creating one record per student. Mirrors
 * NewRecordModal's catalog/custom picker, minus evidence upload and
 * send-home dates (see bulkClassRecord on the backend for why both are
 * left out of the bulk path). A roster checklist lets specific students
 * be left out of an otherwise class-wide action — e.g. students who were
 * absent, or who did clean up while the rest of the class didn't.
 */
// Mirrors MARKS_PER_TERM in the backend's conductScoreService.
const MAX_TERM_MARKS = 40;

function ClassDeductModal({ types, onClose, onDone }) {
  const scope = useScopePicker();
  const confirm = useConfirm();
  const [misconductTypeId, setMisconductTypeId] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [marksDeducted, setMarksDeducted] = useState("");
  const [description, setDescription] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [excludedIds, setExcludedIds] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Starting fresh with nobody excluded whenever the roster changes (new
  // class picked) — an exclusion from a previous class shouldn't carry
  // over and silently apply to the wrong roster.
  useEffect(() => {
    setExcludedIds(new Set());
  }, [scope.classId]);

  const selectedType = types.find((t) => String(t.id) === misconductTypeId);
  const blockedBySendHome = !useCustom && !!selectedType?.requiresSendHome;
  const targetCount = Math.max(scope.students.length - excludedIds.size, 0);

  function toggleExcluded(studentId) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function handleTypeChange(id) {
    setMisconductTypeId(id);
    const type = types.find((t) => String(t.id) === id);
    if (type) setMarksDeducted(String(type.defaultDeduction));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!scope.classId || !scope.termId || !scope.academicYearId) {
      setError("Pick the class and term.");
      return;
    }
    if (!scope.isCurrentAcademicYear) {
      setError("Records can only be created for the current academic year — switch back to the current year.");
      return;
    }
    if (!useCustom && !misconductTypeId) {
      setError("Pick a misconduct type, or switch to a custom entry.");
      return;
    }
    if (blockedBySendHome) {
      setError("This incident sends students home — it can't be applied to a whole class. Record it individually instead.");
      return;
    }
    if (useCustom && !customTitle.trim()) {
      setError("Enter a title for this custom entry.");
      return;
    }
    if (!marksDeducted || Number(marksDeducted) <= 0) {
      setError("Marks deducted must be a positive number.");
      return;
    }
    // Whether this exceeds the term's total conduct marks is checked and
    // enforced by the backend, not here — its error message is shown
    // above if it rejects it.
    if (targetCount === 0) {
      setError("Every student in this class is excluded — nobody would receive this deduction.");
      return;
    }

    const className = scope.classes.find((c) => String(c.id) === String(scope.classId))?.name || "this class";
    const incidentTitle = useCustom ? customTitle.trim() : selectedType?.title || "this incident";
    const ok = await confirm({
      title: "Confirm class-wide deduction",
      message: `This will deduct ${marksDeducted} mark${
        Number(marksDeducted) === 1 ? "" : "s"
      } from ${targetCount} student${targetCount === 1 ? "" : "s"} in ${className} for "${incidentTitle}". It applies immediately with no review step and can't be undone. Apply this to ${targetCount} student${
        targetCount === 1 ? "" : "s"
      } now?`,
      confirmText: `Yes, deduct from ${targetCount}`,
      tone: "danger",
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      const result = await bulkClassRecord({
        classId: scope.classId,
        termId: scope.termId,
        academicYearId: scope.academicYearId,
        misconductTypeId: useCustom ? undefined : misconductTypeId,
        customTitle: useCustom ? customTitle.trim() : undefined,
        marksDeducted: Number(marksDeducted),
        description: description.trim() || undefined,
        excludeStudentIds: [...excludedIds],
      });
      toast.success("Class deduction applied", {
        description: `${result.count} student${result.count === 1 ? "" : "s"} in ${result.className} had -${result.marksDeducted} marks recorded (capped at each student's remaining termly marks).${
          result.skippedSendHome?.length
            ? ` ${result.skippedSendHome.length} student${result.skippedSendHome.length === 1 ? "" : "s"} skipped — already on an active send-home period.`
            : ""
        }${
          result.skippedDismissed?.length
            ? ` ${result.skippedDismissed.length} student${result.skippedDismissed.length === 1 ? "" : "s"} skipped — dismissed.`
            : ""
        }`,
      });
      if (result.exceededStudents?.length) {
        const names = result.exceededStudents.map((s) => `${s.firstName} ${s.lastName}`).join(", ");
        toast.warning(
          `${result.exceededStudents.length} student${result.exceededStudents.length === 1 ? " has" : "s have"} used up all conduct marks allowed this term`,
          { description: `${names} — refer for deliberation.` }
        );
      }
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Deduct marks from a whole class" size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-xs text-brand-600 -mt-1">
          Applies the same deduction to every active student in the class at once — finalized immediately, no
          review needed. Uncheck any students below to leave them out.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Academic year">
            <Select value={scope.academicYearId} onChange={(e) => scope.setAcademicYearId(e.target.value)}>
              <option value="">Select...</option>
              {scope.academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Term">
            <Select
              value={scope.termId}
              onChange={(e) => scope.setTermId(e.target.value)}
              disabled={!scope.terms.length || !scope.isCurrentAcademicYear}
            >
              <option value="">Select...</option>
              {scope.terms.map((t) => (
                <option key={t.id} value={t.id} disabled={t.isLocked}>
                  {t.name}
                  {t.isLocked ? " (locked)" : ""}
                </option>
              ))}
            </Select>
            <TermLockBadge term={scope.terms.find((t) => String(t.id) === String(scope.termId))} />
          </Field>
        </div>

        {scope.terms.length > 0 && scope.terms.every((t) => t.isLocked) && <AllTermsLockedNotice />}
        {!scope.isCurrentAcademicYear && (
          <NotCurrentYearNotice
            yearName={scope.academicYears.find((y) => String(y.id) === String(scope.academicYearId))?.name}
          />
        )}

        <Field label="Class">
          <Select
            value={scope.classId}
            onChange={(e) => scope.setClassId(e.target.value)}
            disabled={!scope.classes.length || !scope.isCurrentAcademicYear}
          >
            <option value="">Select...</option>
            {scope.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setUseCustom(false)}
            disabled={!scope.isCurrentAcademicYear}
            className={`px-3 py-1.5 rounded-lg border disabled:opacity-40 ${!useCustom ? "bg-brand-50 border-brand-200 text-brand-600" : "border-slate-200 text-slate-500"}`}
          >
            From catalog
          </button>
          <button
            type="button"
            onClick={() => setUseCustom(true)}
            disabled={!scope.isCurrentAcademicYear}
            className={`px-3 py-1.5 rounded-lg border disabled:opacity-40 ${useCustom ? "bg-brand-50 border-brand-200 text-brand-600" : "border-slate-200 text-slate-500"}`}
          >
            Custom entry
          </button>
        </div>

        {useCustom ? (
          <Field label="Title">
            <Input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="e.g. Refused to clean the classroom"
              disabled={!scope.isCurrentAcademicYear}
            />
          </Field>
        ) : (
          <Field label="Misconduct type">
            <SearchableSelect
              options={buildMisconductOptions(types.filter((t) => !t.requiresSendHome))}
              value={misconductTypeId}
              onChange={handleTypeChange}
              disabled={!scope.isCurrentAcademicYear}
              placeholder="Search incident types..."
            />
            <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-600">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>
                Only incident types that don't send a student home are shown here — those need to be recorded per
                student instead.
              </span>
            </p>
          </Field>
        )}

        {blockedBySendHome && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700 flex items-start gap-2.5">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Can't be applied to a whole class</p>
              <p className="mt-0.5 text-red-600/90">
                This incident sends a student home — that's a per-student decision. Use "New record" for each
                student individually instead.
              </p>
            </div>
          </div>
        )}

        {useCustom ? (
          <Field label={`Marks deducted (max ${MAX_TERM_MARKS})`}>
            <Input
              type="number"
              value={marksDeducted}
              onChange={(e) => setMarksDeducted(e.target.value)}
              disabled={!scope.isCurrentAcademicYear}
            />
          </Field>
        ) : (
          <Field label="Marks deducted">
            <div className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-600">
              {misconductTypeId ? (
                <>
                  <span className="font-semibold text-slate-800">-{marksDeducted}</span> — set by the misconduct type,
                  not editable here.
                </>
              ) : (
                "Pick a misconduct type above to see its deduction."
              )}
            </div>
          </Field>
        )}

        <Field label="Notes (optional)">
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!scope.isCurrentAcademicYear}
          />
        </Field>

        {scope.classId && (
          <Field label={`Students (${targetCount} of ${scope.students.length} will receive this)`}>
            {scope.students.length === 0 ? (
              <p className="text-xs text-slate-400">No active students in this class.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                {scope.students.map((s) => (
                  <label key={s.id} className="flex items-center gap-2.5 px-3.5 py-2 text-sm cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={!excludedIds.has(s.id)}
                      onChange={() => toggleExcluded(s.id)}
                      disabled={!scope.isCurrentAcademicYear}
                      className="rounded border-slate-300"
                    />
                    <span className="text-slate-700">
                      {s.firstName} {s.lastName}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Field>
        )}

        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || blockedBySendHome || targetCount === 0 || !scope.isCurrentAcademicYear}
          >
            {submitting ? "Applying..." : `Apply to ${targetCount || 0} student${targetCount === 1 ? "" : "s"}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function NewRecordModal({ types, onClose, onDone }) {
  const { user } = useAuth();
  const scope = useScopePicker();
  const confirm = useConfirm();
  const [misconductTypeId, setMisconductTypeId] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [marksDeducted, setMarksDeducted] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState([]);
  const [sentHomeFrom, setSentHomeFrom] = useState("");
  const [sentHomeTo, setSentHomeTo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [studentWarning, setStudentWarning] = useState(null); // { title, until } | null
  const [marksExceeded, setMarksExceeded] = useState(false);
  const [checkingStudent, setCheckingStudent] = useState(false);

  // Check right when a student is picked — not at submit time — so
  // nobody fills out the whole form before finding out it can't be saved.
  // Also re-checks if the term changes while the same student stays
  // selected, since "marks exceeded" is scoped to a term.
  useEffect(() => {
    if (!scope.studentId) {
      setStudentWarning(null);
      setMarksExceeded(false);
      return;
    }
    setStudentWarning(null);
    setMarksExceeded(false);
    setCheckingStudent(true);
    Promise.all([
      listRecords({ studentId: scope.studentId, status: "finalized" }),
      scope.termId && scope.academicYearId
        ? getStudentScore(scope.studentId, { termId: scope.termId, academicYearId: scope.academicYearId })
        : Promise.resolve(null),
    ])
      .then(([records, score]) => {
        const today = toDateOnly(new Date());
        const active = records.find(
          (r) => r.sentHomeFrom && r.sentHomeTo && r.sentHomeFrom <= today && r.sentHomeTo >= today
        );
        if (active) {
          setStudentWarning({
            title: capitalizeFirst(active.MisconductType?.title) || active.customTitle || "an earlier incident",
            until: active.sentHomeTo,
          });
        }
        if (score?.term && score.term.remaining <= 0) {
          setMarksExceeded(true);
        }
      })
      .finally(() => setCheckingStudent(false));
  }, [scope.studentId, scope.termId, scope.academicYearId]);

  const selectedType = types.find((t) => String(t.id) === misconductTypeId);
  const officerBlockedBySendHome =
    user.sbmsRole === "disciplinary_officer" && !useCustom && !!selectedType?.requiresSendHome;

  function handleTypeChange(id) {
    setMisconductTypeId(id);
    const type = types.find((t) => String(t.id) === id);
    if (type) {
      setMarksDeducted(String(type.defaultDeduction));
      if (type.requiresSendHome) {
        const range = computeSendHomeRange(type);
        setSentHomeFrom(range.from);
        setSentHomeTo(range.to);
      } else {
        setSentHomeFrom("");
        setSentHomeTo("");
      }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!scope.studentId || !scope.termId || !scope.academicYearId) {
      setError("Pick the student, class, and term.");
      return;
    }
    if (!scope.isCurrentAcademicYear) {
      setError("Records can only be created for the current academic year — switch back to the current year.");
      return;
    }
    if (studentWarning) {
      setError("This student is already sent home — pick a different student.");
      return;
    }
    if (marksExceeded) {
      setError("This student has already used up all conduct marks allowed this term — refer them for deliberation instead.");
      return;
    }
    if (!useCustom && !misconductTypeId) {
      setError("Pick a misconduct type, or switch to a custom entry.");
      return;
    }
    if (officerBlockedBySendHome) {
      setError("This incident sends a student home — submit it as a report for the Dean of Discipline to review instead.");
      return;
    }
    if (useCustom && !customTitle.trim()) {
      setError("Enter a title for this custom entry.");
      return;
    }
    if (!marksDeducted || Number(marksDeducted) <= 0) {
      setError("Marks deducted must be a positive number.");
      return;
    }
    // Whether this exceeds the term's total conduct marks is checked and
    // enforced by the backend, not here — its error message is shown
    // above if it rejects it.

    const studentName = scope.students.find((s) => String(s.id) === String(scope.studentId));
    const studentLabel = studentName ? `${studentName.firstName} ${studentName.lastName}` : "this student";
    const incidentTitle = useCustom ? customTitle.trim() : selectedType?.title || "this incident";
    const ok = await confirm({
      title: "Confirm mark deduction",
      message: (
        <>
          This will record "{incidentTitle}" for <strong className="font-semibold text-black">{studentLabel}</strong>{" "}
          and deduct {marksDeducted} mark{Number(marksDeducted) === 1 ? "" : "s"} immediately — no review step. This
          can't be undone. Save and deduct the marks?
        </>
      ),
      confirmText: "Yes, save & deduct",
      tone: "danger",
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      const result = await createRecord(
        {
          studentId: scope.studentId,
          termId: scope.termId,
          academicYearId: scope.academicYearId,
          misconductTypeId: useCustom ? undefined : misconductTypeId,
          customTitle: useCustom ? customTitle.trim() : undefined,
          marksDeducted: Number(marksDeducted),
          description: description.trim() || undefined,
          sentHomeFrom: sentHomeFrom || undefined,
          sentHomeTo: sentHomeTo || undefined,
        },
        files
      );
      toast.success("Record saved", {
        description: "The mark deduction has been applied (capped at the student's remaining termly marks, if lower).",
      });
      if (result.marksExceeded) {
        toast.warning("Student has used up all conduct marks allowed this term", {
          description: `${result.marksExceededMessage}`,
        });
      }
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Record a mistake" size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-xs text-brand-600 -mt-1">
          Recorded directly by you — no review needed, marks apply immediately.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Academic year">
            <Select value={scope.academicYearId} onChange={(e) => scope.setAcademicYearId(e.target.value)}>
              <option value="">Select...</option>
              {scope.academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Term">
            <Select
              value={scope.termId}
              onChange={(e) => scope.setTermId(e.target.value)}
              disabled={!scope.terms.length || !scope.isCurrentAcademicYear}
            >
              <option value="">Select...</option>
              {scope.terms.map((t) => (
                <option key={t.id} value={t.id} disabled={t.isLocked}>
                  {t.name}
                  {t.isLocked ? " (locked)" : ""}
                </option>
              ))}
            </Select>
            <TermLockBadge term={scope.terms.find((t) => String(t.id) === String(scope.termId))} />
          </Field>
        </div>

        {scope.terms.length > 0 && scope.terms.every((t) => t.isLocked) && <AllTermsLockedNotice />}
        {!scope.isCurrentAcademicYear && (
          <NotCurrentYearNotice
            yearName={scope.academicYears.find((y) => String(y.id) === String(scope.academicYearId))?.name}
          />
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Class">
            <Select
              value={scope.classId}
              onChange={(e) => scope.setClassId(e.target.value)}
              disabled={!scope.classes.length || !scope.isCurrentAcademicYear}
            >
              <option value="">Select...</option>
              {scope.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Student">
            <Select
              value={scope.studentId}
              onChange={(e) => scope.setStudentId(e.target.value)}
              disabled={!scope.students.length || !scope.isCurrentAcademicYear}
            >
              <option value="">Select...</option>
              {scope.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {checkingStudent && <p className="text-xs text-slate-400">Checking this student's status...</p>}

        {studentWarning ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700 flex items-start gap-2.5">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Already sent home</p>
              <p className="mt-0.5 text-red-600/90">
                This student is serving a weekend for {studentWarning.title} until {fmtDate(studentWarning.until)} —
                a new record can't be added until it ends. Pick a different student to continue.
              </p>
            </div>
          </div>
        ) : marksExceeded ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700 flex items-start gap-2.5">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">All conduct marks used up this term</p>
              <p className="mt-0.5 text-red-600/90">
                This student has already used up all {MAX_TERM_MARKS} conduct marks allowed for this term — refer
                them for deliberation instead of recording another deduction.
              </p>
            </div>
          </div>
        ) : (
          <>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setUseCustom(false)}
            disabled={!scope.isCurrentAcademicYear}
            className={`px-3 py-1.5 rounded-lg border disabled:opacity-40 ${!useCustom ? "bg-brand-50 border-brand-200 text-brand-600" : "border-slate-200 text-slate-500"}`}
          >
            From catalog
          </button>
          <button
            type="button"
            onClick={() => {
              setUseCustom(true);
              setSentHomeFrom("");
              setSentHomeTo("");
            }}
            disabled={!scope.isCurrentAcademicYear}
            className={`px-3 py-1.5 rounded-lg border disabled:opacity-40 ${useCustom ? "bg-brand-50 border-brand-200 text-brand-600" : "border-slate-200 text-slate-500"}`}
          >
            Custom entry
          </button>
        </div>

        {useCustom ? (
          <Field label="Title">
            <Input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="e.g. Vandalizing school property"
              disabled={!scope.isCurrentAcademicYear}
            />
          </Field>
        ) : (
          <Field label="Misconduct type">
            <SearchableSelect
              options={buildMisconductOptions(types)}
              value={misconductTypeId}
              onChange={handleTypeChange}
              disabled={!scope.isCurrentAcademicYear}
              placeholder="Search incident types..."
            />
          </Field>
        )}

        {!useCustom && officerBlockedBySendHome && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700 flex items-start gap-2.5">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Needs the Dean of Discipline</p>
              <p className="mt-0.5 text-red-600/90">
                This incident sends a student home, so Disciplinary Officers can't record it directly — submit
                it as a report instead and the Dean of Discipline will review and approve it.
              </p>
              <Link to="/report" className="mt-1.5 inline-block font-medium underline">
                Go to Report a mistake
              </Link>
            </div>
          </div>
        )}

        {useCustom ? (
          <Field label={`Marks deducted (max ${MAX_TERM_MARKS})`}>
            <Input
              type="number"
              value={marksDeducted}
              onChange={(e) => setMarksDeducted(e.target.value)}
              disabled={!scope.isCurrentAcademicYear}
            />
          </Field>
        ) : (
          <Field label="Marks deducted">
            <div className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-600">
              {misconductTypeId ? (
                <>
                  <span className="font-semibold text-slate-800">-{marksDeducted}</span> — set by the misconduct type,
                  not editable here.
                </>
              ) : (
                "Pick a misconduct type above to see its deduction."
              )}
            </div>
          </Field>
        )}

        <Field label="Notes (optional)">
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!scope.isCurrentAcademicYear}
          />
        </Field>

        <Field label={<EvidenceFieldLabel />}>
          <EvidenceUpload
            files={files}
            disabled={submitting || !scope.isCurrentAcademicYear}
            onChange={(next, uploadError) => {
              setFiles(next);
              if (uploadError) setError(uploadError);
            }}
          />
        </Field>

        {!useCustom && selectedType?.requiresSendHome && !officerBlockedBySendHome && (
          <>
            <p className="-mb-2 text-xs text-amber-600">
              This incident sends the student home — dates below were filled in automatically; adjust if needed.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Sent home from">
                <Input
                  type="date"
                  value={sentHomeFrom}
                  onChange={(e) => setSentHomeFrom(e.target.value)}
                  disabled={!scope.isCurrentAcademicYear}
                />
              </Field>
              <Field label="Sent home to">
                <Input
                  type="date"
                  value={sentHomeTo}
                  onChange={(e) => setSentHomeTo(e.target.value)}
                  disabled={!scope.isCurrentAcademicYear}
                />
              </Field>
            </div>
          </>
        )}
          </>
        )}

        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              submitting || !!studentWarning || marksExceeded || officerBlockedBySendHome || !scope.isCurrentAcademicYear
            }
          >
            {submitting ? "Saving..." : "Save record"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
