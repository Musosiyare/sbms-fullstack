import { useEffect, useState } from "react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { FileText, Download } from "lucide-react";
import PillSelect, { ScopeBar, ScopeGroup } from "../components/ui/PillSelect";
import { Table, Thead, Th, Td, EmptyRow } from "../components/ui/Table";
import { useScopePicker } from "../hooks/useScopePicker";
import { getClassScores } from "../api/sbms";
import ConductReportModal from "../components/ConductReportModal";
import ClassConductReportModal from "../components/ClassConductReportModal";

export default function ClassReport() {
  const scope = useScopePicker({ needsStudent: false });
  const [scores, setScores] = useState(null);
  const [reportStudentId, setReportStudentId] = useState(null);
  const [reportsModalOpen, setReportsModalOpen] = useState(false);

  useEffect(() => {
    if (!scope.classId || !scope.termId || !scope.academicYearId) {
      setScores(null);
      return;
    }
    getClassScores({ classId: scope.classId, termId: scope.termId, academicYearId: scope.academicYearId }).then(
      setScores
    );
  }, [scope.classId, scope.termId, scope.academicYearId]);

  const canOpenReports = Boolean(scope.classId && scope.termId && scope.academicYearId) && scores?.length > 0;

  return (
    <Card
      actions={
        <Button variant="primary" onClick={() => setReportsModalOpen(true)} disabled={!canOpenReports}>
          <Download size={15} /> Download reports
        </Button>
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
        <ScopeGroup label="Term">
          <PillSelect
            options={scope.terms.map((t) => ({ id: t.id, label: t.name, locked: t.isLocked }))}
            value={scope.termId}
            onChange={scope.setTermId}
            emptyLabel="Pick a year first"
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

      <Table className="table-fixed min-w-[560px]">
        <Thead>
          <tr>
            <Th className="w-[18%]">Admission No.</Th>
            <Th className="w-[36%]">Student</Th>
            <Th className="w-[24%] text-center">Term Conduct /{scores?.[0]?.term.maxMarks ?? 40}</Th>
            <Th className="w-[22%] text-right">Report</Th>
          </tr>
        </Thead>
        <tbody>
          {!scope.classId || !scope.termId ? (
            <EmptyRow colSpan={4}>Pick a year, term, and class above.</EmptyRow>
          ) : scores === null ? (
            <EmptyRow colSpan={4}>Loading...</EmptyRow>
          ) : scores.length === 0 ? (
            <EmptyRow colSpan={4}>No students in this class.</EmptyRow>
          ) : (
            scores.map((s) => (
              <tr key={s.studentId}>
                <Td>
                  <span className="font-bold text-slate-800">{s.admissionNumber || "—"}</span>
                </Td>
                <Td className="font-medium text-slate-800">
                  {s.firstName} {s.lastName}
                </Td>
                <Td className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-bold tabular-nums text-slate-800">{s.term.remaining}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                        s.term.atRisk ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {s.term.atRisk ? "At Risk" : "Good"}
                    </span>
                  </div>
                </Td>
                <Td className="text-right">
                  <button
                    onClick={() => setReportStudentId(s.studentId)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-500 transition-colors hover:border-brand-400 hover:bg-brand-50"
                  >
                    <FileText size={13} /> View overall report
                  </button>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <ConductReportModal
        studentId={reportStudentId}
        termId={scope.termId}
        academicYearId={scope.academicYearId}
        onClose={() => setReportStudentId(null)}
      />
      {reportsModalOpen && (
        <ClassConductReportModal
          classId={scope.classId}
          termId={scope.termId}
          academicYearId={scope.academicYearId}
          onClose={() => setReportsModalOpen(false)}
        />
      )}
    </Card>
  );
}
