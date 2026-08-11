import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Info, User, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Field, Select, Textarea } from "../components/ui/FormField";
import { ErrorText, TermLockBadge, AllTermsLockedNotice, NotCurrentYearNotice } from "../components/ui/Alerts";
import EvidenceUpload, { EvidenceFieldLabel } from "../components/ui/EvidenceUpload";
import SearchableSelect from "../components/ui/SearchableSelect";
import { buildMisconductOptions } from "../utils/misconductOptions";
import { useConfirm } from "../components/ui/ConfirmProvider";
import { useScopePicker } from "../hooks/useScopePicker";
import { createReport, bulkClassReport, getMisconductTypes, listRecords } from "../api/sbms";
import { capitalizeFirst } from "../utils/text";

// Whole-class reporting mirrors the Dean of Discipline's "Deduct from
// class" tool on Records, but stays on the report pathway: nothing is
// finalized here, so it's only offered to the roles that already submit
// reports for individual students — a plain teacher (reporter) and a
// manager. Discipline staff already have their own class-wide tool that
// finalizes immediately (Records -> Deduct from class), so a second,
// slower "report the class" path here would just be a confusing duplicate
// for them.
const CAN_REPORT_CLASS = ["reporter", "manager"];

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString() : "";
}

export default function ReportMistake() {
  const { user } = useAuth();
  const scope = useScopePicker();
  const confirm = useConfirm();
  const [types, setTypes] = useState(null);
  const [misconductTypeId, setMisconductTypeId] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [studentWarning, setStudentWarning] = useState(null); // { title, until } | null
  const [checkingStudent, setCheckingStudent] = useState(false);

  const canReportClass = CAN_REPORT_CLASS.includes(user.sbmsRole);
  const [mode, setMode] = useState("student"); // "student" | "class"

  // Whole-class report state — kept separate from the single-student
  // fields above so switching modes never mixes up what's been typed.
  const [classMisconductTypeId, setClassMisconductTypeId] = useState("");
  const [classDescription, setClassDescription] = useState("");
  const [excludedIds, setExcludedIds] = useState(new Set());
  const [classSubmitting, setClassSubmitting] = useState(false);
  const [classError, setClassError] = useState("");

  // Students already serving an active weekend/send-home period can't be
  // punished again until it ends (same rule the backend enforces on
  // submit — see bulkClassReport's auto-skip). They're not a pickable
  // target for a class-wide report, so they're kept out of the count and
  // shown greyed-out with a reason instead of a live checkbox.
  const sendHomeStudents = scope.students.filter((s) => s.onActiveSendHome);
  const pickableStudents = scope.students.filter((s) => !s.onActiveSendHome);

  useEffect(() => {
    getMisconductTypes().then(setTypes);
  }, []);

  // Starting fresh with nobody excluded whenever the roster changes (new
  // class picked) — an exclusion from a previous class shouldn't carry
  // over and silently apply to the wrong roster.
  useEffect(() => {
    setExcludedIds(new Set());
  }, [scope.classId]);

  function toggleExcluded(studentId) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  // Same check as the discipline-side "New record" form: a student
  // already serving a weekend/send-home period can't have a new mistake
  // reported against them, so this is surfaced as soon as they're picked
  // rather than after filling out the whole form.
  useEffect(() => {
    if (!scope.studentId) {
      setStudentWarning(null);
      return;
    }
    setStudentWarning(null);
    setCheckingStudent(true);
    listRecords({ studentId: scope.studentId, status: "finalized" })
      .then((records) => {
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
      })
      .finally(() => setCheckingStudent(false));
  }, [scope.studentId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!scope.studentId || !scope.termId || !scope.academicYearId) {
      setError("Pick the student, class, and term first.");
      return;
    }
    if (!scope.isCurrentAcademicYear) {
      setError("Reports can only be raised for the current academic year — switch back to the current year.");
      return;
    }
    if (studentWarning) {
      setError("This student is already sent home — pick a different student.");
      return;
    }
    if (!misconductTypeId) {
      setError("Pick an incident from the list.");
      return;
    }

    const student = scope.students.find((s) => String(s.id) === String(scope.studentId));
    const studentLabel = student ? `${student.firstName} ${student.lastName}` : "this student";
    const incidentTitle = types?.find((t) => String(t.id) === misconductTypeId)?.title || "this incident";
    const ok = await confirm({
      title: "Confirm report submission",
      message: (
        <>
          This will submit a report on <strong className="font-semibold text-black">{studentLabel}</strong> for "
          {incidentTitle}" to the discipline office for review. Submit this report?
        </>
      ),
      confirmText: "Yes, submit report",
      tone: "danger",
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      await createReport(
        {
          studentId: scope.studentId,
          termId: scope.termId,
          academicYearId: scope.academicYearId,
          misconductTypeId,
          description: description.trim() || undefined,
        },
        files
      );
      toast.success("Report submitted", {
        description: "The discipline office will review it.",
      });
      setMisconductTypeId("");
      setDescription("");
      setFiles([]);
      scope.setStudentId("");
    } catch (err) {
      toast.error("Couldn't submit report", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  /** Whole-class equivalent of handleSubmit — one pending report per active, eligible student in the class. */
  async function handleClassSubmit(e) {
    e.preventDefault();
    setClassError("");
    if (!scope.classId || !scope.termId || !scope.academicYearId) {
      setClassError("Pick the class and term first.");
      return;
    }
    if (!scope.isCurrentAcademicYear) {
      setClassError("Reports can only be raised for the current academic year — switch back to the current year.");
      return;
    }
    if (!classMisconductTypeId) {
      setClassError("Pick an incident from the list.");
      return;
    }

    const targetCount = Math.max(pickableStudents.length - excludedIds.size, 0);
    if (targetCount === 0) {
      setClassError("Every student in this class is excluded — nobody would receive this report.");
      return;
    }

    const className = scope.classes.find((c) => String(c.id) === String(scope.classId))?.name || "this class";
    const incidentTitle = types?.find((t) => String(t.id) === classMisconductTypeId)?.title || "this incident";
    const ok = await confirm({
      title: "Confirm class-wide report",
      message: `This will submit a pending report on ${targetCount} student${
        targetCount === 1 ? "" : "s"
      } in ${className} for "${incidentTitle}", for the discipline office to review. Submit ${targetCount} report${
        targetCount === 1 ? "" : "s"
      }?`,
      confirmText: `Yes, submit ${targetCount}`,
      tone: "danger",
    });
    if (!ok) return;

    setClassSubmitting(true);
    try {
      const result = await bulkClassReport({
        classId: scope.classId,
        termId: scope.termId,
        academicYearId: scope.academicYearId,
        misconductTypeId: classMisconductTypeId,
        description: classDescription.trim() || undefined,
        excludeStudentIds: [...excludedIds],
      });
      toast.success("Class report submitted", {
        description: `${result.count} report${result.count === 1 ? "" : "s"} submitted for ${
          result.className
        }, waiting on the discipline office.${
          result.skippedSendHome?.length
            ? ` ${result.skippedSendHome.length} student${
                result.skippedSendHome.length === 1 ? "" : "s"
              } skipped — already on an active send-home period.`
            : ""
        }${
          result.skippedDismissed?.length
            ? ` ${result.skippedDismissed.length} student${
                result.skippedDismissed.length === 1 ? "" : "s"
              } skipped — dismissed.`
            : ""
        }`,
      });
      setClassMisconductTypeId("");
      setClassDescription("");
      setExcludedIds(new Set());
    } catch (err) {
      setClassError(err.message);
    } finally {
      setClassSubmitting(false);
    }
  }

  const canFinalizeDirectly = ["dean_of_discipline", "disciplinary_officer"].includes(user.sbmsRole);
  const isOfficer = user.sbmsRole === "disciplinary_officer";
  // A Disciplinary Officer can record everything else directly from
  // Records -> New record — the only reason they'd land on this report
  // form at all is a weekend/send-home incident, which they're not
  // allowed to finalize themselves. So the catalog here narrows down to
  // exactly that subset for them; nothing else would make sense to pick.
  const visibleTypes = types ? (isOfficer ? types.filter((t) => t.requiresSendHome) : types) : types;
  // Whole-class reports can never include a send-home incident — sending
  // an entire class home for the weekend has to be a per-student call by
  // the discipline office, not something a bulk report should even offer
  // (mirrors the backend's bulkClassReport restriction).
  const classVisibleTypes = types ? types.filter((t) => !t.requiresSendHome) : types;
  const classTargetCount = Math.max(pickableStudents.length - excludedIds.size, 0);

  return (
    <Card>
      {canReportClass && (
        <div className="flex items-center gap-2 text-sm mb-4">
          <button
            type="button"
            onClick={() => setMode("student")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
              mode === "student" ? "bg-brand-50 border-brand-200 text-brand-600" : "border-slate-200 text-slate-500"
            }`}
          >
            <User size={14} /> One student
          </button>
          <button
            type="button"
            onClick={() => setMode("class")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
              mode === "class" ? "bg-brand-50 border-brand-200 text-brand-600" : "border-slate-200 text-slate-500"
            }`}
          >
            <Users size={14} /> Whole class
          </button>
        </div>
      )}

      {mode === "class" && canReportClass ? (
        <form onSubmit={handleClassSubmit} className="flex flex-col gap-4 max-w-lg">
          <p className="text-xs text-brand-600 -mt-1">
            Submits a pending report on every active student in the class at once, for the discipline office to
            review — nothing is finalized and no marks move yet. Uncheck any students below to leave them out.
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

          <Field label="Incident">
            <SearchableSelect
              options={buildMisconductOptions(classVisibleTypes)}
              value={classMisconductTypeId}
              onChange={setClassMisconductTypeId}
              disabled={!types || !scope.isCurrentAcademicYear}
              placeholder={types ? "Search incident types..." : "Loading..."}
            />
            <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-600">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>
                Only incident types that don't send a student home are shown here — those need to be reported per
                student instead, from "One student" above.
              </span>
            </p>
          </Field>

          <Field label="Additional notes (optional)">
            <Textarea
              rows={3}
              value={classDescription}
              onChange={(e) => setClassDescription(e.target.value)}
              placeholder="Anything else worth adding..."
              disabled={!scope.isCurrentAcademicYear}
            />
          </Field>

          {scope.classId && (
            <Field label={`Students (${classTargetCount} of ${pickableStudents.length} will be reported)`}>
              {scope.students.length === 0 ? (
                <p className="text-xs text-slate-400">No active students in this class.</p>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {sendHomeStudents.map((s) => (
                    <div
                      key={s.id}
                      title={`Serving a weekend send-home until ${s.sendHomeUntil} — can't be reported again until then`}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-sm bg-slate-50/60 cursor-not-allowed"
                    >
                      <input type="checkbox" checked={false} disabled className="rounded border-slate-300" />
                      <span className="text-slate-400 line-through">
                        {s.firstName} {s.lastName}
                      </span>
                      <span className="ml-auto shrink-0 rounded-full bg-amber-50 text-amber-600 text-[11px] font-medium px-2 py-0.5">
                        On weekend
                      </span>
                    </div>
                  ))}
                  {pickableStudents.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-sm cursor-pointer hover:bg-slate-50"
                    >
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

          <ErrorText>{classError}</ErrorText>

          <Button
            type="submit"
            disabled={classSubmitting || classTargetCount === 0 || !scope.isCurrentAcademicYear}
            className="self-start"
          >
            {classSubmitting ? "Submitting..." : `Submit ${classTargetCount || 0} report${classTargetCount === 1 ? "" : "s"}`}
          </Button>
        </form>
      ) : (
      <>
      {canFinalizeDirectly && (
        <p className="text-sm text-slate-500 mb-4 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
          {isOfficer ? (
            <>
              As a Disciplinary Officer, you can record most incidents directly — use "New record" on the
              Records page for that. Incidents that send a student home for the weekend are the exception:
              you're not allowed to finalize those yourself, so this form raises a report instead, for the
              Dean of Discipline to review and finalize.
            </>
          ) : (
            <>
              As Dean of Discipline, you can also record a mistake directly with marks deducted — use "New
              record" on the Records page for that. This form just raises a report for review.
            </>
          )}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-lg">
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
                a new report can't be raised until it ends. Pick a different student to continue.
              </p>
            </div>
          </div>
        ) : (
          <>
        <Field label="Incident">
          <SearchableSelect
            options={buildMisconductOptions(visibleTypes)}
            value={misconductTypeId}
            onChange={setMisconductTypeId}
            disabled={!types || !scope.isCurrentAcademicYear}
            placeholder={types ? "Search incident types..." : "Loading..."}
          />
          <p className="text-xs text-brand-600">
            The list and deduction marks are set by the Dean of Discipline.
          </p>
          {isOfficer && (
            <p className="text-xs text-brand-600">
              Only incidents that require sending a student home for the weekend are available here — every
              other incident type is yours to record directly from Records → New record.
            </p>
          )}
          {isOfficer && types && visibleTypes.length === 0 && (
            <p className="text-xs text-amber-600">
              No incident type in the catalog currently requires a weekend send-home, so there's nothing to
              report here right now.
            </p>
          )}
          {types?.find((t) => String(t.id) === misconductTypeId)?.requiresSendHome && (
            <p className="text-xs text-amber-600">
              This incident sends the student home — the discipline office will set the dates when they review it.
            </p>
          )}
        </Field>

        <Field label="Additional notes (optional)">
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Anything else worth adding..."
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
          </>
        )}

        <ErrorText>{error}</ErrorText>

        <Button
          type="submit"
          disabled={submitting || !!studentWarning || !scope.isCurrentAcademicYear}
          className="self-start"
        >
          {submitting ? "Submitting..." : "Submit report"}
        </Button>
      </form>
      </>
      )}
    </Card>
  );
}
