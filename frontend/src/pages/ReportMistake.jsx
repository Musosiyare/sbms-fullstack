import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Field, Select, Textarea } from "../components/ui/FormField";
import { ErrorText, TermLockBadge, AllTermsLockedNotice } from "../components/ui/Alerts";
import EvidenceUpload, { EvidenceFieldLabel } from "../components/ui/EvidenceUpload";
import { useScopePicker } from "../hooks/useScopePicker";
import { createReport, getMisconductTypes } from "../api/sbms";
import { capitalizeFirst } from "../utils/text";

export default function ReportMistake() {
  const { user } = useAuth();
  const scope = useScopePicker();
  const [types, setTypes] = useState(null);
  const [misconductTypeId, setMisconductTypeId] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getMisconductTypes().then(setTypes);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!scope.studentId || !scope.termId || !scope.academicYearId) {
      setError("Pick the student, class, and term first.");
      return;
    }
    if (!misconductTypeId) {
      setError("Pick an incident from the list.");
      return;
    }

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

  const canFinalizeDirectly = ["dean_of_discipline", "disciplinary_officer"].includes(user.sbmsRole);

  return (
    <Card>
      {canFinalizeDirectly && (
        <p className="text-sm text-slate-500 mb-4 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
          As {user.sbmsRole === "dean_of_discipline" ? "Dean of Discipline" : "a Disciplinary Officer"}, you can also
          record a mistake directly with marks deducted — use "New record" on the Records page for that. This form
          just raises a report for review.
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
            <Select value={scope.termId} onChange={(e) => scope.setTermId(e.target.value)} disabled={!scope.terms.length}>
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

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Class">
            <Select value={scope.classId} onChange={(e) => scope.setClassId(e.target.value)} disabled={!scope.classes.length}>
              <option value="">Select...</option>
              {scope.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Student">
            <Select value={scope.studentId} onChange={(e) => scope.setStudentId(e.target.value)} disabled={!scope.students.length}>
              <option value="">Select...</option>
              {scope.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Incident">
          <Select value={misconductTypeId} onChange={(e) => setMisconductTypeId(e.target.value)} disabled={!types}>
            <option value="">{types ? "Select..." : "Loading..."}</option>
            {types?.map((t) => (
              <option key={t.id} value={t.id}>
                {capitalizeFirst(t.title)} (-{t.defaultDeduction})
              </option>
            ))}
          </Select>
          <p className="text-xs text-slate-400">
            The list and deduction marks are set by the Dean of Discipline.
          </p>
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
          />
        </Field>

        <Field label={<EvidenceFieldLabel />}>
          <EvidenceUpload
            files={files}
            disabled={submitting}
            onChange={(next, uploadError) => {
              setFiles(next);
              if (uploadError) setError(uploadError);
            }}
          />
        </Field>

        <ErrorText>{error}</ErrorText>

        <Button type="submit" disabled={submitting} className="self-start">
          {submitting ? "Submitting..." : "Submit report"}
        </Button>
      </form>
    </Card>
  );
}
