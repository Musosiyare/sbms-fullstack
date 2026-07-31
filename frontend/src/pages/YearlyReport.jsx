import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { FileText, Download, List, Lock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import PillSelect, { ScopeBar, ScopeGroup } from "../components/ui/PillSelect";
import { Table, Thead, Th, Td, EmptyRow } from "../components/ui/Table";
import { useScopePicker } from "../hooks/useScopePicker";
import { useAuth } from "../context/AuthContext";
import { getClassYearlyConductReport } from "../api/sbms";
import { exportYearlyDecisionsPdf, exportYearlyReportPdf } from "../utils/pdf";
import YearlyConductReportModal from "../components/YearlyConductReportModal";

const CAN_APPROVE = ["dean_of_discipline", "disciplinary_officer"];

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
          <PillSelect
            options={scope.academicYears.map((y) => ({ id: y.id, label: y.name }))}
            value={scope.academicYearId}
            onChange={scope.setAcademicYearId}
            emptyLabel="No academic years yet"
          />
        </ScopeGroup>
        <ScopeGroup label="Class">
          <PillSelect
            options={scope.classes.map((c) => ({ id: c.id, label: c.name }))}
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

      <Table className="table-fixed min-w-[780px]">
        <Thead>
          <tr>
            <Th className="w-[13%]">Admission No.</Th>
            <Th className="w-[26%]">Student</Th>
            <Th className="w-[13%] text-center">
              Remaining /{data?.students?.[0]?.year.maxMarks ?? 120}
            </Th>
            <Th className="w-[13%] text-center">Decision</Th>
            <Th className="w-[35%] text-right">Report</Th>
          </tr>
        </Thead>
        <tbody>
          {!scope.classId || !scope.academicYearId ? (
            <EmptyRow colSpan={5}>Pick an academic year and class above.</EmptyRow>
          ) : data === null ? (
            <EmptyRow colSpan={5}>Loading...</EmptyRow>
          ) : data.students.length === 0 ? (
            <EmptyRow colSpan={5}>No students in this class.</EmptyRow>
          ) : (
            data.students.map((s) => {
              const promoted = s.year.decision === "promoted";
              return (
                <tr key={s.studentId}>
                  <Td>
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
                  <Td className="text-center font-bold tabular-nums text-slate-800">{s.year.remaining}</Td>
                  <Td className="text-center">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                        promoted ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                      }`}
                    >
                      {promoted ? "Promoted" : "Dismissed"}
                    </span>
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
