import { useEffect, useState } from "react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { FileText, Download } from "lucide-react";
import { Field, Select } from "../components/ui/FormField";
import { TermLockBadge } from "../components/ui/Alerts";
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
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
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
      </div>

      <Table>
        <Thead>
          <tr>
            <Th>Admission No.</Th>
            <Th>Student</Th>
            <Th>Guardian name</Th>
            <Th>Guardian phone</Th>
            <Th className="text-right">Report</Th>
          </tr>
        </Thead>
        <tbody>
          {!scope.classId || !scope.termId ? (
            <EmptyRow colSpan={5}>Pick a year, term, and class above.</EmptyRow>
          ) : scores === null ? (
            <EmptyRow colSpan={5}>Loading...</EmptyRow>
          ) : scores.length === 0 ? (
            <EmptyRow colSpan={5}>No students in this class.</EmptyRow>
          ) : (
            scores.map((s) => (
              <tr key={s.studentId}>
                <Td>
                  <span className="font-accent font-semibold text-base text-brand-500">
                    {s.admissionNumber || "—"}
                  </span>
                </Td>
                <Td className="font-medium text-slate-800">
                  {s.firstName} {s.lastName}
                </Td>
                <Td className="text-slate-600">{s.guardianName || "—"}</Td>
                <Td className="text-slate-600 tabular-nums">{s.guardianPhone || "—"}</Td>
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
