import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { FileText, Download, List, Lock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ScopeBar, ScopeGroup, YearSelect } from "../components/ui/PillSelect";
import { Table, Thead, Th, Td, EmptyRow } from "../components/ui/Table";
import { useScopePicker } from "../hooks/useScopePicker";
import { useAuth } from "../context/AuthContext";
import { getClassYearlyConductReport } from "../api/sbms";
import { exportYearlyDecisionsPdf, exportYearlyReportPdf } from "../utils/pdf";
import YearlyConductReportModal from "../components/YearlyConductReportModal";

const CAN_APPROVE = ["dean_of_discipline", "disciplinary_officer"];

// Deliberation decision — plain colored text, no pill/background, one
// line only (term name inline, same color) so it never wraps or competes
// visually with the rest of the row.
const DELIBERATION_BADGE = {
  dismissed_permanently: { label: "Dismissed Permanently", className: "text-red-700" },
  dismissed_term: { label: "Dismissed (Term)", className: "text-amber-700" },
  stained: { label: "Stained", className: "text-slate-600" },
};

// Dismissed students get one quiet signal: a thin colored line down the
// left edge of the row. Everything else — name, admission no., marks —
// stays the same color/weight as any other row; only the Decision cell
// carries color, so there's exactly one place to check, not five. A plain
// computed "Dismissed" (below 50% of the year's marks, no formal
// deliberation yet) gets a fainter line so it doesn't read as an official
// permanent decision.
const DISMISSED_ROW = {
  dismissed_permanently: { cell: "border-l-2 border-l-red-400" },
  dismissed_term: { cell: "border-l-2 border-l-amber-400" },
  computed_dismissed: { cell: "border-l-2 border-l-red-200" },
};

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * The year-end counterpart to Class Report: no term picker, since this
 * combines all three terms into one decision per student — "Promoted" at
 * or above 50% of the year's total marks, "Dismissed" below.
 */
export default function YearlyReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canApprove = CAN_APPROVE.includes(user.sbmsRole);
  const scope = useScopePicker({ needsStudent: false });
  const [data, setData] = useState(null);
  const [reportStudentId, setReportStudentId] = useState(null);
  const [exporting, setExporting] = useState(null); // "decisions" | "reports" | null

  // Jumps to the Records page's "All Reports" queue, pre-filtered to this
  // student's pending report(s) — mirrors the same shortcut on Class Report.
  function viewPendingReports(student) {
    const params = new URLSearchParams({
      tab: "reports",
      status: "pending",
      academicYearId: scope.academicYearId,
      classId: scope.classId,
      search: `${student.firstName} ${student.lastName}`.trim(),
    });
    navigate(`/records?${params.toString()}`);
  }

  useEffect(() => {
    if (!scope.classId || !scope.academicYearId) {
      setData(null);
      return;
    }
    setData(null);
    getClassYearlyConductReport(scope.classId, { academicYearId: scope.academicYearId }).then(setData);
  }, [scope.classId, scope.academicYearId]);

  const canDownload = Boolean(data) && data.students.length > 0;
  // A student permanently dismissed mid-year has their own reduced
  // year.maxMarks (only the terms up to the dismissal count — see the
  // backend cutoff), so it can't be used as the column's shared
  // denominator. The full year total comes from the term count instead,
  // which stays constant for every student in the class.
  const fullYearMax = data?.students?.[0]?.terms?.length
    ? data.students[0].terms.length * (data.students[0].terms[0]?.maxMarks || 40)
    : 120;
  const fileBase = data ? `${slugify(data.class.name)}-${slugify(data.academicYear.name)}` : "yearly-conduct";

  // Yearly report generation is blocked while any term for this academic
  // year is locked in the shared mid-term reporting system — it's only
  // allowed once every term is open/unlocked.
  const allTermsOpen = scope.terms.length > 0 && scope.terms.every((t) => !t.isLocked);
  const canGenerate = canDownload && allTermsOpen;

  function handleDownloadDecisions() {
    if (!data || !allTermsOpen) return;
    setExporting("decisions");
    try {
      exportYearlyDecisionsPdf(
        {
          school: data.school,
          klass: data.class,
          academicYear: data.academicYear,
          deanOfDiscipline: data.deanOfDiscipline,
          students: data.students,
        },
        `${fileBase}-yearly-decisions.pdf`
      );
    } catch (err) {
      toast.error("Couldn't generate the PDF", { description: err?.message });
    } finally {
      setExporting(null);
    }
  }

  function handleDownloadReports() {
    if (!data || !allTermsOpen) return;
    setExporting("reports");
    try {
      const reports = data.students.map((s) => ({
        school: data.school,
        class: data.class,
        academicYear: data.academicYear,
        deanOfDiscipline: data.deanOfDiscipline,
        generatedAt: data.generatedAt,
        student: s,
        terms: s.terms,
        year: s.year,
        deliberations: s.deliberations,
        incidents: s.incidents,
      }));
      exportYearlyReportPdf(reports, `${fileBase}-yearly-reports.pdf`);
    } catch (err) {
      toast.error("Couldn't generate the PDF", { description: err?.message });
    } finally {
      setExporting(null);
    }
  }

  return (
    <Card
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleDownloadDecisions} disabled={!canGenerate || exporting !== null}>
            <List size={15} /> {exporting === "decisions" ? "Generating…" : "Yearly decisions"}
          </Button>
          <Button variant="primary" onClick={handleDownloadReports} disabled={!canGenerate || exporting !== null}>
            <Download size={15} /> {exporting === "reports" ? "Generating…" : "Yearly reports"}
          </Button>
        </div>
      }
    >
      <ScopeBar>
        <ScopeGroup label="Academic year">
          <YearSelect
            options={scope.academicYears.map((y) => ({ id: y.id, label: y.name, isCurrent: y.isCurrent }))}
            value={scope.academicYearId}
            onChange={scope.setAcademicYearId}
            emptyLabel="No academic years yet"
          />
        </ScopeGroup>
        <ScopeGroup label="Class">
          <YearSelect
            options={scope.classes.map((c) => ({ id: c.id, label: c.name, isCurrent: true }))}
            value={scope.classId}
            onChange={scope.setClassId}
            emptyLabel="Pick a year first"
          />
        </ScopeGroup>
      </ScopeBar>

      {scope.classId && scope.academicYearId && scope.terms.length > 0 && !allTermsOpen && (
        <p className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700 mb-6">
          <Lock size={15} className="shrink-0" />{" "}
          {scope.terms
            .filter((t) => t.isLocked)
            .map((t) => t.name)
            .join(", ")}{" "}
          {scope.terms.filter((t) => t.isLocked).length > 1 ? "are" : "is"} locked in the reporting system. Yearly
          decisions and reports can only be generated once every term is unlocked.
        </p>
      )}

      <Table className="table-fixed min-w-[850px]">
        <Thead>
          <tr>
            <Th className="w-[12%]">Admission No.</Th>
            <Th className="w-[23%]">Student</Th>
            <Th className="w-[12%] text-center">Remaining /{fullYearMax}</Th>
            <Th className="w-[10%] text-center">Incidents</Th>
            <Th className="w-[12%] text-center">Decision</Th>
            <Th className="w-[31%] text-right">Report</Th>
          </tr>
        </Thead>
        <tbody>
          {!scope.classId || !scope.academicYearId ? (
            <EmptyRow colSpan={6}>Pick an academic year and class above.</EmptyRow>
          ) : data === null ? (
            <EmptyRow colSpan={6}>Loading...</EmptyRow>
          ) : data.students.length === 0 ? (
            <EmptyRow colSpan={6}>No students in this class.</EmptyRow>
          ) : (
            data.students.map((s) => {
              const promoted = s.year.decision === "promoted";
              const toneKey = s.year.deliberation?.decision || (!promoted ? "computed_dismissed" : null);
              const tone = DISMISSED_ROW[toneKey];
              return (
                <tr key={s.studentId}>
                  <Td className={tone?.cell}>
                    <span className="font-bold text-slate-800">{s.admissionNumber || "—"}</span>
                  </Td>
                  <Td className="font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      <span>
                        {s.firstName} {s.lastName}
                      </span>
                      {s.pendingCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 whitespace-nowrap">
                          <AlertTriangle size={11} /> {s.pendingCount} pending
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td className="text-center font-bold tabular-nums text-slate-800">
                    {s.year.remaining}
                    {s.year.maxMarks !== fullYearMax && (
                      <span className="ml-1 text-[10px] font-normal opacity-70">/{s.year.maxMarks}</span>
                    )}
                  </Td>
                  <Td className="text-center">
                    <span
                      className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 tabular-nums"
                      title={s.terms
                        .map((t) => `${t.termName}: ${t.notApplicable ? "–" : t.incidentsCount}`)
                        .join(" · ")}
                    >
                      {s.incidentsCount}
                    </span>
                  </Td>
                  <Td className="text-center">
                    {s.year.deliberation ? (
                      <span
                        className={`whitespace-nowrap text-xs font-medium ${
                          DELIBERATION_BADGE[s.year.deliberation.decision]?.className || "text-slate-600"
                        }`}
                        title={
                          s.deliberations?.length > 1
                            ? `Other terms: ${s.deliberations
                                .filter((d) => d.id !== s.year.deliberation.id)
                                .map((d) => `${d.termName} — ${DELIBERATION_BADGE[d.decision]?.label || d.decision}`)
                                .join("; ")}`
                            : undefined
                        }
                      >
                        {DELIBERATION_BADGE[s.year.deliberation.decision]?.label || s.year.deliberation.decision}
                        {s.year.deliberation.termName && (
                          <span className="opacity-70"> · {s.year.deliberation.termName}</span>
                        )}
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          promoted ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {promoted ? "Promoted" : "Dismissed"}
                      </span>
                    )}
                  </Td>
                  <Td className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {s.pendingCount > 0 && (
                        <button
                          onClick={() => viewPendingReports(s)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-100"
                        >
                          <AlertTriangle size={13} /> {canApprove ? "Review to approve" : "View incidents"}
                        </button>
                      )}
                      <button
                        onClick={() => allTermsOpen && setReportStudentId(s.studentId)}
                        disabled={!allTermsOpen}
                        title={allTermsOpen ? undefined : "Available once every term for this year is unlocked"}
                        className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-500 transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-brand-200 disabled:hover:bg-white"
                      >
                        <FileText size={13} /> View report
                      </button>
                    </div>
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>

      <YearlyConductReportModal
        studentId={reportStudentId}
        academicYearId={scope.academicYearId}
        onClose={() => setReportStudentId(null)}
      />
    </Card>
  );
}
